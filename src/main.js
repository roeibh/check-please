import { archives, monthGames, normalize, NotFound, Unreachable } from './chesscom.js'
import { playerResult, openingName, timeControl, withRatingDeltas, relativeTime, extractMoves, reasonText } from './pgn.js'
import { analysisUrl, bestAnalysisTarget, submitImport } from './lichess.js'

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

function status(title, body, actions = []) {
  const box = $('status')
  box.replaceChildren(el('h2', null, title), el('p', null, body))
  for (const a of actions) {
    const b = el('button', 'ghost', a.label)
    b.type = 'button'
    b.addEventListener('click', a.run)
    box.append(b)
  }
  show('status')
}

function skeletons(n = 6) {
  show('games')
  $('list').replaceChildren(...Array.from({ length: n }, () => {
    const li = el('li', 'sk')
    li.append(el('div', 'sk__inner'))
    return li
  }))
  $('tally').textContent = 'Loading games from chess.com…'
}

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
  localStorage.setItem(USER_KEY, user)

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

  if (!state.archives.length) {
    return status(
      'No games yet',
      `“${user}” is a real chess.com account but has never finished a game there. Once they play one, it shows up here.`,
      [{ label: 'Try another username', run: reset }],
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
      `Nothing on chess.com under “${user}”. Check the spelling — or it might be a Lichess account, which already has analysis built in.`,
      [{ label: 'Try another username', run: reset }],
    )
  }
  if (err instanceof Unreachable) {
    return status(
      "Can't reach chess.com",
      'Their API is not responding. This is usually brief — nothing is wrong on your end.',
      [{ label: 'Try again', run: () => load(user) }, { label: 'Use a different username', run: reset }],
    )
  }
  console.error(err)
  return status('Something broke', 'That is our fault, not yours. Reloading usually clears it.',
    [{ label: 'Reload', run: () => location.reload() }])
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
  $('tally').textContent = games.length
    ? `${games.length} game${games.length === 1 ? '' : 's'} · ${w}W ${l}L ${d}D`
    : 'No games match those filters.'

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

  const { them } = playerResult(loss, state.user)
  const url = analysisUrl(loss)
  $('last-loss-meta').textContent = `vs ${them.username} · ${relativeTime(loss.end_time)}`

  if (url) {
    cta.href = url
    cta.onclick = () => nudgeLater()
  } else {
    cta.href = '#'
    cta.onclick = (e) => { e.preventDefault(); submitImport(loss.pgn); nudgeLater() }
  }
}

function row(game) {
  const { outcome, color, me, them, reason } = playerResult(game, state.user)
  const li = el('li', `row row--${outcome}`)
  li.append(el('div', 'row__rail'))

  const body = el('div', 'row__body')
  const head = el('div', 'row__head')
  const wld = el('span', 'wld', outcome[0].toUpperCase())
  wld.setAttribute('role', 'img')
  wld.setAttribute('aria-label',
    `${outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Draw'} by ${reasonText(reason)}, playing ${color}`)
  head.append(wld, el('span', 'opp', them.username ?? 'Unknown'))
  if (them.rating) head.append(el('span', 'opp-rating', String(them.rating)))
  body.append(head)

  const plies = extractMoves(game.pgn).length
  const meta = el('div', 'row__meta')
  meta.append(el('span', null, `as ${color}`))

  if (me.rating) {
    const r = el('span', null, String(me.rating))
    if (game.ratingDelta) {
      r.append(el('span', game.ratingDelta > 0 ? 'delta-up' : 'delta-down',
        ` ${game.ratingDelta > 0 ? '+' : ''}${game.ratingDelta}`))
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
  a.setAttribute('aria-label', `Analyse this game on Lichess, opens in a new tab`)
  a.addEventListener('click', (e) => {
    if (target.kind === 'import') {
      e.preventDefault()
      toast('Game is long — importing to Lichess instead.')
      submitImport(game.pgn)
    }
    nudgeLater()
  })
  wrap.append(a)
  wrap.append(menu(game))
  return wrap
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

    const imp = el('button', null, 'Import to Lichess with analysis')
    imp.type = 'button'
    imp.addEventListener('click', () => { submitImport(game.pgn); close() })

    pop.append(copy, dl, orig, imp)
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

for (const id of ['search', 'f-result', 'f-color', 'f-tc']) {
  $(id).addEventListener('input', () => { state.shown = PAGE; render() })
}

// Keyboard: '/' focuses the filter, arrows walk the list, Enter opens (native).
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
  if (e.key === '/' && !typing) {
    e.preventDefault()
    $('search').focus()
    return
  }
  if (e.key === 'Escape' && e.target.id === 'search') {
    $('search').value = ''
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

// Star count, cached for a day. Failure is silent — it's decoration.
;(async () => {
  const KEY = 'cp:stars'
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (c && Date.now() - c.at < 864e5) return paintStars(c.n)
    const r = await fetch('https://api.github.com/repos/roeibh/check-please')
    if (!r.ok) return
    const { stargazers_count: n } = await r.json()
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), n }))
    paintStars(n)
  } catch { /* decoration only */ }
})()

function paintStars(n) {
  if (typeof n !== 'number') return
  const s = $('stars')
  s.textContent = `★ ${n}`
  s.hidden = false
}

/* ── Boot ──────────────────────────────────────────────────── */
const fromUrl = new URLSearchParams(location.search).get('u')
const remembered = localStorage.getItem(USER_KEY)
const initial = fromUrl || remembered

if (initial) {
  load(initial)
} else {
  show('landing')
  $('username').focus()
}
