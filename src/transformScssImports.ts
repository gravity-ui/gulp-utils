import type * as Typescript from 'typescript';

export function transformScssImportsFactory(ts: typeof Typescript) {
    return function transformScssImports<T extends Typescript.Node>(
        context: Typescript.TransformationContext,
    ): Typescript.Transformer<T> {
        return (source) => {
            function visitor<Node extends Typescript.Node>(node: Node): Node {
                let modulePath;
                if (
                    ts.isImportDeclaration(node) &&
                    node.moduleSpecifier &&
                    ts.isStringLiteral(node.moduleSpecifier)
                ) {
                    modulePath = node.moduleSpecifier.text;
                    if (modulePath.endsWith('.scss')) {
                        const newNode = context.factory.updateImportDeclaration(
                            node,
                            node.modifiers,
                            node.importClause,
                            context.factory.createStringLiteral(
                                modulePath.replace(/\.scss$/, '.css'),
                            ),
                            node.attributes,
                        );
                        ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
                        return newNode as unknown as Node;
                    }
                } else if (
                    isRequire(node) &&
                    node.arguments[0] &&
                    ts.isStringLiteral(node.arguments[0])
                ) {
                    modulePath = node.arguments[0].text;
                    if (modulePath.endsWith('.scss')) {
                        const newStatement = context.factory.updateCallExpression(
                            node,
                            node.expression,
                            node.typeArguments,
                            context.factory.createNodeArray([
                                context.factory.createStringLiteral(
                                    modulePath.replace(/\.scss$/, '.css'),
                                ),
                            ]),
                        );
                        ts.setSourceMapRange(newStatement, ts.getSourceMapRange(node));
                        return newStatement as unknown as Node;
                    }
                }

                return ts.visitEachChild(node, visitor, context);
            }

            if (ts.isSourceFile(source)) {
                return ts.visitNode(source, visitor) as unknown as T;
            }

            return source;
        };
    };

    function isRequire(node: Typescript.Node): node is Typescript.CallExpression {
        return (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'
        );
    }
}
