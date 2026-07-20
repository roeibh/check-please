// Lichess entry points. Behaviour verified against live endpoints 2026-07-20 — see README.

import { extractMoves } from './pgn.js'

// Browsers handle far more, but proxies and older Safari get unhappy past ~8k.
export const MAX_URL = 8000

/**
 * Analysis board built straight from the movetext. No import, no API call,
 * no rate limit — so this can be a plain <a href> and costs nothing to render.
 *
 * encodeURIComponent is load-bearing: checkmate moves contain '#', which would
 * otherwise start the URL fragment and silently drop the final move.
 */
export function analysisUrl(game, { ply } = {}) {
  const moves = extractMoves(game.pgn)
  if (!moves.length) return null

  const path = moves.map(encodeURIComponent).join('_')
  const anchor = ply ?? moves.length // default: final position
  const url = `https://lichess.org/analysis/pgn/${path}#${anchor}`
  return url.length > MAX_URL ? null : url
}

/** Board at the final position only, from the FEN chess.com already gives us. */
export function fenUrl(game) {
  if (!game.fen) return null
  return `https://lichess.org/analysis/standard/${encodeURIComponent(game.fen)}`
}

export class RateLimited extends Error {}
export class ImportFailed extends Error {}

/**
 * Import a game and return its Lichess URL.
 *
 * This uses `/api/import`, NOT a form POST to `/import`. A cross-origin form
 * POST to `/import` is rejected outright with 403 "Cross origin request
 * forbidden": Lichess checks the request origin, so the fact that a form
 * submission is a navigation rather than XHR does not help. `/api/import`
 * is the endpoint built for other origins and sends
 * `access-control-allow-origin: *`.
 *
 * `Accept: application/json` is required. Without it the response is a 303
 * whose Location header JS cannot read.
 *
 * Verified 2026-07-20. Importing the same PGN twice returns the same id,
 * so repeat clicks do not burn extra quota.
 */
export async function importGame(pgn) {
  let res
  try {
    res = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ pgn }),
    })
  } catch {
    throw new ImportFailed("Couldn't reach Lichess.")
  }

  // Anonymous imports are capped at 100 games/hour.
  if (res.status === 429) throw new RateLimited('Lichess is rate limiting imports.')
  if (!res.ok) throw new ImportFailed(`Lichess returned ${res.status}.`)

  const { url } = await res.json().catch(() => ({}))
  if (!url) throw new ImportFailed('Lichess did not return a game URL.')
  return url
}

/** The best available entry point for a game, preferring the zero-cost one. */
export function bestAnalysisTarget(game) {
  const url = analysisUrl(game)
  if (url) return { kind: 'link', url }
  return { kind: 'import', pgn: game.pgn } // too long for a URL
}
