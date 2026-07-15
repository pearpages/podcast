# podcast

Turns a plain-text script into a single narrated MP3, with one voice or several.

The script is split into speaker turns, each turn is split into TTS-friendly chunks (on
paragraph boundaries, falling back to sentences for long paragraphs), each chunk is
synthesized separately through Microsoft Edge's free text-to-speech voices, and the
resulting audio is stitched back together with `ffmpeg` into one file.

## Script formats

Both formats are supported and detected automatically — there is no flag to pass.

**Single narrator** — plain prose with no labels, read in the `NARRATOR` voice:

```
Here's a question that keeps engineering managers up at night...

Let's start with the single most important idea...
```

**Multiple speakers** — prefix each turn with a label from the `voices` map:

```
HOST A: So here's a question every engineering manager secretly dreads.

HOST B: Right, and software makes that brutally hard.
```

Labels are stripped and never spoken aloud, each speaker gets their own voice, and a short
pause is inserted between turns. Turns are found by the labels themselves, not by line
breaks, so a script pasted as one unbroken blob parses the same as a neatly formatted one.
Speakers may appear in any order. `**Host A:**` and `[HOST A]` are accepted too, and
matching is case-insensitive.

## Prerequisites

- **Node and pnpm** — versions are pinned in `mise.toml` (Node 26). With [mise](https://mise.jdx.dev)
  installed, `mise install` sets them up.
- **ffmpeg on your PATH** — required at runtime for the stitching step. On macOS:
  `brew install ffmpeg`.

## Usage

```bash
pnpm install
pnpm build:audio input/two-hosts-script.txt   # two hosts
pnpm build:audio input/podcast-script.txt     # single narrator
```

The finished audio lands at `output/podcast.mp3`. Intermediate chunks are written to
`output/.chunks` and cleaned up on success.

Use `pnpm`, not `npx` — this package declares pnpm in `devEngines.packageManager`, and npm
refuses to run it.

## Configuration

Everything tunable lives in `lib/config.ts`:

| Setting | What it controls |
| --- | --- |
| `voices` | Speaker label → Edge voice ShortName, e.g. `en-US-AvaNeural`, `en-GB-RyanNeural` |
| `turnGapMs` | Silence inserted between speaker turns (default 600ms) |
| `outputFormat` | Codec, sample rate, and bitrate — defaults to 24kHz mono 96kbit MP3 |
| `prosody` | Speaking rate and pitch. Accepts relative values (`"-5%"`, `"+2st"`) as well as presets like `"slow"` |
| `maxCharsPerChunk` | Chunk size ceiling; keeps individual TTS requests reliable |
| `paths` | Where chunks and the final file are written |

The `voices` map is the only place speakers are defined — it doubles as the set of labels
the parser recognizes, so **adding a third speaker needs no code change**:

```ts
voices: {
  NARRATOR: "en-US-EmmaNeural",
  "HOST A": "en-US-EmmaNeural",
  "HOST B": "en-GB-RyanNeural",
  "GUEST": "en-AU-WilliamNeural",   // now GUEST: works in scripts
}
```

A label in the script that isn't in the map is reported as a warning and read as ordinary
dialogue, so a typo like `HOST C:` is visible rather than silently absorbed.

### Choosing voices

Microsoft's newer conversational voices sound markedly more natural than the older
generation (`AriaNeural`, `GuyNeural`, `JennyNeural`). For en-US there are only four:

| Voice | Character |
| --- | --- |
| `en-US-EmmaNeural` | Cheerful, clear, conversational |
| `en-US-AvaNeural` | Expressive, caring, pleasant, friendly |
| `en-US-AndrewNeural` | Warm, confident, authentic, honest |
| `en-US-BrianNeural` | Approachable, casual, sincere |

Everything else — including every non-US English voice — is the older generation. That's
worth knowing when casting a second speaker: the newer voices sound better, but there are
only two of each gender, so pairing may mean trading some naturalness for contrast. The
current cast pairs Emma with `en-GB-RyanNeural`, where the UK accent makes the two hosts
easy to tell apart.

The `*MultilingualNeural` variants are the same voices with cross-language support, useful
if a script mixes languages — not a different sound.

To list everything the service offers (322 voices, 17 for en-US), including the personality
tags quoted above:

```ts
const voices = await new MsEdgeTTS().getVoices();
```

## Layout

| Path | Purpose |
| --- | --- |
| `scripts/generate.ts` | Entry point; wires the pipeline together |
| `lib/parse.ts` | Splits the script into speaker turns by label |
| `lib/chunk.ts` | Splits each turn on paragraph, then sentence, boundaries |
| `lib/synthesize.ts` | One Edge TTS request per chunk, in that chunk's speaker's voice |
| `lib/stitch.ts` | Concatenates chunks via ffmpeg's concat demuxer (stream copy, no re-encode), and renders the inter-turn silence |
| `lib/config.ts` | Central settings |
