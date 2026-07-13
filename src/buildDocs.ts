import * as fs from 'node:fs';
import * as path from 'node:path';

import {cleanMarkdown, extractSummary, extractTitle} from './cleanMarkdown.js';

// Story/test folders hold Storybook doc pages and fixtures, not API docs.
const DEFAULT_EXCLUDE = ['__stories__', '__tests__', '__mocks__', '__snapshots__'];

export type DocsSourceKind = 'readme' | 'markdown';

export interface DocsSource {
    /** Section heading in the generated INDEX.md. */
    title: string;
    /** `readme` walks for README.md files; `markdown` takes every *.md. */
    kind: DocsSourceKind;
    /** Source directory, relative to `rootDir`. */
    baseDir: string;
    /** Output subdirectory under `outDir`. */
    outPrefix: string;
    /** Directory names to skip (in addition to story/test folders). */
    exclude?: string[];
    /** Name the index entry by the doc's heading instead of its path. */
    nameFromTitle?: boolean;
}

export interface DocsConfig {
    /** Repo root. Defaults to `process.cwd()`. */
    rootDir?: string;
    /** Directory to (re)generate. */
    outDir: string;
    /** Shown in the generated INDEX.md header. Defaults to `rootDir`'s package name. */
    packageName?: string;
    /** Doc sources; INDEX sections follow this order. */
    sources: DocsSource[];
}

export interface DocsIndexEntry {
    name: string;
    rel: string;
    summary: string;
}

export interface DocsSection {
    title: string;
    entries: DocsIndexEntry[];
}

export interface BuildDocsResult {
    sections: DocsSection[];
    total: number;
}

interface DocItem {
    source: string;
    name: string;
    outRel: string;
}

/**
 * The layout shared by gravity-ui packages: component and hook READMEs plus any
 * markdown dropped under the repo-level `docs/` folder. `exclude: ['legacy']`
 * and an empty `docs/` are both harmless when a package lacks them, so the same
 * config drives every package (uikit, navigation, …).
 */
export function createDefaultDocsConfig(
    rootDir: string = process.cwd(),
    packageName?: string,
): DocsConfig {
    return {
        rootDir,
        packageName: packageName ?? readPackageName(rootDir),
        outDir: path.join(rootDir, 'build', 'docs'),
        sources: [
            {
                title: 'Guides',
                kind: 'markdown',
                baseDir: 'docs',
                outPrefix: 'guides',
                nameFromTitle: true,
            },
            {
                title: 'Components',
                kind: 'readme',
                baseDir: 'src/components',
                outPrefix: 'components',
                exclude: ['legacy'],
            },
            {
                title: 'Hooks',
                kind: 'readme',
                baseDir: 'src/hooks',
                outPrefix: 'hooks',
                exclude: ['private'],
            },
        ],
    };
}

/**
 * Builds a package's docs output for AI agents from its markdown sources.
 * The output ships inside the npm tarball so an agent working in a consumer
 * project reads documentation matching the installed version. Usually called
 * with {@link createDefaultDocsConfig}.
 */
export function buildDocs(config: DocsConfig = createDefaultDocsConfig()): BuildDocsResult {
    const {outDir, sources} = config;
    const rootDir = config.rootDir ?? process.cwd();
    const packageName = config.packageName ?? readPackageName(rootDir);

    fs.rmSync(outDir, {recursive: true, force: true});

    // Resolve every source's items first, so links between docs can be rewritten
    // in the second pass regardless of processing order.
    const listed = sources.map((source) => ({source, items: listSource(rootDir, source)}));
    const docMap = new Map(listed.flatMap(({items}) => items.map((it) => [it.source, it.outRel])));

    const sections: DocsSection[] = [];
    for (const {source, items} of listed) {
        const entries: DocsIndexEntry[] = [];
        for (const {source: file, name, outRel} of items) {
            const cleaned = rewriteReadmeLinks(
                cleanMarkdown(fs.readFileSync(file, 'utf8')),
                file,
                outRel,
                docMap,
            );
            writeDoc(path.join(outDir, outRel), cleaned);
            entries.push({
                name: source.nameFromTitle ? extractTitle(cleaned) || name : name,
                rel: outRel,
                summary: extractSummary(cleaned),
            });
        }
        sections.push({title: source.title, entries});
    }

    const outRelToRoot = path.relative(rootDir, outDir).split(path.sep).join('/');
    writeDoc(path.join(outDir, 'INDEX.md'), renderIndex(packageName, outRelToRoot, sections));

    const total = sections.reduce((sum, section) => sum + section.entries.length, 0);
    return {sections, total};
}

/** Recursively collects `README.md` files under `dir`, skipping excluded segments. */
function findReadmes(dir: string, exclude: string[] = []): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    const skip = new Set([...DEFAULT_EXCLUDE, ...exclude]);
    const result: string[] = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (skip.has(entry.name)) {
                continue;
            }
            result.push(...findReadmes(fullPath, exclude));
        } else if (/^readme\.md$/i.test(entry.name)) {
            // Case-insensitive: some packages use `Readme.md` (e.g. navigation).
            result.push(fullPath);
        }
    }
    return result;
}

/** Recursively collects `*.md` files under `dir`. */
function findMarkdown(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    const result: string[] = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...findMarkdown(fullPath));
        } else if (entry.name.endsWith('.md')) {
            result.push(fullPath);
        }
    }
    return result;
}

function readPackageName(rootDir: string): string {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
        name?: string;
    };
    return pkg.name ?? '';
}

function writeDoc(outPath: string, content: string): void {
    fs.mkdirSync(path.dirname(outPath), {recursive: true});
    fs.writeFileSync(outPath, content);
}

/**
 * Lists a source's docs as items, mirroring the source folder layout so nested
 * groups never collide (e.g. `src/components/controls/TextInput/README.md` →
 * `components/controls/TextInput.md`, `docs/theming.md` → `guides/theming.md`).
 */
function listSource(rootDir: string, {kind, baseDir, outPrefix, exclude}: DocsSource): DocItem[] {
    const absBase = path.join(rootDir, baseDir);
    if (kind === 'readme') {
        return findReadmes(absBase, exclude).map((source) => {
            const name = path.relative(absBase, path.dirname(source)).split(path.sep).join('/');
            return {source, name, outRel: path.posix.join(outPrefix, `${name}.md`)};
        });
    }
    return findMarkdown(absBase).map((source) => {
        const rel = path.relative(absBase, source).split(path.sep).join('/');
        return {source, name: rel.replace(/\.md$/, ''), outRel: path.posix.join(outPrefix, rel)};
    });
}

/**
 * Rewrites intra-repo `README.md` links so they resolve inside the docs output.
 * Source links point at sibling source folders (`../CopyToClipboard/README.md`);
 * here every README maps to a flat `<name>.md`, so links are recomputed relative
 * to the current output file. Links to docs that aren't shipped (e.g. `legacy/`)
 * are unwrapped to plain text so no dead link remains. External URLs are kept.
 */
function rewriteReadmeLinks(
    markdown: string,
    source: string,
    outRel: string,
    docMap: Map<string, string>,
): string {
    return markdown.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (whole, text: string, target: string) => {
        if (!/readme\.md/i.test(target)) {
            return whole;
        }
        if (/^[a-z]+:\/\//i.test(target)) {
            return whole; // external URL — leave as-is
        }

        const hashIndex = target.indexOf('#');
        const relPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
        const anchor = hashIndex === -1 ? '' : target.slice(hashIndex);

        const absTarget = path.resolve(path.dirname(source), relPath);
        const targetOut = docMap.get(absTarget);
        if (!targetOut) {
            return text; // target not shipped — drop the link, keep its text
        }

        let relOut = path.posix.relative(path.posix.dirname(outRel), targetOut);
        if (!relOut.startsWith('.')) {
            relOut = `./${relOut}`;
        }
        return `[${text}](${relOut}${anchor})`;
    });
}

function renderSection(title: string, entries: DocsIndexEntry[]): string {
    if (!entries.length) {
        return '';
    }
    const rows = entries
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({name, rel, summary}) => `- [${name}](./${rel})${summary ? ` — ${summary}` : ''}`)
        .join('\n');
    return `## ${title}\n\n${rows}\n`;
}

function renderIndex(packageName: string, outRelToRoot: string, sections: DocsSection[]): string {
    // e.g. node_modules/@gravity-ui/uikit/build/docs
    const installedPath = path.posix.join('node_modules', packageName, outRelToRoot);
    const header = [
        `# ${packageName} documentation`,
        '',
        `Documentation for the **installed** version of \`${packageName}\`.`,
        'Your training data may be outdated — these files are the source of truth.',
        '',
        `Paths are relative to this file (\`${installedPath}/\`).`,
        '',
    ].join('\n');

    return [header, ...sections.map(({title, entries}) => renderSection(title, entries))]
        .filter(Boolean)
        .join('\n');
}
