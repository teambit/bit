import { expect } from 'chai';
import path from 'path';
import { TypescriptCompiler } from './typescript.compiler';

describe('TypescriptCompiler', () => {
  describe('getDistPathBySrcPath', () => {
    it('should replace the extension with .js and prepend the dist dir', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.getDistPathBySrcPath('index.ts')).to.equal(path.join('dist', 'index.js'));
      expect(tsCompiler.getDistPathBySrcPath('index.tsx')).to.equal(path.join('dist', 'index.js'));
    });
    it('should not replace the extension if the file is not supported', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.getDistPathBySrcPath('style.css')).to.equal(path.join('dist', 'style.css'));
      expect(tsCompiler.getDistPathBySrcPath('index.d.ts')).to.equal(path.join('dist', 'index.d.ts'));
    });
  });
  describe('isFileSupported', () => {
    it('should support .ts files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.ts')).to.be.true;
    });
    it('should support .tsx files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.tsx')).to.be.true;
    });
    it('should not support .js files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.js')).to.be.false;
    });
    it('should not support .d.ts files', () => {
      const tsCompiler = getTsCompiler();
      expect(tsCompiler.isFileSupported('index.d.ts')).to.be.false;
    });
  });
});

function getTsCompiler() {
  return new TypescriptCompiler({}, []);
}
