import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';

import * as ts from 'typescript';

import {transformLocalModulesFactory} from '../src/transformLocalImports.js';

for (const [modulePath, expectedModulePath] of [
    ['./types', './types.js'],
    ['./types.js', './types.js'],
    ['external', 'external'],
]) {
    test(`transforms nested import types inside ${modulePath}`, (t) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'gulp-utils-import-types-'));
        t.after(() => rmSync(directory, {recursive: true, force: true}));

        const types = 'export type Wrapper<T> = T; export type Props = {id: string};';
        writeFileSync(path.join(directory, 'types.ts'), types);
        const externalDirectory = path.join(directory, 'node_modules', 'external');
        mkdirSync(externalDirectory, {recursive: true});
        writeFileSync(path.join(externalDirectory, 'index.d.ts'), types);

        const sourceFile = ts.createSourceFile(
            path.join(directory, 'index.d.ts'),
            `export type Result = import("${modulePath}").Wrapper<import("./types").Wrapper<import("./types").Props>>;`,
            ts.ScriptTarget.Latest,
            true,
        );
        const result = ts.transform<ts.SourceFile>(sourceFile, [transformLocalModulesFactory(ts)], {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
        });
        try {
            assert.equal(
                ts.createPrinter().printFile(result.transformed[0]).trim(),
                `export type Result = import("${expectedModulePath}").Wrapper<import("./types.js").Wrapper<import("./types.js").Props>>;`,
            );
        } finally {
            result.dispose();
        }
    });
}
