import { expect } from 'chai';
import isValidPath from './is-valid-path';

describe('isValidPath', () => {
  describe('valid paths', () => {
    ['src/index.ts', 'index.ts', 'a/b/c/d.ts', 'README.md', 'dist/esm/index.js'].forEach((p) => {
      it(`accepts "${p}"`, () => {
        expect(isValidPath(p)).to.be.true;
      });
    });
  });

  describe('invalid paths', () => {
    it('rejects leading ../', () => expect(isValidPath('../sibling')).to.be.false);
    it('rejects leading ./', () => expect(isValidPath('./local')).to.be.false);
    it('rejects absolute path', () => expect(isValidPath('/absolute')).to.be.false);
    it('rejects backslash', () => expect(isValidPath('back\\slash')).to.be.false);
    it('rejects embedded .. segments (path traversal)', () => expect(isValidPath('foo/../../../bar')).to.be.false);
    it('rejects shorter embedded .. variant', () => expect(isValidPath('a/b/../../c')).to.be.false);
    it('rejects trailing ..', () => expect(isValidPath('foo/..')).to.be.false);
    it('rejects NUL byte', () => expect(isValidPath('foo\0bar')).to.be.false);
    it('rejects standalone "."', () => expect(isValidPath('.')).to.be.false);
    it('rejects embedded "." segment', () => expect(isValidPath('foo/./bar')).to.be.false);
  });
});
