# gulp-utils &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/gulp-utils)](https://www.npmjs.com/package/@gravity-ui/gulp-utils) [![CI](https://img.shields.io/github/actions/workflow/status/gravity-ui/gulp-utils/.github/workflows/ci.yml?label=CI&logo=github)](https://github.com/gravity-ui/gulp-utils/actions/workflows/ci.yml?query=branch:main)

Gulp utils for handling typescript compilation workflow.

## Usage

```ts
import {src, dest} from 'gulp';
import {createTypescriptProject, addVirtualFile} from '@gravity-ui/gulp-utils';

async function compile() {
  const tsProject = await createTypescriptProject({
    projectPath: 'path/to/project', // default, process.cwd
    configName: 'tsconfig.build.json', // default, tsconfig.json
    compilerOptions: {
      // allows rewrite compiler options from tsconfig.json, default {}
      declaration: true,
    },
    ts: await import('my-typescript-package'), // default, 'typescript'
  });

  return new Promise((resolve) => {
    src('src/**/*.ts')
      .pipe(
        tsProject({
          customTransformers: {
            before: [...Object.values(tsProject.customTransformers)],
            afterDeclarations: [...Object.values(tsProject.customTransformers)],
          },
        }),
      )
      .pipe(
        addVirtualFile({
          fileName: 'package.json',
          text: JSON.stringify({type: 'commonjs'}),
        }),
      )
      .pipe(dest('build'))
      .on('end', resolve);
  });
}
```

## buildDocs

Generates a documentation tree for AI agents from a package's markdown sources
(component/hook READMEs plus any markdown under `docs/`), cleaned of Storybook /
GitHub service markers, badges and images. The output ships inside the npm
tarball so an agent working in a consumer project reads documentation matching
the installed version, discoverable via a generated `INDEX.md`.

`buildDocs` is a plain function (not a gulp plugin), so it works from any build
pipeline — call it from a gulp task, an npm script, or a rollup hook.

```ts
import {buildDocs, createDefaultDocsConfig} from '@gravity-ui/gulp-utils';

// buildDocs() with no config uses createDefaultDocsConfig(), the shared
// gravity-ui layout:
//   docs/**/*.md            → build/docs/guides/
//   src/components/*/README  → build/docs/components/   (legacy/ excluded)
//   src/hooks/*/README       → build/docs/hooks/        (private/ excluded)
buildDocs();
```

`rootDir` defaults to `process.cwd()`, and the package name shown in the
generated `INDEX.md` is read from that `package.json` — pass them explicitly
(`createDefaultDocsConfig(rootDir, packageName)`) to override.
Pass a custom `DocsConfig` to change the sources, output directory or INDEX
section order. Intra-repo `README.md` links are rewritten to resolve inside the
output; links to docs that aren't shipped are unwrapped to plain text.

The package README's `For AI agents` section, when present, is cleaned and placed
at the top of the generated `INDEX.md`. A `Documentation for AI agents` pointer
section is also appended once to that README, linking to the generated tree.
