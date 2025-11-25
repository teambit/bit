import type ts from 'typescript';

export type SourceFileTransformer = (mapping: Record<string, string>) => ts.TransformerFactory<ts.SourceFile>;

export { classNamesTransformer } from './class';
export { interfaceNamesTransformer } from './interface';
export { variableNamesTransformer } from './variable';
export { functionNamesTransformer } from './function';
export { typeAliasNamesTransformer } from './typeAlias';
export { importTransformer } from './import';
export { expressionStatementTransformer } from './expression-statement';
export { exportTransformer } from './export';
export { transformSourceFile } from './transform';
export { typeReferenceTransformer } from './type-reference';
