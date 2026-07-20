import { describe, it, expect } from 'vitest'
import { parseFen, boardSvg, squareName, pieceSvg } from '../src/board.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// A real final position from api.chess.com (2_queens_1cup, 2026/07)
const REAL = '4Q3/6b1/1k2pq1p/pN1pNp2/3P1P2/2PBP3/PP4PP/R1B1R1K1 b - - 0 26'

describe('parseFen', () => {
  it('reads the start position into 64 squares, a8 first', () => {
    const sq = parseFen(START)
    expect(sq).toHaveLength(64)
    expect(sq[0]).toBe('r')   // a8
    expect(sq[4]).toBe('k')   // e8, black king
    expect(sq[60]).toBe('K')  // e1, white king
    expect(sq[63]).toBe('R')  // h1
    expect(sq[27]).toBeNull() // d5, empty
  })

  it('expands digit runs correctly', () => {
    const sq = parseFen(REAL)
    expect(sq.slice(0, 4)).toEqual([null, null, null, null])
    expect(sq[4]).toBe('Q')   // e8, the queen that ended it
    expect(sq).toHaveLength(64)
  })

  it('ignores the fields after placement', () => {
    expect(parseFen('8/8/8/8/8/8/8/8 w - - 0 1').every((s) => s === null)).toBe(true)
  })

  it('rejects a rank that does not add up to 8', () => {
    expect(() => parseFen('rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')).toThrow()
  })

  it('rejects a board without 64 squares', () => {
    expect(() => parseFen('8/8/8 w - - 0 1')).toThrow()
  })

  // These characters land inside an SVG attribute, so a quote must never survive.
  it('rejects illegal piece characters', () => {
    expect(() => parseFen('xxxxxxxx/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/illegal/)
    expect(() => parseFen('"" 6/8/8/8/8/8/8/8 w - - 0 1')).toThrow()
    expect(() => parseFen('<<<<<<<</8/8/8/8/8/8/8 w - - 0 1')).toThrow(/illegal/)
  })

  it('treats 0 and 9 as illegal, not as run lengths', () => {
    expect(() => parseFen('9/8/8/8/8/8/8/8 w - - 0 1')).toThrow()
    expect(() => parseFen('08/8/8/8/8/8/8/8 w - - 0 1')).toThrow()
  })
})

describe('squareName', () => {
  it('maps indices to algebraic names', () => {
    expect(squareName(0)).toBe('a8')
    expect(squareName(7)).toBe('h8')
    expect(squareName(56)).toBe('a1')
    expect(squareName(63)).toBe('h1')
  })
})

describe('boardSvg', () => {
  it('draws 64 squares and one use per piece', () => {
    const svg = boardSvg(START)
    expect(svg.match(/<rect/g)).toHaveLength(64)
    expect(svg.match(/<use/g)).toHaveLength(32)
  })

  it('picks the right sprite for case', () => {
    const svg = boardSvg('8/8/8/8/8/8/8/K6k w - - 0 1')
    expect(svg).toContain('#pc-wk')
    expect(svg).toContain('#pc-bk')
  })

  it('flipping reverses the board', () => {
    const normal = boardSvg('K7/8/8/8/8/8/8/8 w - - 0 1')
    const flipped = boardSvg('K7/8/8/8/8/8/8/8 w - - 0 1', { flip: true })
    expect(normal).toContain('<use href="#pc-wk" x="0" y="0"')
    expect(flipped).toContain('<use href="#pc-wk" x="315" y="315"')
  })

  it('alternates square colours from a light a8', () => {
    const svg = boardSvg(START)
    const first = svg.match(/<rect[^>]*class="(sq-[ld])"/)[1]
    expect(first).toBe('sq-l')
  })

  // A bad FEN should cost the illustration, never the page.
  it('returns empty string rather than throwing on junk', () => {
    expect(boardSvg('not a fen')).toBe('')
    expect(boardSvg('')).toBe('')
    expect(boardSvg(undefined)).toBe('')
  })

  it('escapes the label, which carries an opponent username', () => {
    const svg = boardSvg(START, { label: 'vs "><script>alert(1)</script>' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('pieceSvg', () => {
  it('renders a known piece', () => {
    expect(pieceSvg('bk')).toContain('#pc-bk')
    expect(pieceSvg('wn')).toContain('#pc-wn')
  })

  it('is hidden from screen readers unless labelled', () => {
    expect(pieceSvg('bk')).toContain('aria-hidden="true"')
    expect(pieceSvg('bk', { label: 'Black king' })).toContain('aria-label="Black king"')
  })

  it('refuses anything not a real piece id', () => {
    for (const bad of ['xx', 'wz', 'k', '', 'wk"><script>', 'WK']) {
      expect(pieceSvg(bad)).toBe('')
    }
  })
})
