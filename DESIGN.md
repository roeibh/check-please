# Design system

## Aesthetic lane

**The pairing sheet.** Weekend swiss tournaments print pairings on saturated copy paper and tape
them to the wall; everyone crowds around to find their board. That is the object this site is: a
sheet you scan fast, standing up, to find one line that matters.

Not editorial-typographic. Not terminal-brutalist. Not a dashboard.

## Typography

Selection procedure, recorded so it is not silently redone by reflex:

1. **Voice words:** blunt, mechanical, quick.
2. **Reflex picks, rejected:** IBM Plex Sans, IBM Plex Mono, Inter, Space Grotesk. All are
   training-data defaults on the reflex-reject list. The first build shipped two of them.
3. **Physical object:** duplicated pairing sheets, a clock flag, a pencilled scoresheet.
4. **Chosen:**
   - **Familjen Grotesk** (400 to 700, variable) carries display and body. A Swedish grotesque with
     odd, memorable letterforms; it holds up huge and stays readable at 15px. One family, strong
     weight contrast, small payload.
   - **Fragment Mono** for notation only: ratings, deltas, move counts, clocks, timestamps. Mono is
     not costume here. Chess results are tabular data and belong in aligned columns.

Scale is fluid `clamp()`, ratio ≥1.25 between steps. Dark surfaces get +0.06 line-height.

## Color

**Strategy: Committed.** A saturated field carries the hero. The previous build was Restrained
(ink plus one accent under 10%), which is the exact anti-reference the brief names.

Reference point: goldenrod copy paper under fluorescent light, with ink stamped on it.

All values are OKLCH. No pure black or white anywhere; every neutral is tinted toward the flag hue.

| Token | Light | Role |
|---|---|---|
| `--flag` | `oklch(0.79 0.155 71)` | Goldenrod. Carries the hero as a full field, not a button accent. |
| `--ink` | `oklch(0.20 0.03 258)` | Blue-tinted near-black. Type on flag, surface in dark mode. |
| `--paper` | `oklch(0.96 0.012 88)` | Warm bone, tinted toward flag. Never `#fff`. |
| `--win` | `oklch(0.60 0.115 162)` | Crosstable `1`. |
| `--loss` | `oklch(0.57 0.165 20)` | Crosstable `0`. |
| `--draw` | `oklch(0.63 0.025 258)` | Crosstable `½`. |

Art direction differs by section, which the brand register permits: the landing hero is a drenched
flag field; the results view is quiet paper or ink so the data reads.

## Signature element

**The evaluation rail**, page-edge, full height, filled to the win rate across currently visible
games. It animates when filters change. Mobile 7px, desktop 16px. This is the one place boldness is
spent besides the hero.

## Result encoding

Results use **crosstable notation**: `1`, `0`, `½`. This is how results are actually written in a
tournament crosstable, and it satisfies the accessibility requirement structurally: the glyph
carries the meaning, colour only reinforces it. Never hue alone.

## Layout

- No cards. Rows are flat banded blocks, the way a printed pairing sheet bands its lines.
- **No side-stripe borders.** The first build used a coloured left edge on each row; that is an
  absolute ban and it was rebuilt as a crosstable result cell.
- Left-aligned, single column, max 660px. Phone layout designed first.
- Tap targets 44px minimum.

## Motion

One staggered reveal on list render, ease-out-quart, no bounce. `prefers-reduced-motion` disables
it. Never animate layout properties.

## Copy

No em dashes. Sentence case. Plain verbs.
