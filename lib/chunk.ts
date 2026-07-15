import type { Turn } from "./parse";

export interface Chunk {
  speaker: string;
  text: string;
  /** Index of the turn this chunk came from; turn changes get a pause. */
  turnIndex: number;
}

/**
 * Chunks every turn independently so that a chunk never spans two speakers
 * (each chunk is synthesized in exactly one voice).
 *
 * turnIndex is tracked rather than just comparing speakers, so that a speaker
 * taking two turns in a row still gets a pause between them.
 */
export function chunkTurns(turns: Turn[], maxChars: number): Chunk[] {
  return turns.flatMap((turn, turnIndex) =>
    chunkText(turn.text, maxChars).map((text) => ({
      speaker: turn.speaker,
      text,
      turnIndex,
    })),
  );
}

/**
 * Splits a long script into TTS-friendly chunks.
 *
 * Strategy: keep paragraphs whole wherever possible. If a single paragraph
 * is longer than the limit, fall back to sentence-level splitting. This keeps
 * natural pauses at paragraph/sentence boundaries and avoids cutting mid-thought.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = (): void => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (const sentence of splitSentences(paragraph)) {
        if ((current + " " + sentence).trim().length > maxChars) flush();
        current += (current ? " " : "") + sentence;
      }
      flush();
      continue;
    }

    if ((current + "\n\n" + paragraph).length > maxChars) flush();
    current += (current ? "\n\n" : "") + paragraph;
  }

  flush();
  return chunks;
}

/** Naive but reliable sentence splitter for prose scripts. */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  return (matches ?? [text]).map((s) => s.trim()).filter(Boolean);
}
