# gulp-utils &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/gulp-utils)](https://www.npmjs.com/package/@gravity-ui/gulp-utils) [![CI](https://img.shields.io/github/actions/workflow/status/gravity-ui/gulp-utils/.github/workflows/ci.yml?label=CI&logo=github)](https://github.com/gravity-ui/gulp-utils/actions/workflows/ci.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/gulp-utils/)

Gulp utils for handling typescript compilation workflow.

## Usage

```ts
import {src, dest} from 'gulp';
import {createTypescriptProject, addVirtualFile} from '@gravity-ui/gulp-utils';

async function compile() {
    const tsProject = await createTypescriptProject({
        projectPath: 'path/to/project', // default, process.cwd
        configName: 'tsconfig.build.json', // default, tsconfig.json
        compilerOptions: { // allows rewrite compiler options from tsconfig.json, default {}
            declaration: true,
        },
        ts: await import('my-typescript-package'), // default, 'typescript'
    });

    return new Promise((resolve) => {
        src('src/**/*.ts')
            .pipe(tsProject({
                customTransformers: {
                    before: [...Object.values(tsProject.customTransformers)],
                    afterDeclarations: [...Object.values(tsProject.customTransformers)],
                }
            }))
            .pipe(addVirtualFile({
                fileName: 'package.json',
                text: JSON.stringify({type: 'commonjs'}),
            }))
            .pipe(dest('build'))
            .on('end', resolve);
    });
}
```
