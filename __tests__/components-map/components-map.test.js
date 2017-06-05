import mockFs from 'mock-fs';
import ComponentsMap from '../../src/maps/components-map';

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

const bitJsonValuesFixture = Object.assign({}, bitJsonFixture);
bitJsonValuesFixture.dependencies = { 'bit.utils/object/foreach': '1' };

beforeEach(() => {
  mockFs({
    'my/project/.bit': {
      'scope.json': JSON.stringify({ name: 'project' }),
    },
    'my/project/components/compilers/flow/bit.envs/2': {
      'bit.json': JSON.stringify(bitJsonFixture),
    },
    'my/project/components/object/foreach/bit.utils/1': {
      'bit.json': JSON.stringify(bitJsonFixture),
    },
    'my/project/components/object/values/bit.utils/1': {
      'bit.json': JSON.stringify(bitJsonValuesFixture),
    },
    'my/project/components/global/is-number/project/1': {
      'bit.json': JSON.stringify(bitJsonFixture),
    },
    'my/project/inline_components/global/is-string': {},
  });
});

afterEach(() => {
  mockFs.restore();
});

describe('build', () => {
  it('should create a map from components directory', () => {
    return ComponentsMap.create('my/project', {}, 'project').then((componentsMap) => {
      const flowComponent = componentsMap._map['compilers/flow/bit.envs']['2'];
      expect(flowComponent.name).toEqual('flow');
      expect(flowComponent.namespace).toEqual('compilers');
      expect(flowComponent.scope).toEqual('bit.envs');
      expect(flowComponent.version).toEqual('2');
    });
  });
});
