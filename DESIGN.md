# Design system

## Aesthetic lane

**A quiet results table you scan standing up.** The reference object is still the pairing sheet
taped to a tournament wall: you find your line, you leave. But the execution is restrained rather
than loud, on shadcn/ui's token system, because the visitor is annoyed and wants an answer.

The site's character comes from the boards, the notation-set mono, and the brass accent, not from
covering things in colour.

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

**System: shadcn/ui tokens, implemented in plain CSS.** Same naming (`name` / `name-foreground`),
same OKLCH space, same `--radius: 0.625rem` scale. No React, Tailwind or Radix: that costs roughly
150 kB against a 10 kB budget, and shadcn's theming layer is CSS variables, so it ports without them.

**Strategy: restrained.** Tinted neutrals carry the surface; a muted brass accent stays under ~10%
of it, on the primary button, focus rings, and the rail.

An earlier build was Committed, with a saturated goldenrod `oklch(0.79 0.155 71)` as a full-bleed
hero field. It was painful to look at. The lesson is that the strategy was wrong before the hue was:
a large area of high-chroma colour is uncomfortable whatever the hue.

| Token | Light | Role |
|---|---|---|
| `--background` / `--foreground` | `oklch(0.988 0.003 80)` / `oklch(0.185 0.013 265)` | Page surface and text |
| `--card` | `oklch(1 0.001 80)` | Rows, buttons, popovers |
| `--muted` / `--muted-foreground` | `oklch(0.966 0.004 80)` / `oklch(0.505 0.014 265)` | Hover, secondary text |
| `--primary` | `oklch(0.548 0.104 68)` | Brass. The accent, and the only saturated colour |
| `--border` / `--input` / `--ring` | `oklch(0.915 …)` / `oklch(0.905 …)` / `oklch(0.62 0.098 72)` | Edges and focus |
| `--win` / `--loss` / `--draw` | `oklch(0.505 0.105 162)` / `oklch(0.505 0.16 24)` / `oklch(0.50 0.022 265)` | Result labels |

Dark mode has its own values for all of these, including a separate board-square pair so the board
does not glare against a dark surface. Neutrals are tinted (never pure black or white).

`--primary` sat at `oklch(0.585 …)` until it was measured at 4.22:1 against its foreground, under AA.


## Mark

A **knight from the `spatial` set** (Maurizio Monge, MIT), in brass on ink, used for the favicon,
app icons, header and OG image. The set is gradient-shaded and looks best large, which suits a logo.

The brief warns against Staunton silhouettes as the obvious reach, and that holds for decoration.
A favicon is the exception: it has 16 pixels to say "chess" and no room for cleverness.


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
games. It animates when filters change.

**3px, not 16px.** A full-height 16px bar of accent was a large share of the accent budget on its
own, and most of what made the old palette shout. At 3px it still reads as a persistent indicator
without competing with the content.

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

Squares are warm, with a separate darker pair in dark mode so the board does not glare against a
dark surface. They stay far enough apart in lightness that white and black pieces both read.

Board pieces are **cburnett** (CC BY-SA 3.0), inlined once as an SVG sprite and referenced with
`<use>`: twelve pieces for about 2.3 kB gzipped. The logo uses **spatial** (MIT) instead. See
`AGENTS.md` for why the boards are not on the prettier set: it is a legibility result measured at
68px, not a taste call.

Boards are drawn lazily by an `IntersectionObserver` as rows approach the viewport. Drawing forty
up front cost about 2 seconds of render delay on a throttled phone. The cell reserves its square
with `aspect-ratio`, so a board arriving later shifts nothing.

## Layout

- The list is **one bordered surface with dividers**, shadcn's table shape, not a stack of floating
  cards. The only true card on the page is the "Analyse my last loss" block, because it is the one
  headline action.
- **No side-stripe borders.** An early build used a coloured left edge on each row; that is an
  absolute ban and it was rebuilt as the board-plus-label result cell.
- Left-aligned, single column, max 760px, one measure for every container. A second width made the
  header and footer stop sharing a left edge with the hero, which read as broken.
- Tap targets 44px minimum. Phone layout designed first.
- `padding-block`, never the `padding` shorthand, on anything that is also a `.wrap`.

## Motion

One staggered reveal on list render, ease-out-quart, no bounce. `prefers-reduced-motion` disables
it. Never animate layout properties.

## Copy

No em dashes. Sentence case. Plain verbs.
