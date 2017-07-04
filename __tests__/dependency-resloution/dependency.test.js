import mockFs from 'mock-fs';
import { getDependecyTree } from '../../src/dependency-builder';
const vm = jest.genMockFromModule('vm');
jest.mock('vm');

const fileOne = 'import test1 from \'./test2\';';
const fileTwo = 'import test2 from \'npmPackage\';';
beforeEach(() => {
  mockFs({
    'my/project/component': {
      'test.js': fileOne,
      'test2.js': fileTwo,
    },
  });
});
describe('getDependecyTree', () => {
  it('should return missing dependency for component', () => {
    return getDependecyTree(process.cwd(), 'my/project/component/test.js').then((dependencies) => {
      expect(dependencies.missing).toEqual(['npmPackage']);
    });
  });
});

