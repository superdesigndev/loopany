// Shared body-input resolution for commands that accept free-form text
// (artifact create, artifact append). Three sources, in priority order:
//
//   --content <str>          inline shell string
//   --content-file <path>    file contents; path `-` means stdin
//
// `--content` inline is guarded against the classic shell-escape footgun:
// bash does NOT interpret `\n` inside double quotes, so `--content "a\n\nb"`
// ends up writing the literal 4-byte sequence `\n\n` into the artifact body
// and breaks markdown rendering. We reject that case with an actionable error.

import { readFile } from 'fs/promises';

export async function resolveBody(flags: Record<string, string>): Promise<string> {
  const inline = flags.content;
  const file = flags['content-file'];

  if (inline !== undefined && file !== undefined) {
    throw new Error('Pass either --content or --content-file, not both.');
  }

  if (file !== undefined) {
    if (file === '-') return await Bun.stdin.text();
    return await readFile(file, 'utf-8');
  }

  if (inline !== undefined) {
    validateInlineBody(inline);
    return inline;
  }

  return '';
}

function validateInlineBody(body: string): void {
  // Literal `\n` (backslash + n) with no real newline is almost certainly a
  // caller that tried `--content "a\n\nb"`. Shell doesn't interpret it; we'd
  // otherwise silently write junk. Refuse and point at the correct patterns.
  if (body.includes('\\n') && !body.includes('\n')) {
    throw new Error(
      'Body contains literal `\\n` escape sequences but no real newlines. ' +
        'Shell does not interpret `\\n` inside quotes. Use one of:\n' +
        '  --content "$(cat <<\'EOF\'\n  ...multi-line body...\n  EOF\n  )"\n' +
        '  --content-file path/to/body.md\n' +
        '  --content-file -        # read body from stdin',
    );
  }
}
