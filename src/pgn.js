// Parsing for chess.com's PGN + game objects. Verified against live API 2026-07-20.

const DRAW_RESULTS = new Set([
  'agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient',
])

/** Movetext as a flat list of SAN plies, comments/variations/numbers stripped. */
export function extractMoves(pgn) {
  if (!pgn) return []
  // Headers are [Tag "v"] lines; movetext follows the blank line.
  const parts = pgn.trim().split(/\r?\n\s*\r?\n/)
  let body = parts.length > 1 ? parts.slice(1).join('\n') : parts[0]

  body = body
    .replace(/\{[^}]*\}/g, ' ')   // {[%clk 0:09:09.7]}
    .replace(/;[^\n]*/g, ' ')     // rest-of-line comments
    .replace(/\$\d+/g, ' ')       // NAGs
    .replace(/\d+\.(\.\.)?/g, ' ')

  // Variations nest, so peel them rather than regexing once.
  let prev
  do { prev = body; body = body.replace(/\([^()]*\)/g, ' ') } while (body !== prev)

  return body
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
}

/** A PGN header tag, or undefined. */
export function tag(pgn, name) {
  const m = pgn?.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`))
  return m?.[1]
}

/**
 * Opening name. chess.com gives a URL, not a name, so we unslug it.
 * https://www.chess.com/openings/Queens-Pawn-Opening-Mikenas-Defense
 */
export function openingName(game) {
  const url = game.eco || tag(game.pgn, 'ECOUrl')
  if (!url) return tag(game.pgn, 'ECO') || 'Unknown opening'
  const slug = url.split('/').filter(Boolean).pop() || ''
  const name = decodeURIComponent(slug)
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name || 'Unknown opening'
}

/**
 * Which side the player was, and how it went.
 * chess.com marks the winner 'win' and gives the loser a descriptive code.
 */
export function playerResult(game, username) {
  const u = username.toLowerCase()
  const color = game.white?.username?.toLowerCase() === u ? 'white' : 'black'
  const me = game[color]
  const them = game[color === 'white' ? 'black' : 'white']

  let outcome
  if (me.result === 'win') outcome = 'win'
  else if (DRAW_RESULTS.has(me.result)) outcome = 'draw'
  else outcome = 'loss'

  return { color, outcome, me, them, reason: me.result === 'win' ? them.result : me.result }
}

const REASON_TEXT = {
  checkmated: 'checkmate', resigned: 'resignation', timeout: 'time',
  abandoned: 'abandonment', stalemate: 'stalemate', agreed: 'agreement',
  repetition: 'repetition', insufficient: 'insufficient material',
  '50move': 'the 50-move rule', timevsinsufficient: 'time vs insufficient material',
}
export const reasonText = (r) => REASON_TEXT[r] || r

/**
 * "600" -> "10 min", "300+5" -> "5|5", "1/259200" -> "3d/move".
 * Daily games carry "/move" so the control never reads like the timestamp
 * beside it ("3 days" next to "3 days ago" is unparseable), and it is
 * abbreviated because the meta line is tight on a phone.
 */
export function timeControl(tc) {
  if (!tc) return ''
  if (tc.startsWith('1/')) {
    const days = Math.round(Number(tc.slice(2)) / 86400)
    return `${days}d/move`
  }
  const [base, inc] = tc.split('+')
  const secs = Number(base)
  const mins = secs % 60 === 0 ? secs / 60 : secs / 60
  const label = secs < 60 ? `${secs} sec` : `${Number(mins.toFixed(1))} min`
  return inc ? `${Number(mins.toFixed(1))}|${inc}` : label
}

/**
 * Rating delta vs the player's previous game in the SAME pool.
 * Rapid/blitz/daily are separate ratings, so diffing across them is nonsense.
 * `games` must be newest-first.
 */
export function withRatingDeltas(games, username) {
  const lastSeen = new Map()
  // Walk oldest-first so "previous" means previous in time.
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i]
    const { color } = playerResult(g, username)
    const rating = g[color]?.rating
    const pool = `${g.time_class}:${g.rated ? 'rated' : 'casual'}`
    if (!g.rated || typeof rating !== 'number') { g.ratingDelta = null; continue }
    const prev = lastSeen.get(pool)
    g.ratingDelta = typeof prev === 'number' ? rating - prev : null
    lastSeen.set(pool, rating)
  }
  return games
}

/** "2 hours ago" from a unix seconds timestamp. */
export function relativeTime(unixSeconds, now = Date.now()) {
  const diff = Math.round((unixSeconds * 1000 - now) / 1000)
  const units = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
  ]
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs || unit === 'second') {
      return rtf.format(Math.round(diff / secs), unit)
    }
  }
}
