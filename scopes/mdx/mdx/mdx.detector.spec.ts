import { expect } from 'chai';
import { MDXDependencyDetector } from './mdx.detector';

describe('MDXDependencyDetector', () => {
  function expectDependencies(src: string, expectedDeps: string[]) {
    expect(new MDXDependencyDetector(['mdx']).detect(src)).to.deep.equal(expectedDeps);
  }
  describe('detect', () => {
    it('should correctly detect default import', () => {
      const src = 'import x from "y";';
      expectDependencies(src, ['y']);
    });
    it('should correctly detect star import', () => {
      const src = 'import * as y from "y";';
      expectDependencies(src, ['y']);
    });
    it('should correctly detect named import', () => {
      const src = 'import { x } from "y";';
      expectDependencies(src, ['y']);
    });
    it('should correctly detect import with no identifier', () => {
      const src = 'import "y";';
      expectDependencies(src, ['y']);
    });
  });
});
