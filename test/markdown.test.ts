import { describe, expect, test } from 'bun:test';
import { parseMarkdown, serializeMarkdown, appendSection } from '../src/core/markdown.ts';

describe('parseMarkdown', () => {
  test('parses frontmatter and body', () => {
    const raw = `---
title: Hello
priority: high
---

This is the body.
`;
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter).toEqual({ title: 'Hello', priority: 'high' });
    expect(parsed.body.trim()).toBe('This is the body.');
  });

  test('returns empty frontmatter when no fence', () => {
    const parsed = parseMarkdown('just body, no frontmatter\n');
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe('just body, no frontmatter\n');
  });

  test('handles arrays in frontmatter', () => {
    const raw = `---
mentions:
  - prs-alice
  - prs-bob
---
body`;
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter.mentions).toEqual(['prs-alice', 'prs-bob']);
  });

  test('preserves H2 sections in body', () => {
    const raw = `---
title: x
---

intro paragraph

## Outcome

did the thing
`;
    const parsed = parseMarkdown(raw);
    expect(parsed.body).toContain('## Outcome');
    expect(parsed.body).toContain('did the thing');
  });
});

describe('serializeMarkdown', () => {
  test('round-trips frontmatter and body', () => {
    const original = {
      frontmatter: { title: 'Hello', priority: 'high' },
      body: '\nThis is the body.\n',
    };
    const serialized = serializeMarkdown(original);
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.frontmatter).toEqual(original.frontmatter);
    expect(reparsed.body.trim()).toBe('This is the body.');
  });

  test('always ends with exactly one trailing newline', () => {
    const cases = [
      { frontmatter: { x: 1 }, body: 'no newline' },
      { frontmatter: { x: 1 }, body: 'has newline\n' },
      { frontmatter: { x: 1 }, body: '' },
      { frontmatter: { x: 1 }, body: 'extra newlines\n\n\n' },
    ];
    for (const c of cases) {
      const out = serializeMarkdown(c);
      expect(out.endsWith('\n')).toBe(true);
      expect(out.endsWith('\n\n')).toBe(false);
    }
  });
});

describe('appendSection', () => {
  test('appends new section at end', () => {
    const body = 'intro paragraph\n';
    const result = appendSection(body, 'Outcome', 'did the thing');
    expect(result).toBe('intro paragraph\n\n## Outcome\n\ndid the thing\n');
  });

  test('handles empty body', () => {
    const result = appendSection('', 'Outcome', 'did the thing');
    expect(result).toBe('## Outcome\n\ndid the thing\n');
  });

  test('does not double-blank when body already ends with newline', () => {
    const body = 'intro\n\n';
    const result = appendSection(body, 'Outcome', 'x');
    expect(result).toBe('intro\n\n## Outcome\n\nx\n');
  });

  test('appends UNDER existing section instead of creating duplicate H2', () => {
    const body = 'intro\n\n## Outcome\n\noriginal note\n';
    const result = appendSection(body, 'Outcome', 'addendum');
    // Only ONE ## Outcome heading
    expect(result.match(/^## Outcome$/gm)).toHaveLength(1);
    // Both the original AND the new content present
    expect(result).toContain('original note');
    expect(result).toContain('addendum');
    // New content goes AFTER original
    expect(result.indexOf('addendum')).toBeGreaterThan(result.indexOf('original note'));
  });

  test('section dedupe preserves later sections', () => {
    const body = '## Outcome\n\nfirst\n\n## Followup\n\nsomething later\n';
    const result = appendSection(body, 'Outcome', 'second');
    expect(result.match(/^## Outcome$/gm)).toHaveLength(1);
    expect(result.match(/^## Followup$/gm)).toHaveLength(1);
    expect(result).toContain('first');
    expect(result).toContain('second');
    expect(result).toContain('something later');
    expect(result.indexOf('second')).toBeLessThan(result.indexOf('## Followup'));
  });
});
