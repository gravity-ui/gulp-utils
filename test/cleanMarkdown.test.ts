import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import {cleanMarkdown, extractSection, extractSummary, extractTitle} from '../src/cleanMarkdown.js';

test('drops SANDBOX and LANDING blocks but keeps GITHUB_BLOCK content', () => {
    const out = cleanMarkdown(
        [
            '<!--GITHUB_BLOCK-->',
            '# Button',
            '<!--/GITHUB_BLOCK-->',
            '',
            '<!--SANDBOX',
            'render(<Button />)',
            'SANDBOX-->',
            '',
            '<!--LANDING_BLOCK',
            'landing only',
            'LANDING_BLOCK-->',
            '',
            'Body text.',
            '',
        ].join('\n'),
    );

    assert.match(out, /^# Button$/m);
    assert.match(out, /^Body text\.$/m);
    assert.doesNotMatch(out, /SANDBOX|LANDING_BLOCK|GITHUB_BLOCK/);
});

test('strips badges and images', () => {
    const out = cleanMarkdown('# X\n\n![badge](https://img.shields.io/x.svg)\n\nBody.\n');

    assert.doesNotMatch(out, /shields\.io/);
    assert.match(out, /^Body\.$/m);
});

test('extractSummary takes the first prose line after the import fence', () => {
    const md = '# Button\n\n```tsx\nimport {Button} from "x";\n```\n\nButtons trigger actions.\n';

    assert.equal(extractSummary(md), 'Buttons trigger actions.');
});

test('extractSummary is empty when a heading follows the title directly', () => {
    const md = '# Alert\n\n```tsx\nimport x\n```\n\n### Theme\n\nnormal.\n';

    assert.equal(extractSummary(md), '');
});

test('extractSummary unwraps links to plain text', () => {
    assert.equal(extractSummary('# A\n\nUses [B](./B.md) here.\n'), 'Uses B here.');
});

test('extractTitle returns the first heading text, else empty', () => {
    assert.equal(extractTitle('## Table\n\nbody'), 'Table');
    assert.equal(extractTitle('no heading here'), '');
});

test('extractSection extracts a heading and its body, case-insensitively', () => {
    const md = ['# Title', '', '## For AI Agents', '', 'Body line.', '', '## Next', '', 'x'].join(
        '\n',
    );

    assert.equal(extractSection(md, 'for ai agents'), '## For AI Agents\n\nBody line.');
});

test('extractSection stops at the next same-or-higher heading, keeps deeper ones', () => {
    const md = [
        '## For AI agents',
        '',
        'Intro.',
        '',
        '### When to use',
        '',
        '- a',
        '',
        '## Other',
        '',
        'nope',
    ].join('\n');

    const section = extractSection(md, 'For AI agents');
    assert.match(section, /### When to use/);
    assert.doesNotMatch(section, /nope/);
});

test('extractSection ignores headings inside fenced code blocks', () => {
    const md = ['## For AI agents', '', '```sh', '# not a heading', '```', '', 'End.'].join('\n');

    const section = extractSection(md, 'For AI agents');
    assert.match(section, /# not a heading/);
    assert.match(section, /End\./);
});

test('extractSection returns an empty string when the heading is absent', () => {
    assert.equal(extractSection('# Only a title\n\nText.', 'For AI agents'), '');
});
