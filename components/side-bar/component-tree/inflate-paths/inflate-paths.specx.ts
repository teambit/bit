// @uri please make sure these tests work for jest.

// import { expect } from 'chai';

// import { inflateToTree } from './inflate-paths';

// it('build tree from paths', () => {
//   const result = inflateToTree(['path'], (x) => x);

//   expect(result).to.deep.equal({
//     id: 'path',
//     children: undefined,
//   });
// });

// it('should use key selector', () => {
//   const result = inflateToTree([{ id: 'path' }], (x) => x.id);

//   expect(result).to.deep.equal({
//     id: 'path',
//     children: undefined,
//   });
// });

// it('should use key selector', () => {
//   const result = inflateToTree([{ id: 'path' }], (x) => x.id);

//   expect(result).to.deep.equal({
//     id: 'path',
//     children: undefined,
//   });
// });

// it('should create virtual root when items have no common ancestor', () => {
//   const result = inflateToTree(['path', 'another'], (x) => x);
//   expect(result).to.deep.equal({
//     id: '',
//     children: [
//       {
//         id: 'another',
//         children: undefined,
//       },
//       {
//         id: 'path',
//         children: undefined,
//       },
//     ],
//   });
// });

// it('should attach payload', () => {
//   const result = inflateToTree(
//     [{ id: 'path', p: 'one' }],
//     (x) => x.id,
//     (x) => x.p
//   );

//   expect(result).to.deep.equal({
//     id: 'path',
//     children: undefined,
//     payload: 'one',
//   });
// });
