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

/**
 * Extracts a one-line summary for the docs index: the first prose line after the
 * title, skipping the leading import/example code block. Returns an empty string
 * when a section heading follows the title directly (no intro paragraph).
 *
 * @param cleanedMarkdown markdown already processed by {@link cleanMarkdown}.
 * @param maxLength maximum summary length before it is truncated.
 * @returns the summary line, or an empty string.
 */
export function extractSummary(cleanedMarkdown: string, maxLength = 300): string {
    const lines = cleanedMarkdown.split('\n');

    // Anchor on the title (first heading), then read what comes after it.
    const titleIndex = lines.findIndex((line) => /^#{1,6}\s+/.test(line.trim()));
    if (titleIndex === -1) {
        return '';
    }

    for (let i = titleIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
            continue;
        }
        // Skip the leading import/example code block.
        if (line.startsWith('```')) {
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                i++;
            }
            continue;
        }
        // A heading right after the title means there is no intro paragraph.
        if (line.startsWith('#')) {
            return '';
        }

        // Unwrap links to plain text — the index line has its own base path.
        const plain = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
        return truncate(plain, maxLength);
    }

    return '';
}

/**
 * Extracts a heading and its body from markdown by heading text, matched
 * case-insensitively and ignoring emphasis/code markers. The returned block runs
 * from the matched heading up to the next heading of the same or higher level.
 * Headings inside fenced code blocks are ignored on both ends.
 *
 * @param markdown raw markdown source.
 * @param headingText heading to look for, e.g. `For AI agents`.
 * @returns the section (heading included), trimmed; empty string if not found.
 */
export function extractSection(markdown: string, headingText: string): string {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const target = headingText.trim().toLowerCase();

    const headingAt = (line: string): {level: number; text: string} | null => {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        return match
            ? {level: match[1].length, text: match[2].replace(/[*_`]/g, '').trim().toLowerCase()}
            : null;
    };

    let start = -1;
    let level = 0;
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const heading = headingAt(lines[i]);
        if (heading && heading.text === target) {
            start = i;
            level = heading.level;
            break;
        }
    }
    if (start === -1) {
        return '';
    }

    let end = lines.length;
    inFence = false;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const heading = headingAt(lines[i]);
        if (heading && heading.level <= level) {
            end = i;
            break;
        }
    }

    return lines.slice(start, end).join('\n').trim();
}

/**
 * Extracts the document title.
 *
 * @param cleanedMarkdown markdown already processed by {@link cleanMarkdown}.
 * @returns the text of the first heading, or an empty string if there is none.
 */
export function extractTitle(cleanedMarkdown: string): string {
    for (const line of cleanedMarkdown.split('\n')) {
        const match = line.trim().match(/^#{1,6}\s+(.+)$/);
        if (match) {
            return match[1].replace(/[*_`]/g, '').trim();
        }
    }
    return '';
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
    if (sentenceEnd > 40) {
        return text.slice(0, sentenceEnd + 1);
    }
    const wordEnd = text.slice(0, maxLength).lastIndexOf(' ');
    return `${text.slice(0, wordEnd > 40 ? wordEnd : maxLength).trim()}…`;
}
