import path from "node:path";
import { OUTPUT_FORMAT, type ProsodyOptions } from "msedge-tts";

/**
 * Central knobs for the pipeline. Change the voice, quality, or chunk size
 * here; nothing else needs to know about these values.
 */
export const config = {
  /**
   * Speaker label -> Edge "ShortName" voice, e.g. en-US-AriaNeural.
   *
   * Labels are matched case-insensitively and double as the set the parser
   * splits on, so adding a speaker here is all it takes to support one.
   * NARRATOR covers scripts with no labels at all, and can also be used
   * explicitly to mix narration into a multi-speaker script.
   */
  voices: {
    NARRATOR: "en-US-EmmaNeural",
    "HOST A": "en-US-EmmaNeural",
    "HOST B": "en-GB-RyanNeural",
  } as Record<string, string>,

  /** Silence inserted between speaker turns. */
  turnGapMs: 600,

  /** 96 kbit mono mp3 is a good podcast sweet spot (quality vs. size). */
  outputFormat: OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,

  /** Rate/pitch accept relative values ("-5%", "+2st") as well as the presets. */
  prosody: { rate: "default", pitch: "default" } as ProsodyOptions,

  /** Max characters per synthesis request. Keeps requests reliable. */
  maxCharsPerChunk: 2000,

  paths: {
    chunksDir: path.resolve("output/.chunks"),
    outputFile: path.resolve("output/podcast.mp3"),
  },
} as const;