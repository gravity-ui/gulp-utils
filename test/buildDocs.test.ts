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

    // The section, cleaned of the badge, leads the generated doc sections.
    assert.match(index, /## For AI agents/);
    assert.match(index, /Widget primitives for dashboards\./);
    assert.doesNotMatch(index, /shields\.io/);
    assert.ok(
        index.indexOf('## For AI agents') < index.indexOf('## Components'),
        'AI section should appear before the doc sections',
    );
});

test('appends a Documentation-for-AI-agents pointer to README.md, only once', () => {
    const pkg = buildTempPackage('# @demo/widgets\n\n## For AI agents\n\nPrimitives.\n');

    pkg.run();
    pkg.run();
    const readme = pkg.readReadme();

    const occurrences = readme.split('## Documentation for AI agents').length - 1;
    assert.equal(occurrences, 1, 'pointer section must not be duplicated across runs');
    assert.match(readme, /build\/docs\/INDEX\.md/);
});

test('still builds and adds the pointer when README has no AI section', () => {
    const pkg = buildTempPackage('# @demo/widgets\n\nJust a description.\n');

    pkg.run();

    assert.doesNotMatch(pkg.readIndex(), /## For AI agents/);
    assert.match(pkg.readIndex(), /## Components/);
    assert.match(pkg.readReadme(), /## Documentation for AI agents/);
});
