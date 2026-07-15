import { readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { config, speakersFor, type ProviderName } from "../lib/config";
import { parseTurns, findUnknownLabels } from "../lib/parse";
import { stitchAudio } from "../lib/stitch";
import { createEdgeProvider } from "../lib/providers/edge";
import { createGeminiProvider } from "../lib/providers/gemini";
import type { TtsProvider } from "../lib/providers/types";

const PROVIDERS: Record<ProviderName, () => TtsProvider> = {
  gemini: () => createGeminiProvider(config.gemini),
  edge: () => createEdgeProvider(config.edge),
};

function parseArgs(argv: string[]): { inputPath?: string; provider: ProviderName } {
  let provider = config.provider;
  let inputPath: string | undefined;

  for (const arg of argv) {
    const flag = /^--provider(?:=(.*))?$/.exec(arg);
    if (flag) {
      const value = flag[1];
      if (!value || !(value in PROVIDERS)) {
        throw new Error(
          `--provider must be one of: ${Object.keys(PROVIDERS).join(", ")}` +
            (value ? ` (got "${value}")` : ""),
        );
      }
      provider = value as ProviderName;
      continue;
    }
    inputPath ??= arg;
  }

  return { inputPath, provider };
}

async function main(): Promise<void> {
  const { inputPath, provider: providerName } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    console.error("Usage: pnpm build:audio <path-to-script.txt> [--provider=gemini|edge]");
    process.exit(1);
  }

  console.log(`Reading ${inputPath}`);
  const script = await readFile(inputPath, "utf8");

  const speakers = speakersFor(providerName);
  const turns = parseTurns(script, speakers);
  if (turns.length === 0) throw new Error(`${inputPath} has no speakable text.`);

  const turnCounts = new Map<string, number>();
  for (const turn of turns) turnCounts.set(turn.speaker, (turnCounts.get(turn.speaker) ?? 0) + 1);
  const summary = [...turnCounts].map(([speaker, n]) => `${speaker} x${n}`).join(", ");
  console.log(`Parsed ${turns.length} turn(s): ${summary}`);

  for (const [label, count] of findUnknownLabels(script, speakers)) {
    console.warn(`  ! "${label}:" (x${count}) is not a configured speaker - reading it as dialogue`);
  }

  // Construct before any cleanup: a missing API key should fail before we
  // delete the previous render.
  const provider = PROVIDERS[providerName]();
  console.log(`Synthesizing with ${provider.name}...`);

  await rm(config.paths.chunksDir, { recursive: true, force: true });
  await mkdir(path.dirname(config.paths.outputFile), { recursive: true });

  const files = await provider.render(turns, {
    workDir: config.paths.chunksDir,
    onProgress: (done, total, unit) => {
      process.stdout.write(`  -> ${unit} ${Math.min(done + 1, total)}/${total}\r`);
      if (done === total) process.stdout.write("\n");
    },
  });

  console.log("Stitching...");
  await stitchAudio(files, config.paths.outputFile);

  await rm(config.paths.chunksDir, { recursive: true, force: true });
  console.log(`\nDone: ${config.paths.outputFile}`);
}

main().catch((err: unknown) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
