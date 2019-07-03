// @flow
import Vinyl from 'vinyl';
import type { PathOsBasedRelative, PathLinuxRelative } from '../utils/path';
import { SourceFile } from '../consumer/component/sources';
import ExtensionFile from './extension-file';

export type CompilerResults = Vinyl[] | { dists: Vinyl[], mainFile?: string, packageJson?: Object };

export type ContextParam = {
  componentObject: Object, // see src/consumer/component/consumer-component.js toObject() method
  rootDistDir: PathOsBasedRelative,
  componentDir: PathLinuxRelative,
  isolate: Function
};

export interface CurrentCompiler {
  run(files: SourceFile[], rootDistDir: PathOsBasedRelative, context: ContextParam): CompilerResults;
}

export interface FutureCompiler {
  action({
    files: SourceFile[],
    rawConfig: Object,
    dynamicConfig: Object,
    configFiles: ExtensionFile[],
    api: Object,
    context: ContextParam
  }): CompilerResults;
}
