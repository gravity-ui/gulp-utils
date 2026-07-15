// @gravity-ui/readme-validator ships JS only (no bundled .d.ts, no `exports`
// map, `types: null`), so declare the slice of its public API that buildDocs
// consumes. Mirrors the package's own `src/index.ts` / `readme-parse.ts`.
declare module '@gravity-ui/readme-validator' {
    export interface PackageExtract {
        agentPositioning: string | null;
        agentProse: string | null;
        install: string | null;
        usage: string | null;
    }
    export interface ComponentExtract {
        title: string | null;
        description: string | null;
    }
    export function parsePackageReadme(content: string): PackageExtract;
    export function parseComponentReadme(content: string): ComponentExtract;
}
