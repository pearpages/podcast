import { execFile } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { GoogleGenAI } from "@google/genai";
import type { Turn } from "../parse";
import { groupTurns } from "../chunk";
import type { RenderContext, TtsProvider } from "./types";
import type { GeminiConfig } from "../config";

const run = promisify(execFile);

/** Gemini's multi-speaker TTS caps out here; a third voice needs a different engine. */
const MAX_SPEAKERS = 2;

/**
 * Google Gemini multi-speaker TTS.
 *
 * Unlike Edge, this renders a whole exchange in one request and handles the
 * turn-taking itself, so no silence is spliced between turns -- that's the point
 * of using it. Groups exist only because the docs warn quality drifts on long
 * inputs, so each group is a self-contained conversation.
 */
export function createGeminiProvider(cfg: GeminiConfig): TtsProvider {
  const apiKey = process.env[cfg.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnvVar} is not set. Get a free key at https://aistudio.google.com/apikey, ` +
        `then put it in .env (gitignored) or export it.\n` +
        `To render without an API key, use the Edge engine: pnpm build:audio:edge <script>`,
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",

    async render(turns, { workDir, onProgress }: RenderContext): Promise<string[]> {
      const speakers = [...new Set(turns.map((t) => t.speaker))];
      if (speakers.length > MAX_SPEAKERS) {
        throw new Error(
          `Gemini supports at most ${MAX_SPEAKERS} speakers, but this script has ${speakers.length}: ` +
            `${speakers.join(", ")}.\nRender it with the Edge engine instead: pnpm build:audio:edge <script>`,
        );
      }
      for (const speaker of speakers) {
        if (!cfg.voices[speaker]) {
          throw new Error(
            `No Gemini voice configured for speaker "${speaker}". ` +
              `Configured: ${Object.keys(cfg.voices).join(", ")}.`,
          );
        }
      }

      await mkdir(workDir, { recursive: true });
      const groups = groupTurns(turns, cfg.maxCharsPerGroup);

      const files: string[] = [];
      for (const [index, group] of groups.entries()) {
        onProgress?.(index, groups.length, "group");
        files.push(await renderGroup(ai, cfg, group, speakers, index, workDir));
      }
      onProgress?.(groups.length, groups.length, "group");

      return files;
    },
  };
}

async function renderGroup(
  ai: GoogleGenAI,
  cfg: GeminiConfig,
  group: Turn[],
  speakers: string[],
  index: number,
  workDir: string,
): Promise<string> {
  const transcript = group.map((t) => `${t.speaker}: ${t.text}`).join("\n");

  // Single-speaker scripts must use voiceConfig; multiSpeakerVoiceConfig is
  // mutually exclusive with it and rejects a lone speaker.
  const speechConfig =
    speakers.length === 1
      ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voices[speakers[0]!]! } } }
      : {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: speakers.map((speaker) => ({
              speaker,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voices[speaker]! } },
            })),
          },
        };

  const response = await ai.models.generateContent({
    model: cfg.model,
    contents: [{ parts: [{ text: `${cfg.style}\n\n${transcript}` }] }],
    config: { responseModalities: ["AUDIO"], speechConfig },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const data = part?.inlineData?.data;
  if (!data) {
    const reason = response.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned no audio for group ${index + 1} (finishReason: ${reason}).`);
  }

  // The API returns headerless PCM, e.g. "audio/L16;codec=pcm;rate=24000".
  // Encode to mp3 here so every group matches and stitchAudio can stream-copy.
  const rate = /rate=(\d+)/.exec(part.inlineData?.mimeType ?? "")?.[1] ?? "24000";
  const stem = path.join(workDir, `group-${String(index).padStart(4, "0")}`);
  const rawPath = `${stem}.pcm`;
  const mp3Path = `${stem}.mp3`;

  await writeFile(rawPath, Buffer.from(data, "base64"));
  try {
    await run("ffmpeg", [
      "-y", "-v", "error",
      "-f", "s16le", "-ar", rate, "-ac", "1",
      "-i", rawPath,
      "-c:a", "libmp3lame", "-b:a", `${cfg.bitrateKbps}k`,
      mp3Path,
    ]);
  } finally {
    await rm(rawPath, { force: true });
  }

  return mp3Path;
}
