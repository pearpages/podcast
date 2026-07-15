# podcast

Turns a plain-text script into a single narrated MP3, with one voice or several.

The script is split into speaker turns, those turns are sent to a speech engine, and the
resulting audio is stitched together with `ffmpeg` into one file.

## Engines

Two engines are supported. They differ in more than voice quality — they differ in *how*
they produce a conversation, which is the thing that makes multi-host audio sound real or
fake.

| | `gemini` (default) | `edge` |
| --- | --- | --- |
| Turn-taking | Generates the whole exchange at once, so hosts respond to each other | One clip per turn, glued together with inserted silence |
| API key | **Required** (`GEMINI_API_KEY`) | None |
| Cost | Free tier: **10 requests/day** | Free, unlimited |
| Speakers | **Max 2** | Unlimited |
| Status | Preview model — may change | Stable |

```bash
pnpm build:audio input/two-hosts-script.txt          # gemini (default)
pnpm build:audio:gemini input/two-hosts-script.txt   # explicit
pnpm build:audio:edge input/two-hosts-script.txt     # no API key needed
```

**Gemini setup**: get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and put it in `.env` (gitignored — see `.env.example`):

```
GEMINI_API_KEY=your-key-here
```

⚠️ **The free tier allows only 10 TTS requests per day.** Each render costs one request
(`gemini.maxCharsPerGroup` is set high enough to fit a whole episode in a single call), so
that's ~10 renders/day. Google's free tier also generally uses submitted data to improve
their products. `edge` needs no key and has no quota, which is why it stays as a fallback.

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

Everything tunable lives in `lib/config.ts`. `provider` picks the default engine; the rest
is grouped per engine, because the two share almost nothing — Gemini wants `"Leda"` where
Edge wants `"en-US-EmmaNeural"`.

| `gemini` | What it controls |
| --- | --- |
| `voices` | Speaker label → Gemini prebuilt voice (`Leda`, `Charon`, `Kore`, …) |
| `style` | Natural-language direction prepended to every request — **the only way to steer delivery**, including accent |
| `model` | Defaults to `gemini-2.5-flash-preview-tts` |
| `maxCharsPerGroup` | Characters per API request. **One request per render** at the default; lower it if long output drifts, at the cost of quota |
| `bitrateKbps` | The API returns raw PCM; this is the mp3 bitrate it's encoded to |

| `edge` | What it controls |
| --- | --- |
| `voices` | Speaker label → Edge voice ShortName (`en-US-EmmaNeural`, `en-GB-RyanNeural`, …) |
| `prosody` | Rate and pitch. Accepts relative values (`"-5%"`, `"+2st"`) and presets like `"slow"` |
| `turnGapMs` | Silence inserted between turns (default 600ms). Gemini needs no equivalent |
| `outputFormat` | Codec, sample rate, bitrate — defaults to 24kHz mono 96kbit MP3 |
| `maxCharsPerChunk` | Chunk size ceiling; keeps individual requests reliable |

A `voices` map doubles as the set of labels the parser recognizes, so on `edge`, **adding a
third speaker needs no code change**:

```ts
edge: {
  voices: {
    NARRATOR: "en-US-EmmaNeural",
    "HOST A": "en-US-EmmaNeural",
    "HOST B": "en-GB-RyanNeural",
    "GUEST": "en-AU-WilliamNeural",   // now GUEST: works in scripts
  },
}
```

**Gemini caps at 2 speakers** and errors out if a script has more, pointing you at `edge`.

Gemini also documents **no gender or accent** for its voices — only a timbre word each
(`Kore`–Firm, `Puck`–Upbeat, `Leda`–Youthful). Accent is steered through `style` instead,
which is why the config reads "HOST B is a warm, confident British man" rather than naming
a British voice.

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
