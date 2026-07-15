import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import {cleanMarkdown} from '../src/cleanMarkdown.js';

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
