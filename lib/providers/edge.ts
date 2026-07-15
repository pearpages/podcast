import path from "node:path";
import type { Turn } from "../parse";
import { chunkTurns, type Chunk } from "../chunk";
import { synthesizeAll } from "../synthesize";
import { makeSilence } from "../stitch";
import type { RenderContext, TtsProvider } from "./types";
import type { EdgeConfig } from "../config";

/**
 * Microsoft Edge's free TTS. No API key, no quota, always available -- which is
 * why it stays in the tree as a fallback for when the Gemini preview model moves.
 *
 * Renders one clip per chunk and splices silence between turns, because each
 * request only knows about its own line.
 */
export function createEdgeProvider(cfg: EdgeConfig): TtsProvider {
  return {
    name: "edge",

    async render(turns, { workDir, onProgress }: RenderContext): Promise<string[]> {
      const chunks = chunkTurns(turns, cfg.maxCharsPerChunk);

      const files = await synthesizeAll(chunks, {
        voices: cfg.voices,
        outputFormat: cfg.outputFormat,
        prosody: cfg.prosody,
        chunksDir: workDir,
        onProgress,
      });

      if (turns.length < 2 || cfg.turnGapMs <= 0) return files;

      const gap = await makeSilence(cfg.turnGapMs, files[0]!, path.join(workDir, "gap.mp3"));
      return withGaps(chunks, files, gap);
    },
  };
}

/** Splices the silence file in wherever the turn changes -- never inside a turn. */
function withGaps(chunks: Chunk[], files: string[], silence: string): string[] {
  return files.flatMap((file, i) => {
    const next = chunks[i + 1];
    const isTurnEnd = next !== undefined && next.turnIndex !== chunks[i]!.turnIndex;
    return isTurnEnd ? [file, silence] : [file];
  });
}
