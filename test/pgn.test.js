import { describe, it, expect } from 'vitest'
import {
  extractMoves, openingName, playerResult, timeControl, withRatingDeltas, tag,
} from '../src/pgn.js'

// Trimmed from a real api.chess.com response (2_queens_1cup, 2026/07).
const PGN = `[Event "Let's Play!"]
[Site "Chess.com"]
[White "2_Queens_1Cup"]
[Black "TheKfirGambit"]
[Result "1-0"]
[ECO "A40"]
[ECOUrl "https://www.chess.com/openings/Queens-Pawn-Opening-Mikenas-Defense"]
[TimeControl "1/259200"]

1. d4 {[%clk 0:00:00]} 1... Nc6 {[%clk 0:00:01.3]} 2. f4 {[%clk 0:09:09.7]} 2... Nf6 {[%clk 0:21:25.8]} 3. e3 {[%clk 0:01:04.4]} 1-0`

describe('extractMoves', () => {
  it('strips clock comments, move numbers and the result token', () => {
    expect(extractMoves(PGN)).toEqual(['d4', 'Nc6', 'f4', 'Nf6', 'e3'])
  })

  it('keeps checkmate and promotion suffixes intact', () => {
    const p = '[White "a"]\n\n1. e4 e5 2. Qh5 Nf6 3. Qxf7# 1-0'
    expect(extractMoves(p)).toEqual(['e4', 'e5', 'Qh5', 'Nf6', 'Qxf7#'])
    expect(extractMoves('[W "a"]\n\n1. e8=Q+ Kh8 1-0')).toEqual(['e8=Q+', 'Kh8'])
  })

  it('keeps castling, which contains dashes', () => {
    expect(extractMoves('[W "a"]\n\n1. O-O O-O-O *')).toEqual(['O-O', 'O-O-O'])
  })

  it('peels nested variations rather than leaking half of one', () => {
    const p = '[W "a"]\n\n1. e4 (1. d4 (1. c4 c5) d5) e5 *'
    expect(extractMoves(p)).toEqual(['e4', 'e5'])
  })

  it('handles a PGN with no header block', () => {
    expect(extractMoves('1. e4 e5 *')).toEqual(['e4', 'e5'])
  })

  it('returns empty rather than throwing on junk', () => {
    expect(extractMoves('')).toEqual([])
    expect(extractMoves(undefined)).toEqual([])
  })
})

describe('openingName', () => {
  it('unslugs the chess.com opening URL, which has no plain-text name', () => {
    expect(openingName({ eco: 'https://www.chess.com/openings/Queens-Pawn-Opening-Mikenas-Defense' }))
      .toBe('Queens Pawn Opening Mikenas Defense')
  })

  it('falls back to the ECO code, then to a readable default', () => {
    expect(openingName({ pgn: '[ECO "A40"]\n\n1. d4 *' })).toBe('A40')
    expect(openingName({})).toBe('Unknown opening')
  })
})

describe('playerResult', () => {
  const game = (w, b) => ({
    white: { username: 'Me', rating: 1073, result: w },
    black: { username: 'Them', rating: 967, result: b },
  })

  it('reads a win from either colour', () => {
    expect(playerResult(game('win', 'resigned'), 'me').outcome).toBe('win')
    expect(playerResult(game('checkmated', 'win'), 'them').outcome).toBe('win')
  })

  it('treats every draw code as a draw, not a loss', () => {
    for (const d of ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']) {
      expect(playerResult(game(d, d), 'me').outcome).toBe('draw')
    }
  })

  it('treats unfamiliar loss codes as losses', () => {
    expect(playerResult(game('abandoned', 'win'), 'me').outcome).toBe('loss')
    expect(playerResult(game('kingofthehill', 'win'), 'me').outcome).toBe('loss')
  })

  it('matches the username case-insensitively', () => {
    expect(playerResult(game('win', 'resigned'), 'ME').color).toBe('white')
  })

  it('reports why the game ended', () => {
    expect(playerResult(game('win', 'resigned'), 'me').reason).toBe('resigned')
    expect(playerResult(game('checkmated', 'win'), 'me').reason).toBe('checkmated')
  })
})

describe('timeControl', () => {
  it('formats the three shapes chess.com actually sends', () => {
    // "/move" keeps a daily control from reading like the "3 days ago" beside it
    expect(timeControl('1/259200')).toBe('3d/move')
    expect(timeControl('1/86400')).toBe('1d/move')
    expect(timeControl('600')).toBe('10 min')
    expect(timeControl('300+5')).toBe('5|5')
    expect(timeControl('30')).toBe('30 sec')
  })
})

describe('withRatingDeltas', () => {
  it('diffs only within the same rating pool', () => {
    // Newest first. Blitz and rapid are separate ratings — mixing them lies.
    const games = [
      { time_class: 'blitz', rated: true, white: { username: 'me', rating: 1010, result: 'win' }, black: { username: 'x', result: 'resigned' } },
      { time_class: 'rapid', rated: true, white: { username: 'me', rating: 1500, result: 'win' }, black: { username: 'x', result: 'resigned' } },
      { time_class: 'blitz', rated: true, white: { username: 'me', rating: 1000, result: 'win' }, black: { username: 'x', result: 'resigned' } },
    ]
    withRatingDeltas(games, 'me')
    expect(games[0].ratingDelta).toBe(10)   // 1010 - 1000, ignoring the rapid game
    expect(games[1].ratingDelta).toBe(null) // first rapid game seen
    expect(games[2].ratingDelta).toBe(null) // first blitz game seen
  })

  it('never reports a delta for unrated games', () => {
    const games = [{ time_class: 'blitz', rated: false, white: { username: 'me', rating: 900, result: 'win' }, black: { username: 'x', result: 'resigned' } }]
    withRatingDeltas(games, 'me')
    expect(games[0].ratingDelta).toBe(null)
  })

  // A real case from 2_queens_1cup: two daily games both at 1071. The change is
  // genuinely zero, which must stay distinguishable from "not known yet".
  it('reports a real zero change as 0, not null', () => {
    const game = (rating) => ({
      time_class: 'daily', rated: true,
      white: { username: 'me', rating, result: 'timeout' },
      black: { username: 'x', result: 'win' },
    })
    const games = [game(1071), game(1071)] // newest first
    withRatingDeltas(games, 'me')
    expect(games[0].ratingDelta).toBe(0)    // changed by nothing
    expect(games[1].ratingDelta).toBe(null) // nothing earlier loaded
    // The two must not be conflated: 0 is falsy and null is falsy.
    expect(games[0].ratingDelta).not.toBe(games[1].ratingDelta)
  })

  it('signs match each game own result', () => {
    // Ratings are POST-game (verified against the live API), so diffing against
    // the previous game attributes the swing to the right game.
    const g = (rating, result) => ({
      time_class: 'daily', rated: true,
      white: { username: 'me', rating, result },
      black: { username: 'x', result: result === 'win' ? 'resigned' : 'win' },
    })
    const games = [g(1071, 'win'), g(1027, 'win'), g(975, 'timeout'), g(1019, 'win')]
    withRatingDeltas(games, 'me')
    expect(games[0].ratingDelta).toBe(44)   // win, positive
    expect(games[1].ratingDelta).toBe(52)   // win, positive
    expect(games[2].ratingDelta).toBe(-44)  // loss, negative
  })
})

describe('tag', () => {
  it('pulls a header value', () => {
    expect(tag(PGN, 'White')).toBe('2_Queens_1Cup')
    expect(tag(PGN, 'Nope')).toBeUndefined()
  })
})
