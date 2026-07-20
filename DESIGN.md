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

## Mark

A **knight silhouette**, amber on ink, used for the favicon, the app icons, the header, and the OG
image. Drawn from the Cburnett knight outline as a solid shape with the eye knocked out; the
internal line work in the original goes muddy below about 24px.

The brief warns against Staunton silhouettes as the obvious reach, and that holds for decoration.
A favicon is the exception: it has 16 pixels to say "chess" and no room for cleverness. Everywhere
the site has room to be less obvious, it is: real positions rather than piece clip art.

The header previously used an abstract bar echoing the eval rail, which read as a UI element rather
than an identity.

## Rating change

Four distinct states, because collapsing them hides real information:

| State | Shown | Meaning |
|---|---|---|
| Gained / lost | `+24`, `−18` | Coloured, weighted |
| No change | `±0` | The game genuinely moved nothing |
| Not computable | `—` | Nothing earlier in that pool has loaded yet |
| Unrated | `unrated` | Casual game, never affects rating |

`±0` and `—` used to render identically as nothing, because the code tested `if (delta)` and `0` is
falsy. A real zero and an unknown are different facts and must look different.

## Signature element

**The evaluation rail**, page-edge, full height, filled to the win rate across currently visible
games. It animates when filters change. Mobile 7px, desktop 16px. This is the one place boldness is
spent besides the hero.

## Result encoding

Results are written in **plain words**: `Won`, `Lost`, `Drew`.

An earlier version used crosstable notation (`1`, `0`, `½`) on the grounds that it is how results
are actually recorded. That was wrong for this audience. It reads instantly if you play tournaments
and means nothing if you don't, and the visitor here is someone annoyed who wants an answer, not a
scoresheet. Chess literacy is not the price of entry.

The word carries the result, so nothing depends on hue, which satisfies the colourblind requirement
structurally rather than by bolting a shape onto a colour.

The **rating change** (`+24`, `−18`) sits in the meta line at increased weight, coloured to match.
It is the number players actually feel, and it is the second thing the eye should find after the
result. The same rule applies to the tally above the list: `4 won, 5 lost`, not `+4 =0 −5`.

## Imagery

Boards are **data, not decoration**. The brief warned that checkerboards and Staunton silhouettes
are the first thing anyone reaches for, so every board on the site shows a real position:

- The hero shows the final position of the Opera Game, Morphy to Duke of Brunswick, Paris 1858,
  after 17.Rd8#. The most famous loss in chess, which is the point.
- The "Analyse my last loss" button shows the **actual final position of that loss**, rendered from
  the `fen` field chess.com returns. Board orientation flips when the player had black.
- **Every game row carries its own final position**, and that board *is* the result cell: the
  `Won` / `Lost` / `Drew` label sits directly beneath it. Boards are 60px on a phone, 76px above
  560px wide.
- Empty and error states carry a single piece rather than sitting as bare text.

Forty boards on screen is roughly 580 `<use>` nodes and pushes a full re-render to 24-48ms, past
the 16.7ms frame budget. The select filters re-render immediately because they fire once; the
search box is debounced 120ms so typing does not stutter under the cursor.

Squares are kept in the brand's warm range, and the dark square is deliberately light enough that
black pieces still read on it. Pieces are Cburnett (CC BY-SA 3.0), inlined once as an SVG sprite and
referenced with `<use>`, which keeps twelve pieces to roughly 3 kB gzipped.

Rows stay text. A board small enough to fit a list row is unreadable, and it would slow the scan
the list exists for.

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
