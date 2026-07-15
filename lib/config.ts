import path from "node:path";
import { OUTPUT_FORMAT, type ProsodyOptions } from "msedge-tts";

export type ProviderName = "gemini" | "edge";

export interface EdgeConfig {
  voices: Record<string, string>;
  prosody: ProsodyOptions;
  outputFormat: OUTPUT_FORMAT;
  turnGapMs: number;
  maxCharsPerChunk: number;
}

export interface GeminiConfig {
  model: string;
  apiKeyEnvVar: string;
  voices: Record<string, string>;
  style: string;
  maxCharsPerGroup: number;
  bitrateKbps: number;
}

/**
 * Central knobs for the pipeline.
 *
 * Voices live per-engine on purpose: the two use unrelated naming (Edge wants
 * "en-US-EmmaNeural", Gemini wants "Leda"), so there is no shared value to
 * factor out. The speaker labels -- the map keys -- are what must agree, since
 * they double as the labels the parser recognizes in a script.
 */
export const config = {
  /** Engine used when no --provider flag is passed. */
  provider: "gemini" as ProviderName,

  paths: {
    chunksDir: path.resolve("output/.chunks"),
    outputFile: path.resolve("output/podcast.mp3"),
  },

  /** Google Gemini: renders a whole exchange per request, so turn-taking is real. */
  gemini: {
    model: "gemini-2.5-flash-preview-tts",
    apiKeyEnvVar: "GEMINI_API_KEY",

    /**
     * Speaker label -> Gemini prebuilt voice. Gemini documents no gender or
     * accent for its voices (only a timbre word each), so these were picked by
     * ear and accent is steered through `style` below instead.
     */
    voices: {
      NARRATOR: "Leda",
      "HOST A": "Leda",
      "HOST B": "Charon",
    } as Record<string, string>,

    /** Prepended to every request. The only place delivery can be directed. */
    style:
      "Read this as a natural, relaxed two-host podcast conversation. " +
      "HOST A is a curious American woman asking the questions. " +
      "HOST B is a warm, confident British man explaining the answers. " +
      "Keep it conversational and unhurried, not like an announcer reading copy.",

    /**
     * Turns are packed into groups of about this many characters, and each group
     * costs one API request.
     *
     * This is set high deliberately. The free tier allows only 10 TTS requests
     * PER DAY, so a 2000-char budget would split a typical episode into 5
     * requests and burn half the daily quota per render. Gemini's context is 32k
     * tokens, so a whole ~7.6k-char script fits in one request.
     *
     * The counterweight: Google documents that quality "may begin to drift" past
     * a few minutes of output. If long renders drift audibly, lower this and pay
     * in quota.
     */
    maxCharsPerGroup: 12000,

    /** The API returns raw PCM; this is the mp3 bitrate it gets encoded to. */
    bitrateKbps: 96,
  } satisfies GeminiConfig,

  /** Microsoft Edge: free, no API key, one clip per turn stitched with gaps. */
  edge: {
    /** Any Edge "ShortName", e.g. en-US-EmmaNeural, en-GB-RyanNeural. */
    voices: {
      NARRATOR: "en-US-EmmaNeural",
      "HOST A": "en-US-EmmaNeural",
      "HOST B": "en-GB-RyanNeural",
    } as Record<string, string>,

    /** Rate/pitch accept relative values ("-5%", "+2st") as well as the presets. */
    prosody: { rate: "default", pitch: "default" } as ProsodyOptions,

    /** 96 kbit mono mp3 is a good podcast sweet spot (quality vs. size). */
    outputFormat: OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,

    /** Silence inserted between speaker turns. Gemini needs no equivalent. */
    turnGapMs: 600,

    /** Max characters per synthesis request. Keeps requests reliable. */
    maxCharsPerChunk: 2000,
  } satisfies EdgeConfig,
};

/** Speaker labels the parser recognizes, taken from the active engine's voices. */
export function speakersFor(provider: ProviderName): string[] {
  return Object.keys(config[provider].voices);
}
