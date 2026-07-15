import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { MsEdgeTTS, type OUTPUT_FORMAT, type ProsodyOptions } from "msedge-tts";
import type { Chunk } from "./chunk";

export interface SynthesizeOptions {
  voices: Record<string, string>;
  outputFormat: OUTPUT_FORMAT;
  prosody?: ProsodyOptions;
  chunksDir: string;
  onProgress?: (done: number, total: number, unit: string) => void;
}

/**
 * Synthesizes one text chunk to its own mp3 file and returns the path.
 *
 * A fresh connection is used per chunk on purpose: the underlying WebSocket
 * closes after each synthesis, so a new instance per chunk is the reliable
 * pattern and keeps each chunk independently retryable.
 */
export async function synthesizeChunk(
  chunk: Chunk,
  index: number,
  { voices, outputFormat, prosody, chunksDir }: SynthesizeOptions,
): Promise<string> {
  const voice = voices[chunk.speaker];
  if (!voice) {
    throw new Error(
      `No voice configured for speaker "${chunk.speaker}". ` +
        `Configured speakers: ${Object.keys(voices).join(", ")}.`,
    );
  }

  await mkdir(chunksDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, outputFormat);

  const filePath = path.join(chunksDir, `chunk-${String(index).padStart(4, "0")}.mp3`);
  const { audioStream } = tts.toStream(chunk.text, prosody);

  try {
    await pipeline(audioStream, createWriteStream(filePath));
  } finally {
    tts.close();
  }

  return filePath;
}

/** Synthesizes every chunk in order and returns the file paths in order. */
export async function synthesizeAll(
  chunks: Chunk[],
  options: SynthesizeOptions,
): Promise<string[]> {
  const files: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    options.onProgress?.(index, chunks.length, "chunk");
    files.push(await synthesizeChunk(chunk, index, options));
  }
  options.onProgress?.(chunks.length, chunks.length, "chunk");
  return files;
}
