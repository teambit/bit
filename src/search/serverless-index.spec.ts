// import { expect } from 'chai';
// import sinon from 'sinon';
// import * as path from 'path';
// import searchIndex from 'search-index';
// import serverlessIndex from '../search/serverless-index';
//
// describe('SeverLessIndex', () => {
//   describe('initializeIndex', () => {
//     it('should initial the index using search-index lib with some default settings', () => {
//       // this hack was taken from: https://github.com/sinonjs/sinon/issues/562#issuecomment-164522794
//       // it is needed because search-index library returns a function, not object.
//       const myStubbedModule = (moduleName) => {
//         const stub = sinon.stub();
//         require.cache[require.resolve(moduleName)] = {
//           default: stub,
//           exports: stub
//         };
//         return stub;
//       };
//       myStubbedModule('search-index');
//       const result = serverlessIndex.initializeIndex('test_path');
//
//       sinon.assert.calledWith(searchIndex, {
//         indexPath: path.normalize('test_path/search_index'),
//         logLevel: 'error',
//         stopwords: []
//       });
//       expect(result).to.be.a('Promise');
//     });
//   });
// });
