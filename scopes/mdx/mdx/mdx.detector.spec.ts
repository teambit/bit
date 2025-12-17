import { expect } from 'chai';

it('should work', () => {
  expect(true).to.equal(true);
});

// // Skip these mdx detector test cases since esm imports are not well-supported in jest tester
// import { MDXDependencyDetector } from './mdx.detector';
//
// describe('MDXDependencyDetector', () => {
//   function expectDependencies(src: string, expectedDeps: string[]) {
//     expect(new MDXDependencyDetector(['mdx']).detect(src)).to.deep.equal(expectedDeps);
//   }
//   describe('detect', () => {
//     it('should correctly detect default import', () => {
//       const src = 'import x from "y";';
//       expectDependencies(src, ['y']);
//     });
//     it('should correctly detect star import', () => {
//       const src = 'import * as y from "y";';
//       expectDependencies(src, ['y']);
//     });
//     it('should correctly detect named import', () => {
//       const src = 'import { x } from "y";';
//       expectDependencies(src, ['y']);
//     });
//     it('should correctly detect import with no identifier', () => {
//       const src = 'import "y";';
//       expectDependencies(src, ['y']);
//     });
//   });
// });
