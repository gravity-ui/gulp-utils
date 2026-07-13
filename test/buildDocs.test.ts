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
