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

/**
 * Fallback for games too long to fit a URL, and the way to request Lichess's
 * own server-side computer analysis. A real form POST is a navigation, not XHR,
 * so CORS can't block it and it works even if the API is down.
 */
export function importForm(pgn, { analyse = true } = {}) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = 'https://lichess.org/import' // NOT /paste — that's the GET page
  form.target = '_blank'
  form.rel = 'noopener'
  form.hidden = true

  const pgnField = document.createElement('textarea')
  pgnField.name = 'pgn'
  pgnField.value = pgn
  form.append(pgnField)

  if (analyse) {
    const a = document.createElement('input')
    a.name = 'analyse'
    a.value = 'true'
    form.append(a)
  }
  return form
}

export function submitImport(pgn, opts) {
  const form = importForm(pgn, opts)
  document.body.append(form)
  form.submit()
  form.remove()
}

/** The best available entry point for a game, preferring the zero-cost one. */
export function bestAnalysisTarget(game) {
  const url = analysisUrl(game)
  if (url) return { kind: 'link', url }
  return { kind: 'import', pgn: game.pgn } // too long for a URL
}
