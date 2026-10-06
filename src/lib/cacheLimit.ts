/**
 * How much of a list is worth keeping on the device.
 *
 * Every store caches its last server answer in localStorage so the app still shows something
 * offline. That was costing more than it was worth: uploads, meetings, notes and route cards
 * together wrote about 3.8 MB of string on EVERY load, and localStorage is synchronous — the
 * tab stops while it serialises and writes. The PD Report was worse still: at 8 MB it blew
 * the quota, so the whole cost was paid to throw the result away.
 *
 * So the cache now has a ceiling. Under it, nothing changes. Over it, the write is skipped
 * and the key cleared — losing an offline copy of a list nobody can read offline anyway,
 * and keeping the quota free for the small caches that do earn their place.
 */

/** Roughly 400 KB of UTF-16 — comfortably inside every browser's quota, several times over. */
const MAX_CACHE_CHARS = 400_000

/**
 * Cache a list under `key`, unless it is too big to be worth the pause.
 *
 * Returns true when it was written, so a caller can tell the difference if it ever matters.
 */
export function cacheList(key: string, value: unknown): boolean {
  try {
    const text = JSON.stringify(value)
    if (text.length > MAX_CACHE_CHARS) {
      // A stale small copy behind a big fresh list would be worse than none.
      localStorage.removeItem(key)
      return false
    }
    localStorage.setItem(key, text)
    return true
  } catch {
    return false // quota, private mode, or an unserialisable value — never worth throwing for
  }
}
