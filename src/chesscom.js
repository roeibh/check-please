// chess.com public API. Shapes verified against live endpoints 2026-07-20 — see README.

const API = 'https://api.chess.com/pub/player'
const NS = 'cp:arch:' // localStorage namespace

export class NotFound extends Error {}
export class Unreachable extends Error {}

/**
 * chess.com 301s any username that isn't lowercase. fetch would follow it,
 * but lowercasing here saves every user a wasted round trip.
 */
export const normalize = (u) => u.trim().toLowerCase().replace(/^@/, '')

/** A completed month can never change, so it's safe to cache forever. */
export function isCurrentMonth(archiveUrl, now = new Date()) {
  const m = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
  if (!m) return true
  return Number(m[1]) === now.getUTCFullYear() && Number(m[2]) === now.getUTCMonth() + 1
}

function readCache(url) {
  try {
    const raw = localStorage.getItem(NS + url)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * A prolific player's month runs to several megabytes and localStorage is ~5MB
 * total, so a quota error is expected, not exceptional. Drop our oldest entries
 * and retry once; if it still won't fit, run without a cache.
 */
function writeCache(url, payload) {
  const entry = JSON.stringify({ at: Date.now(), payload })
  try {
    localStorage.setItem(NS + url, entry)
  } catch {
    const ours = Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .map((k) => [k, readCache(k.slice(NS.length))?.at ?? 0])
      .sort((a, b) => a[1] - b[1])
    for (const [k] of ours.slice(0, Math.ceil(ours.length / 2))) localStorage.removeItem(k)
    try {
      localStorage.setItem(NS + url, entry)
    } catch {
      /* not cacheable; still perfectly usable from memory */
    }
  }
}

async function getJSON(url) {
  let res
  try {
    res = await fetch(url)
  } catch {
    throw new Unreachable("Can't reach chess.com right now.")
  }
  if (res.status === 404) throw new NotFound('No chess.com account with that name.')
  if (res.status === 429) throw new Unreachable('chess.com is rate limiting us.')
  if (!res.ok) throw new Unreachable(`chess.com returned ${res.status}.`)
  return res.json()
}

/** Every monthly archive URL for a player, oldest first. */
export async function archives(username) {
  const { archives: list } = await getJSON(`${API}/${normalize(username)}/games/archives`)
  return list ?? []
}

/**
 * One month of games, newest first.
 *
 * Completed months come from localStorage and never touch the network again.
 * The current month always revalidates — the browser's own HTTP cache handles
 * that with the ETag chess.com sends. We can't send If-None-Match ourselves:
 * chess.com's preflight only allows the `Origin` header, so a conditional
 * request from JS is blocked outright.
 */
export async function monthGames(archiveUrl) {
  const cached = readCache(archiveUrl)
  if (cached && !isCurrentMonth(archiveUrl)) return cached.payload

  const { games } = await getJSON(archiveUrl)
  const sorted = (games ?? []).sort((a, b) => b.end_time - a.end_time)
  writeCache(archiveUrl, sorted)
  return sorted
}

/** Cached games for a month without a network call, or null. */
export const cachedMonth = (archiveUrl) => readCache(archiveUrl)?.payload ?? null

export function clearCache() {
  for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) localStorage.removeItem(k)
}
