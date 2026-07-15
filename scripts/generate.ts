import { readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "../lib/config";
import { parseTurns, findUnknownLabels } from "../lib/parse";
import { chunkTurns, type Chunk } from "../lib/chunk";
import { synthesizeAll } from "../lib/synthesize";
import { stitchAudio, makeSilence } from "../lib/stitch";

/**
 * Interleaves a silence file between chunks whenever the turn changes, so the
 * pause lands between speakers rather than inside one speaker's chunked turn.
 */
function withGaps(chunks: Chunk[], files: string[], silence: string): string[] {
  return files.flatMap((file, i) => {
    const next = chunks[i + 1];
    const isTurnEnd = next !== undefined && next.turnIndex !== chunks[i]!.turnIndex;
    return isTurnEnd ? [file, silence] : [file];
  });
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: pnpm build:audio <path-to-script.txt>");
    process.exit(1);
  }

  console.log(`Reading ${inputPath}`);
  const script = await readFile(inputPath, "utf8");

  const speakers = Object.keys(config.voices);
  const turns = parseTurns(script, speakers);
  if (turns.length === 0) throw new Error(`${inputPath} has no speakable text.`);

  const turnCounts = new Map<string, number>();
  for (const turn of turns) turnCounts.set(turn.speaker, (turnCounts.get(turn.speaker) ?? 0) + 1);
  const summary = [...turnCounts].map(([speaker, n]) => `${speaker} x${n}`).join(", ");
  console.log(`Parsed ${turns.length} turn(s): ${summary}`);

  for (const [label, count] of findUnknownLabels(script, speakers)) {
    console.warn(`  ! "${label}:" (x${count}) is not a configured speaker - reading it as dialogue`);
  }

  const chunks = chunkTurns(turns, config.maxCharsPerChunk);
  console.log(`Split into ${chunks.length} chunk(s)`);

  await rm(config.paths.chunksDir, { recursive: true, force: true });
  await mkdir(path.dirname(config.paths.outputFile), { recursive: true });

  console.log("Synthesizing...");
  const files = await synthesizeAll(chunks, {
    voices: config.voices,
    outputFormat: config.outputFormat,
    prosody: config.prosody,
    chunksDir: config.paths.chunksDir,
  });

  console.log("Stitching...");
  const needsGaps = turns.length > 1 && config.turnGapMs > 0;
  const ordered = needsGaps
    ? withGaps(
        chunks,
        files,
        await makeSilence(
          config.turnGapMs,
          files[0]!,
          path.join(config.paths.chunksDir, "gap.mp3"),
        ),
      )
    : files;

  await stitchAudio(ordered, config.paths.outputFile);

  await rm(config.paths.chunksDir, { recursive: true, force: true });
  console.log(`\nDone: ${config.paths.outputFile}`);
}

main().catch((err: unknown) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
