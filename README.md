# gulp-utils &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/gulp-utils)](https://www.npmjs.com/package/@gravity-ui/gulp-utils) [![CI](https://img.shields.io/github/actions/workflow/status/gravity-ui/gulp-utils/.github/workflows/ci.yml?label=CI&logo=github)](https://github.com/gravity-ui/gulp-utils/actions/workflows/ci.yml?query=branch:main)

Gulp utils for handling typescript compilation workflow.

## Install

```shell
npm install --save-dev @gravity-ui/gulp-utils
```

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

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

## For AI agents

Build-time gulp utilities for `@gravity-ui` packages — reach for it to compile TypeScript with custom transformers and to ship a docs tree inside an npm tarball that AI agents can read at the installed version.

### When to use

- Compiling a package's TypeScript with `createTypescriptProject`, including custom transformers applied to both emit and declaration files.
- Injecting virtual files into the gulp stream (e.g. a generated `package.json`) with `addVirtualFile`.
- Generating an `INDEX`-ed documentation tree for AI agents from a package's component/hook READMEs and `docs/` markdown via `buildDocs`.

### When not to use

- Plain application code at runtime — this is a build-time tool, not something consumers import into shipped apps.
- Hand-rolling a TypeScript build without gulp — `createTypescriptProject` is a gulp plugin factory; for non-gulp pipelines use the `typescript` package directly.

### Common pitfalls

- **`createTypescriptProject` is async.** `await` it before calling the returned `tsProject()` in the pipe — the factory reads the `tsconfig` and resolves the `ts` module lazily.
- **Custom transformers go in two places.** Pass them under `customTransformers.before` for emit and `customTransformers.afterDeclarations` for `.d.ts` files; a transformer only in `before` won't touch the declarations.
- **`buildDocs` is a function, not a gulp plugin.** Call it directly from a gulp task, npm script, or rollup hook; do not `.pipe()` into it.
- **`buildDocs` reads `package.json` from `rootDir` (default `process.cwd()`).** Pass `createDefaultDocsConfig(rootDir, packageName)` explicitly when the package name or location is not what `cwd` resolves to.
