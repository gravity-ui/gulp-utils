import * as path from 'node:path';

import PluginError from 'plugin-error';
import * as through from 'through2';
import type * as Typescript from 'typescript';
import Vinyl from 'vinyl';
// @ts-expect-error
import applySourceMap from 'vinyl-sourcemaps-apply';

import {transformLocalModulesFactory} from './transformLocalImports.js';
import {transformScssImportsFactory} from './transformScssImports.js';

const pluginName = '@gravity-ui/gulp-utils';

interface Options {
    projectPath?: string;
    configName?: string;
    compilerOptions?: Typescript.server.protocol.CompilerOptions;
    ts?: typeof Typescript;
}

interface Source {
    fileName: string;
    text: string;
}

interface OutputFile {
    file: Vinyl;
    jsSource?: Source;
    jsMap?: Source;
    dtsSource?: Source;
    dtsMap?: Source;
}

export async function createTypescriptProject(options: Options = {}) {
    const projectPath = options.projectPath ?? process.cwd();
    const configName = options.configName ?? 'tsconfig.json';
    const ts = options.ts ?? (await import('typescript'));
    const tsConfigPath = ts.findConfigFile(projectPath, ts.sys.fileExists, configName);
    if (!tsConfigPath) {
        throw new Error(`Could not find a valid '${configName}' inside ${projectPath}.`);
    }

    const parseConfigFileHost: Typescript.ParseConfigFileHost = {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        readDirectory: ts.sys.readDirectory,
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        // this is required in types but not used
        onUnRecoverableConfigFileDiagnostic: () => {},
    };

    const tsParsedConfig = ts.getParsedCommandLineOfConfigFile(
        tsConfigPath,
        ts.convertCompilerOptionsFromJson(options.compilerOptions, projectPath).options,
        parseConfigFileHost,
    );

    if (!tsParsedConfig) {
        throw new Error(`Could not parse ts config ${tsConfigPath}`);
    }

    const inputFiles = new Map<string, Vinyl>();
    const sources = new Map<string, Typescript.SourceFile>();
    const host = createHost(tsParsedConfig.options);

    const compileProject = function compileProject(
        opt: {customTransformers?: Typescript.CustomTransformers} = {},
    ) {
        inputFiles.clear();
        sources.clear();
        let hasSourceMap = false;

        return through.obj(
            (file, _encoding, cb) => {
                if (!Vinyl.isVinyl(file)) {
                    return cb(new PluginError(pluginName, ''));
                }
                if (file.isNull()) {
                    return cb(null, file);
                }
                if (file.isStream()) {
                    return cb(new PluginError(pluginName, 'Streaming is not supported'));
                }

                inputFiles.set(file.path, file);
                if (file.sourceMap) {
                    hasSourceMap = true;
                }
                return cb();
            },
            function flush(cb) {
                const self = this;
                const program = ts.createProgram({
                    rootNames: [...inputFiles.keys()],
                    options: {
                        ...tsParsedConfig.options,
                        outDir: undefined,
                        sourceMap: hasSourceMap,
                        inlineSourceMap: false,
                        inlineSources: false,
                    },
                    host,
                });
                let allDiagnostics = ts.getPreEmitDiagnostics(program);

                if (!hasErrors(allDiagnostics)) {
                    const output = new Map<string, OutputFile>();
                    const result = program.emit(
                        undefined,
                        (fileName, text, _writeByteOrderMark, _onError, sourceFiles) => {
                            if (!sourceFiles) {
                                return;
                            }
                            if (sourceFiles.length !== 1) {
                                throw new Error(
                                    'Failure: sourceFiles in WriteFileCallback should have length 1, got ' +
                                        sourceFiles.length,
                                );
                            }
                            const source = sourceFiles[0];
                            const originalName = source.fileName;
                            const file = inputFiles.get(originalName);
                            if (!file) {
                                return;
                            }
                            let outputFile = output.get(originalName);
                            if (!outputFile) {
                                outputFile = {file};
                            }

                            if (fileName.endsWith('d.ts')) {
                                outputFile.dtsSource = {fileName, text};
                            } else if (fileName.endsWith('.d.ts.map')) {
                                outputFile.dtsMap = {fileName, text};
                            } else if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
                                outputFile.jsSource = {fileName, text};
                            } else if (
                                fileName.endsWith('.js.map') ||
                                fileName.endsWith('.jsx.map')
                            ) {
                                outputFile.jsMap = {fileName, text};
                            }

                            output.set(originalName, outputFile);
                        },
                        undefined,
                        undefined,
                        opt.customTransformers,
                    );

                    allDiagnostics = ts.sortAndDeduplicateDiagnostics(
                        allDiagnostics.concat(result.diagnostics),
                    );

                    if (!hasErrors(allDiagnostics)) {
                        for (const {file, jsSource, jsMap, dtsSource} of output.values()) {
                            if (jsSource) {
                                file.path = jsSource.fileName;
                                file.contents = Buffer.from(removeSourceMapComment(jsSource.text));
                                if (file.sourceMap && jsMap) {
                                    const parsedMap = JSON.parse(jsMap.text);
                                    parsedMap.file = file.relative;
                                    const directory = path.dirname(file.path);
                                    parsedMap.sources = parsedMap.sources.map((name: string) => {
                                        const absolute = path.resolve(directory, name);
                                        return path.relative(file.base, absolute);
                                    });
                                    applySourceMap(file, parsedMap);
                                }
                                self.push(file);
                            }
                            if (dtsSource) {
                                self.push(
                                    new Vinyl({
                                        path: dtsSource.fileName,
                                        contents: Buffer.from(dtsSource.text),
                                        cwd: projectPath,
                                        base: file.base,
                                    }),
                                );
                            }
                        }
                    }
                }

                if (allDiagnostics.length > 0) {
                    console.log(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host));
                }

                if (hasErrors(allDiagnostics)) {
                    throw new Error('Compilation failed');
                }

                cb();
            },
        );
    };
    compileProject.customTransformers = {
        transformScssImports: transformScssImportsFactory(ts),
        transformLocalModules: transformLocalModulesFactory(ts),
    };

    return compileProject;

    function createHost(compilerOptions: Typescript.CompilerOptions) {
        const compilerHost = ts.createCompilerHost(compilerOptions);
        compilerHost.getCurrentDirectory = () => projectPath;
        const fileExists = compilerHost.fileExists.bind(compilerHost);
        compilerHost.fileExists = (fileName) => {
            if (inputFiles.has(fileName)) {
                return true;
            }
            return fileExists(fileName);
        };
        const readFile = compilerHost.readFile.bind(compilerHost);
        compilerHost.readFile = (fileName) => {
            const file = inputFiles.get(fileName);
            if (file) {
                return file.isBuffer() ? file.contents.toString('utf-8') : '';
            }

            return readFile(fileName);
        };
        const getSourceFile = compilerHost.getSourceFile.bind(compilerHost);
        compilerHost.getSourceFile = (fileName, langVersionOrOptions, onError) => {
            let source = sources.get(fileName);
            if (source) {
                return source;
            }
            const file = inputFiles.get(fileName);
            if (file) {
                source = ts.createSourceFile(
                    fileName,
                    file.isBuffer() ? file.contents.toString('utf-8') : '',
                    langVersionOrOptions,
                );
                sources.set(fileName, source);
                return source;
            }
            return getSourceFile(fileName, langVersionOrOptions, onError);
        };

        return compilerHost;
    }

    function hasErrors(diagnostics: readonly Typescript.Diagnostic[]) {
        return diagnostics.some(({category}) => category === ts.DiagnosticCategory.Error);
    }
}

function removeSourceMapComment(content: string) {
    return content.replace(/\n\/\/# sourceMappingURL=.+$/im, '');
}
