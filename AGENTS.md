# AGENTS.md

Instructions for AI agents working in this repo. Humans may find it useful too.

Read `PRODUCT.md` for voice and `DESIGN.md` for the design system. This file is about how to
work here without reintroducing bugs the project has already had.

---

## The one job

Someone just lost on chess.com, wants to know what went wrong, and hit the paywall. They arrive,
type a username, click once, and an engine analysis opens. **Under ten seconds, on a phone, on a
slow connection, never having seen the site before.**

Everything else is secondary. If a change makes that path longer, it is the wrong change. Say so
rather than building it.

## Non-negotiable constraints

- **Fully static.** No backend, no database, no API keys, no environment variables, no build-time
  secrets. Everything runs in the visitor's browser. This is what makes hosting free and the
  privacy claim true.
- **No new runtime dependencies.** The app ships as plain ES modules. Vite and Vitest are dev-only.
  If you want to add a dependency, first write the version that does not need one.
- **The primary action stays a plain `<a href>`.** No spinner may sit between the click and the
  analysis. See "The URL trick" below.
- **Never break `?u=username`.** Those links are how the site spreads.

---

## Before you touch API code

The API behaviour is documented in the README, verified against live endpoints. **Do not re-derive
it and do not assume it.** Several details are counterintuitive:

| Trap | Reality |
|---|---|
| chess.com usernames | Non-lowercase gets a **301**, not a 200. Lowercase client-side. |
| `If-None-Match` | The preflight allows `Origin` only, so a conditional request from JS is **blocked outright**. `curl` gets a 304 because `curl` is not subject to CORS. Do not "fix" caching by adding it. |
| `POST /api/import` | Returns `{id, url}` **only** with `Accept: application/json`. Otherwise a 303 whose `Location` JS cannot read. |
| The paste form | Posts to `/import`, not `/paste`. |
| `rating` | Is the **post-game** rating. Verified by checking every delta's sign against its own game's result. Diff against the previous game in the same `time_class`. |
| `accuracies` | Present on roughly half of games. Never make it load-bearing. |
| `eco` | Is a URL, not a name. |

If you change how an API is called, **verify it against the live endpoint and update the README
table.** A curl check takes a minute and this project has already been wrong about five of these.

### The URL trick

Lichess builds an analysis board straight from movetext:

```
https://lichess.org/analysis/pgn/e4_e5_Nf3#3
```

Zero API calls, no rate limit, no popup blocker, and `#<ply>` opens the final position. This is why
the button is an anchor tag. Import (form POST to `/import`) is the fallback for games too long for
a URL, and the way to request Lichess's server-side analysis. **Imports fire on explicit user click
only. Never in bulk, never on page load.** Anonymous limit is 100 games/hour.

---

## Bugs this repo has already shipped

Do not reintroduce these. Every one of them looked fine until it was measured.

**`0` is falsy.** `if (game.ratingDelta)` hid every genuine zero rating change, making it
indistinguishable from an unknown one. Test `!== null` / `typeof x === 'number'`, and keep "zero"
and "unknown" visually distinct.

**`[hidden]` loses to any `display` rule.** `hidden` is only a UA stylesheet default, so
`.nudge { display: flex }` silently overrode it and showed a banner that should have been hidden.
`[hidden] { display: none !important }` is in the reset. Keep it.

**The `padding` shorthand kills `padding-inline`.** `.wrap` sets inline padding; a later
`padding: 2rem 0` on the same element zeroed it and knocked a whole section 26px out of alignment.
Use `padding-block` on anything that is also a `.wrap`.

**Unvalidated input written to `localStorage`.** The username was stored before the API call
confirmed it existed, so one typo sent every future visit to the error page. Persist only after
success.

**FEN characters end up inside an SVG attribute.** `parseFen` used to accept any non-digit as a
piece. A quote smuggled through a FEN would escape the `href`. Validate against the legal piece set;
escape any label that carries a username.

**Reusing a colour token across themes breaks contrast.** Dark mode lightens `--win` / `--loss`, so
a label that was readable in light mode dropped to 2.25:1 in dark. Flip the text colour per theme
and re-measure.

**`#` is legal in SAN.** `Qxf7#` unencoded truncates the URL at the fragment and silently drops the
mating move. Lichess returns **200 either way**, so no status code reveals it. Moves are
`encodeURIComponent`-ed; `test/lichess.test.js` pins it.

**`QuotaExceededError` is an expected path, not an exception.** One prolific player's monthly
archive can exceed the entire ~5 MB origin quota. The cache is an optimisation; the caller must
still get its games when caching fails.

---

## Measure, do not eyeball

**Contrast is measured.** Every foreground/background pair in both themes must clear WCAG AA
(4.5:1, or 3:1 for large text). The tightest pair currently is 4.85:1.

There is a trap inside the trap: the obvious way to read a colour in JS, assigning it to a canvas
`fillStyle` and reading the string back, **silently fails on `oklch()`** and returns confident wrong
numbers. The tell was identical ratios for pairs that differ. Paint the colour and read the pixel
with `getImageData` instead.

**Performance is measured.** Forty boards is about 580 `<use>` nodes and pushes a full re-render
past the 16.7ms frame budget, which is why the search box is debounced and the selects are not.
If you add per-row content, re-measure.

**Bundle size is measured.** First load is about 17 kB gzipped over the wire. Check with curl and
`Accept-Encoding: gzip`, not by guessing from the build output.

---

## Design rules

Full system in `DESIGN.md`. The ones most often got wrong:

- **Plain words over jargon.** Results read `Won` / `Lost` / `Drew`. An earlier build used
  crosstable notation (`1` / `0` / `½`); it reads instantly to tournament players and means nothing
  to everyone else. Chess literacy is not the price of entry.
- **Never encode meaning with hue alone.** The word carries the result; colour only reinforces it.
- **Boards are data, never decoration.** Every board shows a real position from a real game.
- **No side-stripe borders**, no gradient text, no glassmorphism, no identical card grids.
- **Type is Familjen Grotesk and Fragment Mono.** Do not "improve" this to Inter, IBM Plex, or
  Space Grotesk; those are training-data defaults and two of them already shipped here once.
- **All colour in OKLCH.** No pure black or white; tint neutrals toward the brand hue.
- Mobile first. Tap targets 44px. Respect `prefers-reduced-motion`. Visible focus rings.

## Copy rules

- Sentence case, plain verbs, active voice. Buttons say what happens.
- **No em dashes.** Use commas, colons, semicolons, or parentheses.
- No filler, no exclamation marks, no growth-marketing verbs.
- Errors give direction, not apologies. "No games found for that username, check the spelling"
  beats "Error: 404".

## Comments

Few, short, and only for what the code cannot say. No comment that restates the line below it.
The ones worth keeping explain a **why**, a gotcha, or a constraint that is invisible locally, e.g.
why `padding-block` and not `padding`.

---

## Tests

`npm test`. Cover **what breaks silently**, not what breaks loudly. A crash is self-reporting; a
board missing its last move is not.

Current suites: PGN extraction, Lichess URL building, result and rating parsing, board rendering,
archive caching. When you fix a bug, add the case that would have caught it.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/check-please/
npm test
npm run build    # -> dist/   (BASE=/ npm run build for a user page or custom domain)
```

Push to `main` deploys via `.github/workflows/deploy.yml`, which runs the tests before building.

## Where things live

| Path | What |
|---|---|
| `src/main.js` | App: state, rendering, events, boot |
| `src/chesscom.js` | chess.com API and the `localStorage` archive cache |
| `src/lichess.js` | Analysis URL building and the import fallback |
| `src/pgn.js` | Movetext, openings, results, time controls, rating deltas |
| `src/board.js` | FEN to SVG board |
| `src/pieces.js` | Generated piece sprite. **Do not hand-edit** |
| `src/style.css` | All styles, tokens at the top |

`src/pieces.js` is Cburnett artwork, **CC BY-SA 3.0**, not MIT. Attribution is in the page footer
and must stay there. Modifying the artwork obliges you to release it share-alike.

---

## Working style

- **Verify before claiming.** Run the command, read the output, then say it works. "Should work" is
  not a result.
- **Curl every link you write.** `https://www.chess.com/member` shipped in an issue template and was
  a 404; it looked plausible, which is exactly the problem. Follow redirects and check where they
  land, since a 200 that ends on a login wall or a generic help chooser is still the wrong link.
  Note that GitHub returns 404 for `/stargazers` to anonymous requests it is rate-limiting, so
  confirm GitHub URLs with `gh api` before believing they are broken.
- **Report failures plainly.** If tests fail, say so and show the output.
- **Prefer deleting.** The shortest change that works is the right one.
- **Say when the ask is wrong.** If a request would lengthen the ten-second path, break the static
  constraint, or contradict something in this file, flag it instead of quietly working around it.
