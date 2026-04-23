import { describe, expect, test } from 'bun:test';
import { extractLinks } from '../src/core/link-parser.ts';

const PREFIXES = new Set(['tsk-', 'prs-', 'gol-', 'sig-']);

describe('extractLinks', () => {
  test('finds a single link with a known prefix', () => {
    const body = 'hello [[tsk-20260422-072324]] world';
    expect(extractLinks(body, PREFIXES)).toEqual(['tsk-20260422-072324']);
  });

  test('finds multiple links', () => {
    const body = 'here [[prs-alice-chen]] and also [[prs-bob-li]]';
    expect(extractLinks(body, PREFIXES)).toEqual(['prs-alice-chen', 'prs-bob-li']);
  });

  test('ignores bracketed text with unknown prefix', () => {
    const body = 'unrelated [[foo-bar]] or [[random text]] here';
    expect(extractLinks(body, PREFIXES)).toEqual([]);
  });

  test('skips links inside fenced code blocks', () => {
    const body = `
outside [[tsk-1]] counts

\`\`\`
inside [[tsk-2]] is code
\`\`\`

after [[tsk-3]] counts
`;
    expect(extractLinks(body, PREFIXES)).toEqual(['tsk-1', 'tsk-3']);
  });

  test('handles language-tagged fenced blocks', () => {
    const body = '\`\`\`yaml\nvalue: [[tsk-ignore]]\n\`\`\`\n\nreal [[tsk-real]]';
    expect(extractLinks(body, PREFIXES)).toEqual(['tsk-real']);
  });

  test('skips inline code blocks (single backtick)', () => {
    const body = 'inline `[[tsk-ignore]]` but real [[tsk-real]]';
    expect(extractLinks(body, PREFIXES)).toEqual(['tsk-real']);
  });

  test('does not match single brackets', () => {
    const body = '[tsk-not-a-wiki-link] is a markdown link';
    expect(extractLinks(body, PREFIXES)).toEqual([]);
  });

  test('duplicate links are returned as-is (caller dedupes)', () => {
    const body = '[[prs-alice]] mentioned twice [[prs-alice]]';
    expect(extractLinks(body, PREFIXES)).toEqual(['prs-alice', 'prs-alice']);
  });

  test('returns empty for empty body', () => {
    expect(extractLinks('', PREFIXES)).toEqual([]);
  });

  test('match must end at ]] — no greedy carryover', () => {
    const body = 'here [[tsk-alpha]] and [[tsk-beta]]';
    expect(extractLinks(body, PREFIXES)).toEqual(['tsk-alpha', 'tsk-beta']);
  });

  test('rejects links with internal whitespace', () => {
    const body = '[[tsk-foo bar]] should not match';
    expect(extractLinks(body, PREFIXES)).toEqual([]);
  });
});
