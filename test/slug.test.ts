import { describe, expect, test } from 'bun:test';
import {
  validateSlug,
  requireValidSlug,
  generateFallbackSlug,
  slugifyTitle,
} from '../src/core/slug.ts';

describe('validateSlug', () => {
  test('accepts canonical kebab + Unicode + digits', () => {
    for (const s of ['self', 'alice-chen', '产品发布', 'café', 'a1', 'q2-cac-spike']) {
      const r = validateSlug(s);
      expect(r.ok).toBe(true);
    }
  });

  test('rejects whitespace, path, period, leading/trailing dashes, doubles', () => {
    for (const s of [
      '',
      'foo bar',
      'foo/bar',
      'foo\\bar',
      'foo:bar',
      'foo.bar',
      '-foo',
      'foo-',
      'foo--bar',
      '_foo',
      'foo__bar',
    ]) {
      const r = validateSlug(s);
      expect(r.ok).toBe(false);
    }
  });

  test('NFC-normalizes — composed and decomposed forms collapse to one slug', () => {
    // 'café' as NFC = 4 codepoints; as NFD = 5 (e + combining acute).
    const nfc = 'café';
    const nfd = 'café';
    const a = validateSlug(nfc);
    const b = validateSlug(nfd);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.slug).toBe(b.slug);
  });

  test('rejects > 60 codepoints', () => {
    const r = validateSlug('a'.repeat(61));
    expect(r.ok).toBe(false);
  });

  test('requireValidSlug throws on bad input', () => {
    expect(() => requireValidSlug('-bad')).toThrow();
    expect(requireValidSlug('good-slug')).toBe('good-slug');
  });
});

describe('generateFallbackSlug', () => {
  test('matches the YYYYMMDD-HHMMSS-<3hex> shape', () => {
    const slug = generateFallbackSlug(new Date('2026-05-06T11:23:45.000Z'));
    expect(slug).toMatch(/^20260506-112345-[0-9a-f]{3}$/);
  });

  test('produces a slug that passes validateSlug', () => {
    const slug = generateFallbackSlug();
    expect(validateSlug(slug).ok).toBe(true);
  });
});

describe('slugifyTitle', () => {
  test('lowercases ASCII titles and collapses whitespace into one dash', () => {
    expect(slugifyTitle('Hello World')).toBe('hello-world');
    expect(slugifyTitle('Follow up with Alice')).toBe('follow-up-with-alice');
  });

  test('collapses runs of punctuation into a single dash', () => {
    expect(slugifyTitle('Q2: CAC spike — investigate!!')).toBe(
      'q2-cac-spike-investigate',
    );
    expect(slugifyTitle('foo / bar // baz')).toBe('foo-bar-baz');
  });

  test('strips leading and trailing punctuation', () => {
    expect(slugifyTitle('  hello  ')).toBe('hello');
    expect(slugifyTitle('---hello---')).toBe('hello');
  });

  test('preserves CJK + diacritics + underscore', () => {
    expect(slugifyTitle('产品发布 Q2')).toBe('产品发布-q2');
    expect(slugifyTitle('Café review')).toBe('café-review');
    expect(slugifyTitle('snake_case_kept')).toBe('snake_case_kept');
  });

  test('truncates to 40 codepoints leaving room for a -N collision suffix', () => {
    const long =
      'a-very-long-title-that-keeps-going-on-and-on-and-on-and-on-forever';
    const slug = slugifyTitle(long);
    expect(slug).not.toBeNull();
    if (slug) {
      const codepoints = [...slug].length;
      expect(codepoints).toBeLessThanOrEqual(40);
      // No dangling dash from the truncation cut.
      expect(slug.endsWith('-')).toBe(false);
    }
  });

  test('returns null for unusable inputs', () => {
    expect(slugifyTitle('')).toBeNull();
    expect(slugifyTitle('🚀✨')).toBeNull();
    expect(slugifyTitle('!!! ... ???')).toBeNull();
    expect(slugifyTitle(null)).toBeNull();
    expect(slugifyTitle(undefined)).toBeNull();
    expect(slugifyTitle(42 as unknown)).toBeNull();
  });

  test('output passes validateSlug for representative valid inputs', () => {
    for (const t of [
      'Hello world',
      'Q2: CAC spike',
      '产品发布',
      'Café review',
      'foo / bar / baz',
    ]) {
      const slug = slugifyTitle(t);
      expect(slug).not.toBeNull();
      if (slug) expect(validateSlug(slug).ok).toBe(true);
    }
  });
});
