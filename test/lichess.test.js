import { describe, it, expect } from 'vitest'
import { analysisUrl, fenUrl, bestAnalysisTarget, MAX_URL } from '../src/lichess.js'

const gameWith = (movetext) => ({ pgn: `[White "a"]\n\n${movetext}` })

describe('analysisUrl', () => {
  it('builds a move-list analysis board', () => {
    expect(analysisUrl(gameWith('1. e4 e5 2. Nf3 *')))
      .toBe('https://lichess.org/analysis/pgn/e4_e5_Nf3#3')
  })

  // The one that breaks silently: '#' would start the URL fragment and drop
  // the mating move. Lichess still returns 200, so nothing surfaces the loss.
  it('percent-encodes the # in a checkmating move', () => {
    const url = analysisUrl(gameWith('1. e4 e5 2. Qh5 Nf6 3. Qxf7# 1-0'))
    expect(url).toContain('Qxf7%23')
    expect(url.split('#')[0]).toContain('Qxf7%23')
    // exactly one '#', the ply anchor
    expect(url.match(/#/g)).toHaveLength(1)
  })

  it('anchors at the final ply by default and honours an explicit ply', () => {
    expect(analysisUrl(gameWith('1. e4 e5 *'))).toMatch(/#2$/)
    expect(analysisUrl(gameWith('1. e4 e5 *'), { ply: 1 })).toMatch(/#1$/)
  })

  it('survives a round trip through the URL parser', () => {
    const url = analysisUrl(gameWith('1. e4 e5 2. Qxf7# 1-0'))
    const parsed = new URL(url)
    const moves = decodeURIComponent(parsed.pathname.split('/pgn/')[1]).split('_')
    expect(moves).toEqual(['e4', 'e5', 'Qxf7#'])
    expect(parsed.hash).toBe('#3')
  })

  it('returns null for a game with no moves', () => {
    expect(analysisUrl(gameWith('*'))).toBeNull()
    expect(analysisUrl({ pgn: '' })).toBeNull()
  })

  it('returns null rather than emitting an over-long URL', () => {
    const huge = Array.from({ length: 4000 }, () => 'Nf3').join(' ')
    expect(analysisUrl(gameWith(huge))).toBeNull()
  })

  it('still fits a realistically long game', () => {
    // ~4.6 chars per ply; 300 plies is a marathon and lands near 1.4k.
    const long = Array.from({ length: 300 }, () => 'Nf3').join(' ')
    const url = analysisUrl(gameWith(long))
    expect(url).not.toBeNull()
    expect(url.length).toBeLessThan(MAX_URL)
  })
})

describe('fenUrl', () => {
  it('encodes the spaces in a FEN', () => {
    const url = fenUrl({ fen: '4Q3/6b1/1k2pq1p/pN1pNp2/3P1P2/2PBP3/PP4PP/R1B1R1K1 b - - 0 26' })
    expect(url).toContain('%20b%20-%20-%200%2026')
    expect(url).not.toContain(' ')
  })

  it('returns null without a FEN', () => {
    expect(fenUrl({})).toBeNull()
  })
})

describe('bestAnalysisTarget', () => {
  it('prefers the zero-cost link', () => {
    expect(bestAnalysisTarget(gameWith('1. e4 e5 *')).kind).toBe('link')
  })

  it('falls back to import when the game will not fit a URL', () => {
    const huge = Array.from({ length: 4000 }, () => 'Nf3').join(' ')
    expect(bestAnalysisTarget(gameWith(huge)).kind).toBe('import')
  })
})
