export interface Turn {
  speaker: string;
  text: string;
}

/** Speaker used for scripts that carry no labels at all. */
export const NARRATOR = "NARRATOR";

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a script into speaker turns.
 *
 * Turns are found by anchoring on the *known* labels rather than on line breaks:
 * scripts are often pasted as one unbroken blob, and a generic /\w+:/ pattern
 * would match colons inside ordinary prose. Matching only configured speakers
 * avoids both problems.
 *
 * A script with no labels becomes a single NARRATOR turn, which is what keeps
 * plain single-voice scripts working unchanged.
 */
export function parseTurns(text: string, speakers: string[]): Turn[] {
  // Longest first, so "HOST A" can't match inside a longer "HOST AB".
  const ordered = [...speakers].sort((a, b) => b.length - a.length);
  const labels = ordered.map(escapeRegex).join("|");

  // Each accepted spelling is matched whole, then the speaker is read back out
  // of the match. Note the bracket form has no colon, so the colon cannot be
  // required globally -- but it also must not be optional globally, or a bare
  // mention of a name in dialogue would start a spurious turn.
  const labelPattern = new RegExp(
    [
      `\\*\\*\\s*(?:${labels})\\s*:?\\s*\\*\\*\\s*:?`, // **HOST A:** / **HOST A**:
      `\\[\\s*(?:${labels})\\s*\\]\\s*:?`, //             [HOST A] / [HOST A]:
      `(?:${labels})\\s*:`, //                            HOST A:
    ].join("|") + `\\s*`,
    "gi",
  );

  const matches = [...text.matchAll(labelPattern)];

  if (matches.length === 0) {
    const body = normalize(text);
    return body ? [{ speaker: NARRATOR, text: body }] : [];
  }

  const preamble = text.slice(0, matches[0]!.index).trim();
  if (preamble) {
    throw new Error(
      `Script has text before the first speaker label: "${truncate(preamble)}".\n` +
        `Every line must belong to a speaker, or the script must have no labels at all.`,
    );
  }

  const turns: Turn[] = [];
  for (const [i, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    const body = normalize(text.slice(start, end));
    if (!body) continue;

    const matched = match[0].toLowerCase();
    const speaker = ordered.find((s) => matched.includes(s.toLowerCase()))!;
    turns.push({ speaker, text: body });
  }

  return turns;
}

/**
 * Reports label-shaped text that isn't a configured speaker, e.g. a typo'd
 * "HOST C:" that would otherwise be silently absorbed into the previous turn.
 *
 * Deliberately advisory: dialogue can legitimately contain "SOMETHING:", so a
 * false positive must not fail an otherwise valid script.
 */
export function findUnknownLabels(text: string, speakers: string[]): Map<string, number> {
  const known = new Set(speakers.map((s) => s.toLowerCase()));
  const found = new Map<string, number>();

  for (const match of text.matchAll(/(?:^|[\s.!?"”])([A-Z][A-Z0-9 _'-]{1,20}?)\s*:\s/g)) {
    const label = match[1]!.trim();
    if (known.has(label.toLowerCase())) continue;
    found.set(label, (found.get(label) ?? 0) + 1);
  }

  return found;
}

/**
 * Tidies a turn's text while *preserving blank lines*: paragraph breaks are
 * what chunkText splits on, and they become natural pauses in the read.
 * Collapsing them into spaces would silently reflow the whole script.
 */
const normalize = (s: string): string =>
  s
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
const truncate = (s: string): string => (s.length > 60 ? `${s.slice(0, 60)}...` : s);
