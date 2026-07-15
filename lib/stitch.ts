import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Renders a silent mp3 that can be concatenated with `-c copy` alongside real
 * chunks, used to put a beat between speaker turns.
 *
 * Parameters are probed from an existing chunk rather than hardcoded, so the
 * silence keeps matching if the output format in config changes. `-write_xing 0`
 * is load-bearing: the Xing/LAME header frame is otherwise read as audio by the
 * concat demuxer, which makes ffmpeg emit non-monotonic DTS errors at every splice.
 */
export async function makeSilence(
  durationMs: number,
  likeFile: string,
  outPath: string,
): Promise<string> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=sample_rate,channels",
    "-show_entries", "format=bit_rate",
    "-of", "default=noprint_wrappers=1:nokey=0",
    likeFile,
  ]);

  const read = (key: string): string => stdout.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim() ?? "";
  const sampleRate = read("sample_rate") || "24000";
  const channels = read("channels") === "2" ? "stereo" : "mono";
  const bitrate = Math.round(Number(read("bit_rate") || 96000) / 1000);

  await run("ffmpeg", [
    "-y",
    "-v", "error",
    "-f", "lavfi",
    "-i", `anullsrc=r=${sampleRate}:cl=${channels}`,
    "-t", (durationMs / 1000).toFixed(3),
    "-c:a", "libmp3lame",
    "-b:a", `${bitrate}k`,
    "-write_xing", "0",
    outPath,
  ]);

  return outPath;
}

/**
 * Concatenates mp3 chunks into a single file using ffmpeg's concat demuxer.
 * Every chunk shares the same codec and bitrate (same TTS settings), so we
 * stream-copy (`-c copy`) instead of re-encoding: faster and lossless.
 */
export async function stitchAudio(files: string[], outputPath: string): Promise<void> {
  if (files.length === 0) throw new Error("No audio chunks to stitch.");

  const listPath = path.join(path.dirname(files[0]!), "concat.txt");
  const listBody = files.map((f) => `file '${path.resolve(f)}'`).join("\n");
  await writeFile(listPath, listBody, "utf8");

  try {
    await run("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      outputPath,
    ]);
  } finally {
    await unlink(listPath).catch(() => {});
  }
}