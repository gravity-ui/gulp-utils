import * as path from 'node:path';

import type * as Typescript from 'typescript';

export function transformLocalModulesFactory(ts: typeof Typescript) {
    function transformFile(
        sourceFile: Typescript.SourceFile,
        context: Typescript.TransformationContext,
    ) {
        const options = context.getCompilerOptions();
        return ts.visitNode(sourceFile, visitor);

        function visitor<T extends Typescript.Node>(node: T): T {
            let modulePath;
            if (
                (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
                node.moduleSpecifier &&
                ts.isStringLiteral(node.moduleSpecifier)
            ) {
                modulePath = node.moduleSpecifier.text;
            } else if (
                (isDynamicImport(ts, node) || isRequire(ts, node)) &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                modulePath = node.arguments[0].text;
            } else if (
                ts.isImportTypeNode(node) &&
                ts.isLiteralTypeNode(node.argument) &&
                ts.isStringLiteral(node.argument.literal)
            ) {
                modulePath = node.argument.literal.text;
            }

            if (modulePath) {
                const resolvedPath = resolveModule(ts, modulePath, sourceFile.fileName, options);
                if (resolvedPath) {
                    if (ts.isImportDeclaration(node)) {
                        const newNode = updateImportDeclaration(node, context, resolvedPath);
                        ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
                        return newNode as unknown as T;
                    }
                    if (ts.isExportDeclaration(node)) {
                        const newNode = updateExportDeclaration(node, context, resolvedPath);
                        ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
                        return newNode as unknown as T;
                    }
                    if (isDynamicImport(ts, node) || isRequire(ts, node)) {
                        const newStatement = context.factory.updateCallExpression(
                            node,
                            node.expression,
                            node.typeArguments,
                            context.factory.createNodeArray([
                                context.factory.createStringLiteral(resolvedPath),
                            ]),
                        );
                        ts.setSourceMapRange(newStatement, ts.getSourceMapRange(node));
                        return newStatement as unknown as T;
                    }
                    if (ts.isImportTypeNode(node)) {
                        const newNode = updateImportTypeNode(node, context, resolvedPath);
                        ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
                        return newNode as unknown as T;
                    }
                }
                return node;
            }
            return ts.visitEachChild(node, visitor, context);
        }
    }

    return function transformLocalModules<T extends Typescript.Node>(
        context: Typescript.TransformationContext,
    ) {
        return (sourceFileOrBundle: T) => {
            if (ts.isSourceFile(sourceFileOrBundle)) {
                return transformFile(sourceFileOrBundle, context) as unknown as T;
            }
            if (ts.isBundle(sourceFileOrBundle)) {
                // don't transform bundles yet
                return sourceFileOrBundle;
            }
            return sourceFileOrBundle;
        };
    };
}

function resolveModule(
    ts: typeof Typescript,
    module: string,
    sourceFileName: string,
    options: Typescript.CompilerOptions,
) {
    // TODO: Think about how to detect problematic packages
    if (module.startsWith('lodash/') && !module.endsWith('.js')) {
        return `${module}.js`;
    }

    if (module.startsWith('swiper/react') && !module.endsWith('.js')) {
        return `${module}.js`;
    }

    if (!module.startsWith('.')) {
        return undefined;
    }
    const resolve = ts.resolveModuleName(module, sourceFileName, options, ts.sys);
    if (resolve.resolvedModule && !resolve.resolvedModule.isExternalLibraryImport) {
        const relativePath = path.relative(
            path.dirname(sourceFileName),
            resolve.resolvedModule.resolvedFileName,
        );
        const parsed = path.parse(relativePath);
        let ext = parsed.ext;
        switch (ext) {
            case '.ts':
            case '.tsx': {
                ext = '.js';
                break;
            }
            case '.cts': {
                ext = '.cjs';
                break;
            }
            case '.mts': {
                ext = '.mjs';
                break;
            }
        }

        const newPath = path.join(parsed.dir, `${parsed.name}${ext}`);
        return newPath.startsWith('.') ? newPath : `./${newPath}`;
    }
    return undefined;
}

function updateImportDeclaration(
    node: Typescript.ImportDeclaration,
    context: Typescript.TransformationContext,
    resolvedPath: string,
) {
    return context.factory.updateImportDeclaration(
        node,
        node.modifiers,
        node.importClause,
        context.factory.createStringLiteral(resolvedPath),
        node.attributes ?? node.assertClause,
    );
}

function updateExportDeclaration(
    node: Typescript.ExportDeclaration,
    context: Typescript.TransformationContext,
    resolvedPath: string,
) {
    return context.factory.updateExportDeclaration(
        node,
        node.modifiers,
        node.isTypeOnly,
        node.exportClause,
        context.factory.createStringLiteral(resolvedPath),
        node.attributes ?? node.assertClause,
    );
}

function updateImportTypeNode(
    node: Typescript.ImportTypeNode,
    context: Typescript.TransformationContext,
    resolvedPath: string,
) {
    return context.factory.updateImportTypeNode(
        node,
        context.factory.createLiteralTypeNode(context.factory.createStringLiteral(resolvedPath)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.attributes ?? (node.assertions as any),
        node.qualifier,
        node.typeArguments,
        node.isTypeOf,
    );
}

function isDynamicImport(
    ts: typeof Typescript,
    node: Typescript.Node,
): node is Typescript.CallExpression {
    return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function isRequire(
    ts: typeof Typescript,
    node: Typescript.Node,
): node is Typescript.CallExpression {
    return (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
    );
}
