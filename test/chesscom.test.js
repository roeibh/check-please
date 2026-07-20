import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { normalize, isCurrentMonth, monthGames, cachedMonth, clearCache, NotFound, Unreachable } from '../src/chesscom.js'

// Minimal localStorage; the real one throws QuotaExceededError, which we rely on.
class MemStore {
  constructor(limit = Infinity) { this.map = new Map(); this.limit = limit }
  get length() { return this.map.size }
  key(i) { return [...this.map.keys()][i] }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  removeItem(k) { this.map.delete(k) }
  setItem(k, v) {
    const size = [...this.map.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0)
    if (size + k.length + v.length > this.limit) {
      const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e
    }
    this.map.set(k, v)
  }
}
const install = (limit) => {
  const s = new MemStore(limit)
  vi.stubGlobal('localStorage', new Proxy(s, {
    ownKeys: (t) => [...t.map.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (t, p) => (typeof t[p] === 'function' ? t[p].bind(t) : t[p]),
  }))
  return s
}

const URL_JUL = 'https://api.chess.com/pub/player/x/games/2026/07'
const URL_JUN = 'https://api.chess.com/pub/player/x/games/2026/06'
const game = (t) => ({ end_time: t, pgn: '[W "a"]\n\n1. e4 *' })

beforeEach(() => install())
afterEach(() => vi.unstubAllGlobals())

describe('normalize', () => {
  it('lowercases, because chess.com 301s anything else', () => {
    expect(normalize('  2_Queens_1Cup ')).toBe('2_queens_1cup')
    expect(normalize('@Hikaru')).toBe('hikaru')
  })
})

describe('isCurrentMonth', () => {
  const now = new Date(Date.UTC(2026, 6, 20)) // July 2026
  it('spots the live month', () => {
    expect(isCurrentMonth(URL_JUL, now)).toBe(true)
    expect(isCurrentMonth(URL_JUN, now)).toBe(false)
  })
  it('treats an unparseable URL as live, so we never serve stale data', () => {
    expect(isCurrentMonth('https://api.chess.com/pub/player/x/games', now)).toBe(true)
  })
})

describe('monthGames caching', () => {
  it('never refetches a completed month', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ games: [game(2), game(1)] }) })
    vi.stubGlobal('fetch', fetchMock)

    await monthGames(URL_JUN)
    await monthGames(URL_JUN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('always refetches the current month', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ games: [game(1)] }) })
    vi.stubGlobal('fetch', fetchMock)

    await monthGames(URL_JUL)
    await monthGames(URL_JUL)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sorts newest first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ games: [game(1), game(9), game(5)] }) }))
    const out = await monthGames(URL_JUN)
    expect(out.map((g) => g.end_time)).toEqual([9, 5, 1])
  })

  it('handles a month with no games array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    expect(await monthGames(URL_JUN)).toEqual([])
  })

  it('still returns games when the cache is too small to hold them', async () => {
    install(80) // smaller than one entry; a real month is megabytes vs a ~5MB quota
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ games: [game(1), game(2)] }) }))
    const out = await monthGames(URL_JUN)
    expect(out).toHaveLength(2)          // caller unaffected
    expect(cachedMonth(URL_JUN)).toBeNull() // simply not cached
  })

  it('clearCache drops our keys only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ games: [game(1)] }) }))
    await monthGames(URL_JUN)
    localStorage.setItem('cp:user', 'hikaru')
    clearCache()
    expect(cachedMonth(URL_JUN)).toBeNull()
    expect(localStorage.getItem('cp:user')).toBe('hikaru')
  })
})

describe('error mapping', () => {
  it('turns 404 into a typed NotFound', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    await expect(monthGames(URL_JUL)).rejects.toBeInstanceOf(NotFound)
  })

  it('turns a network failure into Unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(monthGames(URL_JUL)).rejects.toBeInstanceOf(Unreachable)
  })

  it('turns 429 into Unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }))
    await expect(monthGames(URL_JUL)).rejects.toBeInstanceOf(Unreachable)
  })
})
