import mockFs from 'mock-fs';
import {getDependecyTree} from '../../src/dependency-builder';
const vm = jest.genMockFromModule('vm');
jest.mock('vm');

const bitJsonFixture = {
  sources: {
    impl: 'impl.js',
    misc: [],
  },
  env: {
    compiler: 'none',
    tester: 'none',
  },
  dependencies: {},
};


describe('get dependency tree src/actions/bind.js', () => {
  it('should return dependency tree for bind.js with correct (ramda,bit-scope-client', () => {
    return getDependecyTree(process.cwd(), 'src/actions/bind.js').then((dependencies) => {
      //console.log(tree)
      expect(dependencies.missing).toEqual([]);
      dependencies.tree.forEach(component =>{
        if( component.component ==='src/actions/bind.js')
          component.packages.forEach(dep =>{
            if (dep.name  === 'bit-scope-client')  expect(dep.version).toEqual('0.6.3')
            if (dep.name  === 'ramda')  expect(dep.version).toEqual('0.22.1')
          })
      })
    });
  });
});
