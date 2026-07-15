import type { Turn } from "../parse";

export interface RenderContext {
  /** Scratch directory for intermediate audio. The caller cleans it up. */
  workDir: string;
  /** Reports progress as units complete; units differ per provider. */
  onProgress?: (done: number, total: number, unit: string) => void;
}

/**
 * A speech engine.
 *
 * Each provider owns its own strategy for splitting a script and for pacing
 * between turns, because those differ fundamentally: Edge renders one clip per
 * turn and needs silence inserted between them, while Gemini renders a whole
 * exchange at once and handles turn-taking itself. So the contract is only
 * "here are the turns, give me audio files to concatenate in order".
 */
export interface TtsProvider {
  readonly name: string;
  /** Ordered audio files, ready to concatenate into the finished episode. */
  render(turns: Turn[], ctx: RenderContext): Promise<string[]>;
}
