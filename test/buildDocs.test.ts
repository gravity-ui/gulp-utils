import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildDocs, createDefaultDocsConfig} from '../src/buildDocs.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pkg');

function build() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-utils-docs-'));
    const result = buildDocs({...createDefaultDocsConfig(fixture), outDir});
    const read = (rel: string) => fs.readFileSync(path.join(outDir, rel), 'utf8');
    return {outDir, result, read};
}

test('rewrites README-path and bare-folder links to shipped docs', () => {
    const alpha = build().read('components/Alpha.md');

    // ../Beta/README.md#props → ./Beta.md#props
    assert.match(alpha, /\[Beta\]\(\.\/Beta\.md#props\)/);
    // bare folder ../Beta → ./Beta.md
    assert.match(alpha, /\[Beta folder\]\(\.\/Beta\.md\)/);
});

test('unwraps links to non-shipped targets, leaving no dead link', () => {
    const alpha = build().read('components/Alpha.md');

    assert.doesNotMatch(alpha, /types\.ts/); // ./types.ts#L1 dropped
    assert.match(alpha, /a type/); // link text kept
});

test('keeps external URLs and strips service markers', () => {
    const alpha = build().read('components/Alpha.md');

    assert.match(alpha, /\(https:\/\/example\.com\)/);
    assert.match(alpha, /^# Alpha$/m);
    assert.doesNotMatch(alpha, /SANDBOX|GITHUB_BLOCK/);
});

test('excludes legacy and indexes every shipped doc', () => {
    const {outDir, result, read} = build();

    assert.ok(!fs.existsSync(path.join(outDir, 'components', 'legacy')));

    const index = read('INDEX.md');
    assert.match(index, /\[Alpha\]\(\.\/components\/Alpha\.md\)/);
    assert.match(index, /\[Beta\]\(\.\/components\/Beta\.md\)/);
    assert.match(index, /\[Theming guide\]\(\.\/guides\/guide\.md\)/); // named by heading

    assert.equal(result.total, 3); // Alpha, Beta, guide (legacy excluded)
});

// A throwaway package with a writable README, so the pointer-writing behavior
// never mutates the shared fixture. Returns the root and readers.
function buildTempPackage(readmeBody?: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-utils-pkg-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: '@demo/widgets'}));
    fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(root, 'docs', 'theming.md'), '# Theming\n\nHow to theme.\n');
    fs.mkdirSync(path.join(root, 'src', 'components', 'Button'), {recursive: true});
    fs.writeFileSync(
        path.join(root, 'src', 'components', 'Button', 'README.md'),
        '# Button\n\nA button.\n',
    );
    if (readmeBody !== undefined) {
        fs.writeFileSync(path.join(root, 'README.md'), readmeBody);
    }

    const run = () => buildDocs(createDefaultDocsConfig(root));
    const readIndex = () => fs.readFileSync(path.join(root, 'build', 'docs', 'INDEX.md'), 'utf8');
    const readReadme = () => fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    return {root, run, readIndex, readReadme};
}

test('places the README "For AI agents" section at the top of INDEX.md', () => {
    const pkg = buildTempPackage(
        [
            '# @demo/widgets',
            '',
            '![badge](https://img.shields.io/x.svg)',
            '',
            '## For AI agents',
            '',
            'Widget primitives for dashboards.',
            '',
            '### When to use',
            '',
            '- Building a grid.',
        ].join('\n'),
    );

    pkg.run();
    const index = pkg.readIndex();

    // The section, cleaned of the badge, leads the generated doc sections, with
    // positioning and the When-to-use prose both surfaced.
    assert.match(index, /## For AI agents/);
    assert.match(index, /Widget primitives for dashboards\./);
    assert.match(index, /### When to use/);
    assert.match(index, /Building a grid\./);
    assert.doesNotMatch(index, /shields\.io/);
    assert.ok(
        index.indexOf('## For AI agents') < index.indexOf('## Components'),
        'AI section should appear before the doc sections',
    );
});

test('surfaces the README Install and Usage sections in INDEX.md', () => {
    const pkg = buildTempPackage(
        [
            '# @demo/widgets',
            '',
            '## Installation',
            '',
            '```sh',
            'npm install @demo/widgets',
            '```',
            '',
            '## Usage',
            '',
            'Wrap your app in the provider.',
        ].join('\n'),
    );

    pkg.run();
    const index = pkg.readIndex();

    // `## Installation` is normalized to the canonical `## Install` label.
    assert.match(index, /## Install\b/);
    assert.match(index, /npm install @demo\/widgets/);
    assert.match(index, /## Usage/);
    assert.match(index, /Wrap your app in the provider\./);
    assert.ok(
        index.indexOf('## Usage') < index.indexOf('## Components'),
        'package sections should precede the doc sections',
    );
});

test('rewrites README overview links to their copied doc locations', () => {
    // buildTempPackage ships docs/theming.md → guides/theming.md. A README prose
    // link to the repo path must be rewritten relative to INDEX.md (outDir root),
    // not left pointing at the no-longer-present ./docs/theming.md.
    const pkg = buildTempPackage(
        [
            '# @demo/widgets',
            '',
            '## For AI agents',
            '',
            'Primitives.',
            '',
            '### Useful docs',
            '',
            '- [Theming](./docs/theming.md)',
        ].join('\n'),
    );

    pkg.run();
    const index = pkg.readIndex();

    assert.match(index, /\[Theming\]\(\.\/guides\/theming\.md\)/);
    assert.doesNotMatch(index, /docs\/theming\.md/);
});

test('summarizes a component index entry from its intro paragraph', () => {
    const pkg = buildTempPackage('# @demo/widgets\n\n## For AI agents\n\nPrimitives.\n');

    pkg.run();

    // Button/README.md is "# Button\n\nA button." → the paragraph becomes the summary.
    assert.match(pkg.readIndex(), /\[Button\]\(\.\/components\/Button\.md\) — A button\./);
});
