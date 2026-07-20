// FEN -> SVG board. Positions come straight from chess.com's `fen` field,
// which is the final position of the game, so these boards are real data.

import { PIECE_SPRITE } from './pieces.js'

const SQ = 45 // matches the piece viewBox, so <use> needs no scaling
const FILES = 'abcdefgh'

const PIECES = new Set('pnbrqkPNBRQK')

/**
 * Placement field of a FEN -> 64 entries, a8 first, reading rank 8 down to 1.
 *
 * Piece letters are checked against the legal set rather than accepted as
 * "any non-digit": these characters end up inside an SVG attribute, and a
 * quote smuggled in through a FEN would escape it.
 */
export function parseFen(fen) {
  const placement = String(fen || '').trim().split(/\s+/)[0]
  const squares = []
  for (const rank of placement.split('/')) {
    let n = 0
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) { squares.push(null); n++ }
      } else if (PIECES.has(ch)) {
        squares.push(ch)
        n++
      } else {
        throw new Error(`illegal FEN character: ${ch}`)
      }
    }
    if (n !== 8) throw new Error(`bad FEN rank: ${rank}`)
  }
  if (squares.length !== 64) throw new Error('FEN must describe 64 squares')
  return squares
}

const symbolFor = (ch) =>
  `pc-${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toLowerCase()}`

// The label carries an opponent username from the API, so it is escaped
// rather than trusted to stay inside chess.com's charset.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/**
 * Board as an SVG string.
 * `flip` puts black at the bottom, which is what you want when the player
 * you are looking at played black.
 */
export function boardSvg(fen, { flip = false, label = 'Chess position' } = {}) {
  let squares
  try {
    squares = parseFen(fen)
  } catch {
    return '' // a malformed FEN loses the illustration, never the page
  }
  if (flip) squares = [...squares].reverse()

  const parts = []
  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * SQ
    const y = Math.floor(i / 8) * SQ
    const dark = ((i % 8) + Math.floor(i / 8)) % 2 === 1
    parts.push(`<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" class="${dark ? 'sq-d' : 'sq-l'}"/>`)
  }
  for (let i = 0; i < 64; i++) {
    const ch = squares[i]
    if (!ch) continue
    const x = (i % 8) * SQ
    const y = Math.floor(i / 8) * SQ
    parts.push(`<use href="#${symbolFor(ch)}" x="${x}" y="${y}" width="${SQ}" height="${SQ}"/>`)
  }

  return `<svg class="board" viewBox="0 0 ${SQ * 8} ${SQ * 8}" role="img" aria-label="${esc(label)}">${parts.join('')}</svg>`
}

/** Algebraic name of a square index, a8 = 0. Used by tests and debugging. */
export const squareName = (i) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`

/** A single piece, for empty and error states. `id` is like 'bk' or 'wn'. */
export function pieceSvg(id, { label = '' } = {}) {
  if (!/^[wb][kqrbnp]$/.test(id)) return ''
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'
  return `<svg class="piece" viewBox="0 0 ${SQ} ${SQ}" ${a11y}><use href="#pc-${id}" width="${SQ}" height="${SQ}"/></svg>`
}

let injected = false
export function ensureSprite() {
  if (injected || document.getElementById('piece-sprite')) return
  const host = document.createElement('div')
  host.id = 'piece-sprite'
  host.innerHTML = PIECE_SPRITE
  document.body.prepend(host)
  injected = true
}
