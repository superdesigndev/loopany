// Slug rules for loopany artifact ids (v0.2).
//
// The slug IS the id — no kind prefix, globally unique across all kinds.
// The store enforces global uniqueness by walking kind directories at
// create time (cheap because we have ~10 kinds).
//
// Charset: Unicode letters + digits + `-` + `_`. Whitespace and path-
// dangerous characters are rejected. NFC normalization is applied so that
// macOS HFS+/APFS divergence and direct-entry vs IME-composed characters
// don't produce two filenames that look identical but differ on disk.

const MAX_SLUG_LENGTH = 60;

// Allowed: Unicode letters/marks/numbers + `-` + `_`. Whitespace, path-
// special chars (/ \ : * ? " < > |), period, and control chars are all
// rejected by virtue of being outside this set. Unicode property escapes
// require Node 22+ / Bun.
const ALLOWED_SLUG_PATTERN = /^[\p{L}\p{M}\p{N}\-_]+$/u;

export interface SlugValidationOk {
  ok: true;
  slug: string;
}
export interface SlugValidationErr {
  ok: false;
  error: string;
}
export type SlugValidationResult = SlugValidationOk | SlugValidationErr;

/**
 * Validate and NFC-normalize a slug. Returns the normalized form on success.
 * The store should always store and compare the normalized form.
 *
 * Rules:
 *   - 1–60 Unicode codepoints
 *   - charset: \p{L} (letters incl. CJK) + \p{M} (combining marks) + \p{N}
 *     (digits) + `-` + `_`
 *   - no leading/trailing `-` or `_`
 *   - no consecutive `--` or `__`
 *
 * Cross-kind global uniqueness is enforced by the store, not here.
 */
export function validateSlug(input: unknown): SlugValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, error: 'slug: must be a string' };
  }
  const slug = input.normalize('NFC');
  if (slug.length === 0) return { ok: false, error: 'slug: must not be empty' };
  // Count codepoints, not UTF-16 units. `[...slug].length` does this.
  const codepoints = [...slug].length;
  if (codepoints > MAX_SLUG_LENGTH) {
    return {
      ok: false,
      error: `slug: too long (${codepoints} codepoints, max ${MAX_SLUG_LENGTH})`,
    };
  }
  if (!ALLOWED_SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error:
        `slug: contains characters outside the allowed set ` +
        `(Unicode letters/digits, '-', '_'). ` +
        `Whitespace, path chars, period, and control chars are rejected.`,
    };
  }
  if (slug.startsWith('-') || slug.startsWith('_')) {
    return { ok: false, error: 'slug: must not start with "-" or "_"' };
  }
  if (slug.endsWith('-') || slug.endsWith('_')) {
    return { ok: false, error: 'slug: must not end with "-" or "_"' };
  }
  if (slug.includes('--') || slug.includes('__')) {
    return { ok: false, error: 'slug: must not contain consecutive "-" or "_"' };
  }
  return { ok: true, slug };
}

export function requireValidSlug(input: unknown): string {
  const r = validateSlug(input);
  if (!r.ok) throw new Error(r.error);
  return r.slug;
}

/**
 * Slugify a free-text title for use as an artifact id when the caller
 * didn't pass `--slug`. Lowercases (Unicode-aware), collapses runs of
 * non-letter / non-digit characters into a single `-`, trims edges,
 * truncates to 40 codepoints (leaves headroom for an optional `-N`
 * collision counter without busting the 60-codepoint slug cap), then
 * re-trims so truncation can't leave a dangling `-`.
 *
 * Returns `null` when the input is unusable: not a string, slugifies to
 * empty (emoji-only or pure punctuation), or every character was stripped
 * during normalization. Callers should fall back to the timestamp
 * generator when this returns null.
 */
export function slugifyTitle(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const normalized = input.normalize('NFC').toLowerCase();
  const replaced = normalized
    .replace(/[^\p{L}\p{N}_]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (replaced.length === 0) return null;
  const codepoints = [...replaced];
  const truncated = codepoints.slice(0, 40).join('').replace(/-+$/, '');
  if (truncated.length === 0) return null;
  return truncated;
}

/**
 * Timestamp-based fallback slug. Used only when `slugifyTitle` returns
 * null (no usable title) — a readable title-derived id is always
 * preferred so prose `[[citations]]` stay legible.
 *
 * Format: `YYYYMMDD-HHMMSS-<3hex>`
 *   - timestamp prefix is UTC (matches the v0.1 timestamp-id format so
 *     migrated workspaces stay self-consistent)
 *   - 3 hex chars (12 bits) suffix protects against same-second collisions
 */
export function generateFallbackSlug(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${randomHex(3)}`;
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(Math.ceil(n / 2));
  const c = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, n);
}
