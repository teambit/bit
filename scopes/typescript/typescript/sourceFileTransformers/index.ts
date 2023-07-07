import ts from 'typescript';

export type SourceFileTransformer = (mapping: Record<string, string>) => ts.TransformerFactory<ts.SourceFile>;

export { classNamesTransformer } from './class';
export { interfaceNamesTransformer } from './interface';
export { variableNamesTransformer } from './variable';
export { functionNamesTransformer } from './function';
export { typeAliasNamesTransformer } from './typeAlias';
export { importPathTransformer } from './import-path';
