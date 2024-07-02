import { Logger } from '@teambit/logger';
import ts from 'typescript';
// import { expect } from 'chai';
import path from 'path';

import { TypescriptCompiler } from './typescript-compiler';
import type { TsCompilerOptionsWithoutTsConfig } from './typescript-compiler-options';

const defaultOpts = {
  tsconfig: '',
  types: [],
};

describe('TypescriptCompiler', () => {
  describe('getDistPathBySrcPath', () => {
    it('should replace the extension with .js and prepend the dist dir', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.getDistPathBySrcPath('index.ts')).toEqual(path.join('dist', 'index.js'));
      expect(tsCompiler.getDistPathBySrcPath('index.tsx')).toEqual(path.join('dist', 'index.js'));
    });
    it('should not replace the extension if the file is not supported', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.getDistPathBySrcPath('style.css')).toEqual(path.join('dist', 'style.css'));
      expect(tsCompiler.getDistPathBySrcPath('index.d.ts')).toEqual(path.join('dist', 'index.d.ts'));
    });
  });
  describe('isFileSupported', () => {
    it('should support .ts files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.ts')).toBeTruthy;
    });
    it('should support .tsx files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.tsx')).toBeTruthy;
    });
    it('should not support .jsx files by default', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.jsx')).toBeFalsy;
    });
    it('should not support .js files by default', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.js')).toBeFalsy;
    });
    it('should support .jsx files when passing compileJsx', () => {
      const tsCompiler = getTsCompiler({ compileJsx: true, ...defaultOpts });
      expect(tsCompiler.isFileSupported('index.jsx')).toBeTruthy;
    });
    it('should support .js files when passing compileJs', () => {
      const tsCompiler = getTsCompiler({ compileJs: true, ...defaultOpts });
      expect(tsCompiler.isFileSupported('index.js')).toBeTruthy;
    });
    it('should not support .d.ts files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.d.ts')).toBeFalsy;
    });
  });
});

function getTsCompiler(opts: TsCompilerOptionsWithoutTsConfig = defaultOpts) {
  const finalOpts = Object.assign({}, defaultOpts, opts);
  return new TypescriptCompiler(
    'teambit.typescript/typescript-compiler',
    new Logger('test'),
    finalOpts,
    finalOpts.typescript,
    ts
  );
}
