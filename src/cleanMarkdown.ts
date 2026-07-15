/**
 * Prepares a source README for shipping inside the npm tarball (e.g. build/docs/),
 * where it is consumed by AI agents rather than rendered on GitHub or Storybook.
 *
 * Commented-out `SANDBOX`/`LANDING_BLOCK` markers (their code duplicates the plain
 * fenced example shown right after) are dropped entirely; `GITHUB_BLOCK` wrappers
 * are unwrapped, keeping their content. Badges and images are stripped.
 *
 * @param content raw markdown source.
 * @returns the cleaned markdown, terminated by a single newline.
 */
export function cleanMarkdown(content: string): string {
    let text = content.replace(/\r\n/g, '\n');

    // Drop commented-out blocks whole (open + body + close).
    text = text.replace(/<!--SANDBOX[\s\S]*?SANDBOX-->/g, '');
    text = text.replace(/<!--LANDING_BLOCK[\s\S]*?LANDING_BLOCK-->/g, '');

    // Keep GitHub-only content, remove just the wrapper markers.
    text = text.replace(/<!--\/?GITHUB_BLOCK-->/g, '');

    // Any remaining standalone HTML comments have no value for an agent.
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Standalone image / badge lines (shields.io etc.).
    text = text.replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, '');
    // Inline images inside headings/links, e.g. `### ![logo](x) [Website](url)`.
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

    // Trailing whitespace left behind by the removals.
    text = text.replace(/[ \t]+$/gm, '');

    // Collapse the blank-line runs the removals produced.
    text = text.replace(/\n{3,}/g, '\n\n');

    return `${text.trim()}\n`;
}
