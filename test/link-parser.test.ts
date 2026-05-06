import { describe, expect, test } from 'bun:test';
import { extractLinks } from '../src/core/link-parser.ts';

describe('extractLinks', () => {
  test('finds a single link', () => {
    const body = 'hello [[20260422-072324-abc]] world';
    expect(extractLinks(body)).toEqual(['20260422-072324-abc']);
  });

  test('finds multiple links', () => {
    const body = 'here [[alice-chen]] and also [[bob-li]]';
    expect(extractLinks(body)).toEqual(['alice-chen', 'bob-li']);
  });

  test('matches anything slug-shaped (validation happens at graph load)', () => {
    // In v0.2 there are no kind prefixes — every slug-shaped match is a
    // candidate. Dangling references surface in `loopany doctor`, not here.
    const body = 'unrelated [[foo-bar]] and [[random]] here';
    expect(extractLinks(body)).toEqual(['foo-bar', 'random']);
  });

  test('skips links inside fenced code blocks', () => {
    const body = `
outside [[outside-1]] counts

\`\`\`
inside [[inside-1]] is code
\`\`\`

after [[outside-2]] counts
`;
    expect(extractLinks(body)).toEqual(['outside-1', 'outside-2']);
  });

  test('handles language-tagged fenced blocks', () => {
    const body = '\`\`\`yaml\nvalue: [[ignored]]\n\`\`\`\n\nreal [[real-id]]';
    expect(extractLinks(body)).toEqual(['real-id']);
  });

  test('skips inline code blocks (single backtick)', () => {
    const body = 'inline `[[ignored]]` but real [[real-id]]';
    expect(extractLinks(body)).toEqual(['real-id']);
  });

  test('does not match single brackets', () => {
    const body = '[not-a-wiki-link] is a markdown link';
    expect(extractLinks(body)).toEqual([]);
  });

  test('duplicate links are returned as-is (caller dedupes)', () => {
    const body = '[[alice]] mentioned twice [[alice]]';
    expect(extractLinks(body)).toEqual(['alice', 'alice']);
  });

  test('returns empty for empty body', () => {
    expect(extractLinks('')).toEqual([]);
  });

  test('match must end at ]] — no greedy carryover', () => {
    const body = 'here [[alpha]] and [[beta]]';
    expect(extractLinks(body)).toEqual(['alpha', 'beta']);
  });

  test('rejects links with internal whitespace', () => {
    const body = '[[foo bar]] should not match';
    expect(extractLinks(body)).toEqual([]);
  });

  test('rejects links with characters outside the slug charset', () => {
    // periods, slashes, colons all rejected
    const body = '[[foo.bar]] [[foo/bar]] [[foo:bar]]';
    expect(extractLinks(body)).toEqual([]);
  });

  test('accepts CJK slugs', () => {
    const body = '产品 [[产品发布]] go';
    expect(extractLinks(body)).toEqual(['产品发布']);
  });
});
