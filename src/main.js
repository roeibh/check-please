import { archives, monthGames, normalize, NotFound, Unreachable } from './chesscom.js'
import { playerResult, openingName, timeControl, withRatingDeltas, relativeTime, extractMoves, reasonText } from './pgn.js'
import { analysisUrl, bestAnalysisTarget, submitImport } from './lichess.js'
import { boardSvg, pieceSvg, ensureSprite } from './board.js'

const $ = (id) => document.getElementById(id)
const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

const USER_KEY = 'cp:user'
const THEME_KEY = 'cp:theme'
const NUDGE_KEY = 'cp:nudge-dismissed'
const PAGE = 40

const state = {
  user: '',
  archives: [],   // oldest -> newest
  loaded: 0,      // months pulled from the end
  games: [],
  shown: PAGE,
}

/* ── Theme ─────────────────────────────────────────────────── */
const storedTheme = localStorage.getItem(THEME_KEY)
if (storedTheme) document.documentElement.dataset.theme = storedTheme

$('theme').addEventListener('click', () => {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const current = document.documentElement.dataset.theme || (dark ? 'dark' : 'light')
  const next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem(THEME_KEY, next)
})

/* ── Views ─────────────────────────────────────────────────── */
function show(view) {
  for (const id of ['landing', 'games', 'status']) $(id).hidden = id !== view
}

function status(title, body, actions = [], piece = 'bk') {
  stopSkeletonTimer()
  const box = $('status')
  const art = el('div', 'status__art')
  art.innerHTML = pieceSvg(piece)
  box.replaceChildren(art, el('h2', null, title), el('p', null, body))
  const row = el('div', 'status__actions')
  for (const a of actions) {
    const b = el('button', 'ghost', a.label)
    b.type = 'button'
    b.addEventListener('click', a.run)
    row.append(b)
  }
  box.append(row)
  show('status')
}

let slowTimer
function skeletons(n = 6) {
  show('games')
  $('list').replaceChildren(...Array.from({ length: n }, () => {
    const li = el('li', 'sk')
    li.append(el('div', 'sk__inner'))
    return li
  }))
  $('tally').textContent = 'Loading games from chess.com…'

  // chess.com has no pagination: a month arrives whole, and a prolific player's
  // is megabytes. Say so rather than leaving the same message sitting there.
  clearTimeout(slowTimer)
  slowTimer = setTimeout(() => {
    $('tally').textContent = 'Still loading. This account has a lot of games, and chess.com sends the whole month at once.'
  }, 2000)
}

const stopSkeletonTimer = () => clearTimeout(slowTimer)

function toast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { t.hidden = true }, 2600)
}

/* ── Loading ───────────────────────────────────────────────── */
async function load(username) {
  const user = normalize(username)
  if (!user) return

  state.user = user
  state.games = []
  state.loaded = 0
  state.shown = PAGE

  const url = new URL(location.href)
  url.searchParams.set('u', user)
  history.replaceState(null, '', url)

  $('who-name').textContent = user
  document.title = `${user} — Check Please`
  skeletons()

  try {
    state.archives = await archives(user)
  } catch (err) {
    return failed(err, user)
  }

  // Only remember a username that actually resolved. Storing it earlier meant
  // one typo sent every future visit straight to the error page.
  localStorage.setItem(USER_KEY, user)

  if (!state.archives.length) {
    return status(
      'No games yet',
      `“${user}” is a real chess.com account but has never finished a game there. Once they play one, it shows up here.`,
      [{ label: 'Try another username', run: reset }],
      'wp',
    )
  }

  try {
    await loadOlder()
  } catch (err) {
    return failed(err, user)
  }
  render()
}

/** Archives only list months that contain games, so the last one is always live. */
async function loadOlder() {
  const idx = state.archives.length - 1 - state.loaded
  if (idx < 0) return false
  const games = await monthGames(state.archives[idx])
  state.loaded++
  state.games = withRatingDeltas([...state.games, ...games], state.user)
  return true
}

function failed(err, user) {
  if (err instanceof NotFound) {
    return status(
      'No games found for that username',
      `Nothing on chess.com under “${user}”. Check the spelling, or it might be a Lichess account, which already has analysis built in.`,
      [{ label: 'Try another username', run: reset }],
      'bn',
    )
  }
  if (err instanceof Unreachable) {
    return status(
      "Can't reach chess.com",
      'Their API is not responding. This is usually brief, and nothing is wrong on your end.',
      [{ label: 'Try again', run: () => load(user) }, { label: 'Use a different username', run: reset }],
      'br',
    )
  }
  console.error(err)
  return status('Something broke', 'That is our fault, not yours. Reloading usually clears it.',
    [{ label: 'Reload', run: () => location.reload() }], 'bk')
}

function reset() {
  localStorage.removeItem(USER_KEY)
  const url = new URL(location.href)
  url.searchParams.delete('u')
  history.replaceState(null, '', url)
  document.title = 'Check Please — free chess.com game analysis on Lichess'
  state.games = []
  show('landing')
  $('username').value = ''
  $('username').focus()
  setRail(0.5)
}

/* ── Filtering ─────────────────────────────────────────────── */
function visible() {
  const q = $('search').value.trim().toLowerCase()
  const fr = $('f-result').value
  const fc = $('f-color').value
  const ft = $('f-tc').value

  return state.games.filter((g) => {
    const { outcome, color, them } = playerResult(g, state.user)
    if (fr && outcome !== fr) return false
    if (fc && color !== fc) return false
    if (ft && g.time_class !== ft) return false
    if (q && !them.username?.toLowerCase().includes(q)) return false
    return true
  })
}

function setRail(rate) {
  $('rail-fill').style.height = `${Math.round(rate * 100)}%`
}

/* ── Rendering ─────────────────────────────────────────────── */
function render() {
  stopSkeletonTimer()
  show('games')

  // Populate speed filter from what this player actually plays.
  const speeds = [...new Set(state.games.map((g) => g.time_class))]
  const sel = $('f-tc')
  if (sel.options.length - 1 !== speeds.length) {
    const keep = sel.value
    const any = el('option', null, 'Any speed')
    any.value = '' // without this the option's value defaults to its text and never matches
    sel.replaceChildren(any)
    for (const s of speeds) {
      const o = el('option', null, s[0].toUpperCase() + s.slice(1))
      o.value = s
      sel.append(o)
    }
    sel.value = keep
  }

  const games = visible()
  const outcomes = games.map((g) => playerResult(g, state.user).outcome)
  const w = outcomes.filter((o) => o === 'win').length
  const l = outcomes.filter((o) => o === 'loss').length
  const d = games.length - w - l

  setRail(games.length ? w / games.length : 0.5)
  renderLastLoss()

  const list = $('list')
  const slice = games.slice(0, state.shown)
  list.replaceChildren(...slice.map(row))
  const tally = $('tally')
  if (games.length) {
    // Words, not "+4 =0 -5". Same reason the result cell says "Won".
    const bits = [`${w} won`, `${l} lost`, d ? `${d} drawn` : null].filter(Boolean)
    tally.textContent = `${games.length} game${games.length === 1 ? '' : 's'} · ${bits.join(', ')}`
  } else {
    tally.textContent = 'No games match those filters.'
  }

  const more = $('load-more')
  const hasOlder = state.loaded < state.archives.length
  if (slice.length < games.length) {
    more.hidden = false
    more.textContent = `Show ${Math.min(PAGE, games.length - slice.length)} more`
    more.onclick = () => { state.shown += PAGE; render() }
  } else if (hasOlder) {
    more.hidden = false
    more.textContent = 'Load an earlier month'
    more.onclick = async () => {
      more.disabled = true
      more.textContent = 'Loading…'
      try { await loadOlder() } catch { toast("Couldn't load that month.") }
      more.disabled = false
      state.shown += PAGE
      render()
    }
  } else {
    more.hidden = true
  }

  const note = $('list-note')
  note.hidden = hasOlder || state.games.length === 0
  if (!note.hidden) note.textContent = 'That is every game chess.com has for this account.'
}

function renderLastLoss() {
  const loss = state.games.find((g) => playerResult(g, state.user).outcome === 'loss')
  const cta = $('last-loss')
  const none = $('no-loss')

  if (!loss) {
    cta.hidden = true
    none.hidden = false
    return
  }
  none.hidden = true
  cta.hidden = false

  const { them, color } = playerResult(loss, state.user)
  const url = analysisUrl(loss)
  $('last-loss-meta').textContent = `vs ${them.username} · ${relativeTime(loss.end_time)}`

  // chess.com's `fen` is the final position, so this is where the game actually ended.
  $('last-loss-board').innerHTML = boardSvg(loss.fen, {
    flip: color === 'black',
    label: `Final position of the loss to ${them.username}`,
  })

  if (url) {
    cta.href = url
    cta.onclick = () => nudgeLater()
  } else {
    cta.href = '#'
    cta.onclick = (e) => { e.preventDefault(); submitImport(loss.pgn); nudgeLater() }
  }
}

// Plain words, not crosstable notation. "1" and "0" are obvious if you play
// tournaments and meaningless if you don't, and the visitor here is someone
// annoyed who wants an answer, not a scoresheet.
const OUTCOME_WORD = { win: 'Won', loss: 'Lost', draw: 'Drew' }

/**
 * Boards are drawn only once they are close to the viewport.
 *
 * Each one is 64 rects plus up to 32 <use> clones, so forty of them up front
 * is real work on a phone, and most of it is below the fold. The row reserves
 * the space via aspect-ratio, so filling it later shifts nothing.
 */
const boardObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        drawBoard(e.target)
        obs.unobserve(e.target)
      }
    }, { rootMargin: '400px 0px' }) // start a screen early, so scrolling never catches it
  : null

function drawBoard(node) {
  if (node.dataset.drawn) return
  node.dataset.drawn = '1'
  node.innerHTML = boardSvg(node.dataset.fen, { flip: !!node.dataset.flip })
}

function observeBoard(node) {
  // No IntersectionObserver: draw immediately rather than showing nothing.
  if (!boardObserver) return drawBoard(node)
  boardObserver.observe(node)
}

function row(game) {
  const { outcome, color, me, them, reason } = playerResult(game, state.user)
  const li = el('li', `row row--${outcome}`)

  // The board is the result cell: the final position of that game, labelled.
  // It is NOT drawn here. Building 40 boards up front delays the list on a
  // slow device for pixels that are mostly below the fold, so each one is
  // deferred until it is about to be seen. See observeBoard.
  const cell = el('div', 'row__game')
  const board = el('div', 'row__board')
  board.dataset.fen = game.fen || ''
  board.dataset.flip = color === 'black' ? '1' : ''
  observeBoard(board)
  const label = el('div', 'row__label', OUTCOME_WORD[outcome])
  cell.append(board, label)
  cell.setAttribute('role', 'img')
  cell.setAttribute('aria-label',
    `${OUTCOME_WORD[outcome]} by ${reasonText(reason)}, playing ${color}. Final position shown.`)
  li.append(cell)

  const body = el('div', 'row__body')
  const head = el('div', 'row__head')
  head.append(el('span', 'opp', them.username ?? 'Unknown'))
  if (them.rating) head.append(el('span', 'opp-rating', String(them.rating)))
  body.append(head)

  const plies = extractMoves(game.pgn).length
  const meta = el('div', 'row__meta')

  // Hollow/filled disc for the side played, the way a crosstable marks colour.
  // The score cell's aria-label already says it in words.
  const side = el('span', 'side', color === 'white' ? '○' : '●')
  side.setAttribute('aria-hidden', 'true')
  side.title = `Played ${color}`
  meta.append(side)

  if (me.rating) {
    const r = el('span', null, String(me.rating))
    const dv = game.ratingDelta

    if (!game.rated) {
      const d = el('span', 'delta delta-none', ' unrated')
      d.title = 'Casual game. It does not change your rating.'
      r.append(d)
    } else if (dv === 0) {
      // A genuine zero is not the same as an unknown one, and `if (delta)`
      // used to swallow it because 0 is falsy.
      const d = el('span', 'delta delta-none', ' ±0')
      d.title = 'Your rating did not change in this game.'
      r.append(d)
    } else if (typeof dv === 'number') {
      const d = el('span', `delta ${dv > 0 ? 'delta-up' : 'delta-down'}`,
        ` ${dv > 0 ? '+' : '−'}${Math.abs(dv)}`)
      d.title = `Rating ${dv > 0 ? 'gained' : 'lost'} in this game`
      r.append(d)
    } else {
      // Oldest loaded game in its pool: there is nothing earlier to diff against.
      const d = el('span', 'delta delta-none', ' —')
      d.title = 'No earlier game in this time control has loaded yet, so the rating change cannot be worked out. Load an earlier month to fill it in.'
      r.append(d)
    }
    meta.append(r)
  }
  for (const b of [timeControl(game.time_control), plies ? `${Math.ceil(plies / 2)} moves` : null, relativeTime(game.end_time)]) {
    if (b) meta.append(el('span', null, b))
  }
  body.append(meta)
  body.append(el('div', 'row__opening', openingName(game)))
  li.append(body)

  li.append(actions(game))
  return li
}

function actions(game) {
  const wrap = el('div', 'row__actions')
  const target = bestAnalysisTarget(game)

  const a = el('a', 'analyse', 'Analyse')
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.href = target.kind === 'link' ? target.url : '#'
  a.title = 'Opens the Lichess board at the final position, with an engine. Instant.'
  a.setAttribute('aria-label', 'Analyse this game on Lichess, opens in a new tab')
  a.addEventListener('click', (e) => {
    if (target.kind === 'import') {
      e.preventDefault()
      toast('Game is long, importing to Lichess instead.')
      submitImport(game.pgn)
    }
    nudgeLater()
  })
  wrap.append(a)
  wrap.append(reviewButton(game))
  wrap.append(menu(game))
  return wrap
}

/**
 * The slower, richer path: import to Lichess, where one click gives per-move
 * blunder labels and an accuracy score, the way chess.com's Game Review does.
 *
 * It is not automatic. `analyse=true` does not fire for anonymous imports;
 * Lichess still renders a "Request a computer analysis" button. Verified
 * 2026-07-20, and the copy here is careful not to promise otherwise.
 */
function reviewButton(game) {
  const b = el('button', 'review', 'Review')
  b.type = 'button'
  b.title =
    'Imports to Lichess, then one click there gives blunders, mistakes and an accuracy score. ' +
    'Takes about a minute. Imported games are public on Lichess.'
  b.setAttribute('aria-label',
    'Full review of this game on Lichess with blunders and accuracy. Imports the game, which makes it public on Lichess. Opens in a new tab.')
  b.addEventListener('click', () => {
    // A form POST is a navigation, so the new tab may take a moment to appear.
    // Show that something happened rather than leaving the button looking dead.
    b.disabled = true
    b.textContent = 'Opening…'
    submitImport(game.pgn)
    toast('Opening Lichess. Click "Request a computer analysis" there.')
    nudgeLater()
    setTimeout(() => { b.disabled = false; b.textContent = 'Review' }, 2500)
  })
  return b
}

function menu(game) {
  const box = el('div', 'menu')
  const btn = el('button', 'menu__btn', '⋯')
  btn.type = 'button'
  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-label', 'More actions for this game')

  let pop = null
  const close = () => {
    pop?.remove(); pop = null
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('click', onDoc, true)
  }
  const onDoc = (e) => { if (!box.contains(e.target)) close() }

  btn.addEventListener('click', () => {
    if (pop) return close()
    pop = el('div', 'menu__pop')

    const copy = el('button', null, 'Copy PGN')
    copy.type = 'button'
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(game.pgn); toast('PGN copied.') }
      catch { toast('Clipboard blocked by the browser.') }
      close()
    })

    const dl = el('button', null, 'Download PGN')
    dl.type = 'button'
    dl.addEventListener('click', () => { download(game.pgn, `${state.user}-${game.uuid ?? 'game'}.pgn`); close() })

    const orig = el('a', null, 'Open on chess.com')
    orig.href = game.url
    orig.target = '_blank'
    orig.rel = 'noopener noreferrer'

    pop.append(copy, dl, orig)
    box.append(pop)
    btn.setAttribute('aria-expanded', 'true')
    setTimeout(() => document.addEventListener('click', onDoc, true))
  })

  box.append(btn)
  return box
}

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }))
  const a = el('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ── Nudge ─────────────────────────────────────────────────── */
function nudgeLater() {
  if (localStorage.getItem(NUDGE_KEY)) return
  setTimeout(() => { $('nudge').hidden = false }, 1200)
}
$('nudge-x').addEventListener('click', () => {
  $('nudge').hidden = true
  localStorage.setItem(NUDGE_KEY, '1')
})

/* ── Events ────────────────────────────────────────────────── */
$('user-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const v = $('username').value.trim()
  const err = $('form-error')
  if (!v) {
    err.textContent = 'Type a chess.com username first.'
    err.hidden = false
    $('username').focus()
    return
  }
  err.hidden = true
  load(v)
})

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => load(chip.dataset.user))
}

$('switch-user').addEventListener('click', reset)

// Selects fire once, so they re-render immediately. Typing fires per keystroke,
// and a re-render with 40 boards on screen costs more than one frame, so the
// search box waits for a pause rather than stuttering under the cursor.
for (const id of ['f-result', 'f-color', 'f-tc']) {
  $(id).addEventListener('input', () => { state.shown = PAGE; render() })
}
let searchTimer
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { state.shown = PAGE; render() }, 120)
})

// Keyboard: '/' focuses the filter, arrows walk the list, Enter opens (native).
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
  if (e.key === '/' && !typing) {
    e.preventDefault()
    $('search').focus()
    return
  }
  if (e.key === 'Escape' && e.target.id === 'search') {
    clearTimeout(searchTimer)
    $('search').value = ''
    state.shown = PAGE
    render()
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  if (typing && e.target.id !== 'search') return

  const links = [...document.querySelectorAll('#list .analyse')]
  if (!links.length) return
  e.preventDefault()
  const at = links.indexOf(document.activeElement)
  const next = e.key === 'ArrowDown'
    ? Math.min(at + 1, links.length - 1)
    : Math.max(at - 1, 0)
  links[at === -1 ? 0 : next].focus()
})

/* ── Footer ────────────────────────────────────────────────── */
const shareText = 'Analyse your chess.com games free on Lichess — no signup:'
const shareUrl = () => location.href

$('share-x').addEventListener('click', () => {
  open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl())}`, '_blank', 'noopener')
})
$('share-reddit').addEventListener('click', () => {
  open(`https://www.reddit.com/submit?title=${encodeURIComponent('Free chess.com game analysis on Lichess, no signup')}&url=${encodeURIComponent(shareUrl())}`, '_blank', 'noopener')
})
$('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); toast('Link copied.') }
  catch { toast('Clipboard blocked by the browser.') }
})

/**
 * Star count, stale-while-revalidate.
 *
 * The cache exists to avoid an empty slot on load and to survive GitHub's
 * anonymous rate limit, NOT to freeze the number. An earlier version served a
 * cached value for 24h, so anyone who starred the repo kept seeing the old
 * count for the rest of the day. Paint whatever we have, then refresh.
 */
;(async () => {
  const KEY = 'cp:stars'
  const FLOOR = 3e5 // 5 min: enough to stop a reload loop hammering GitHub

  let cached = null
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { /* corrupt */ }
  if (cached && typeof cached.n === 'number') paintStars(cached.n)

  if (cached && Date.now() - cached.at < FLOOR) return

  try {
    const r = await fetch('https://api.github.com/repos/roeibh/check-please')
    if (!r.ok) return // rate-limited or offline: the cached value stands
    const { stargazers_count: n } = await r.json()
    if (typeof n !== 'number') return
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), n }))
    paintStars(n)
  } catch { /* decoration only, never surface this */ }
})()

function paintStars(n) {
  if (typeof n !== 'number') return
  const s = $('stars')
  s.textContent = n.toLocaleString()
  s.hidden = false
}

/* ── Boot ──────────────────────────────────────────────────── */
ensureSprite()

// Morphy's mate in the Opera Game, 1858. The most famous loss in chess, which
// is the point: everyone misses something.
$('hero-board').innerHTML = boardSvg(
  '1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17',
  { label: 'Final position of the Opera Game, after 17.Rd8 checkmate' },
)

const fromUrl = new URLSearchParams(location.search).get('u')
const remembered = localStorage.getItem(USER_KEY)
const initial = fromUrl || remembered

if (initial) {
  load(initial)
} else {
  show('landing')
  $('username').focus()
}
