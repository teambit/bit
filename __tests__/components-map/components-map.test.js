import mockFs from 'mock-fs';
import * as componentsMap from '../../src/components-map';

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
    const result = componentsMap.build('my/project', 'my/project/components');
    return result.then((map) => {
      expect(map).toEqual({
        'bit.envs/compilers/flow::2': { dependencies: [], file: 'impl.js', loc: 'compilers/flow/bit.envs/2', isFromInlineScope: false },
        'bit.utils/object/foreach::1': { dependencies: [], file: 'impl.js', loc: 'object/foreach/bit.utils/1', isFromInlineScope: false },
        'project/global/is-number::1': { dependencies: [], file: 'impl.js', loc: 'global/is-number/project/1', isFromInlineScope: true },
        'bit.utils/object/values::1': { dependencies: ['bit.utils/object/foreach::1'], file: 'impl.js', loc: 'object/values/bit.utils/1', isFromInlineScope: false }});
    });
  });
});

describe('buildForInline', () => {
  const projectBitJson = {
    impl: 'impl.js',
    spec: 'spec.js',
    misc: [],
    compiler: 'none',
    tester: 'none',
    dependencies: { 'bit.envs/compilers/flow': '2', 'bit.utils/object/values': '1' },
  };
  it('should create a map from inline_components directory', () => {
    const result = componentsMap.buildForInline('my/project/inline_components', projectBitJson);
    return result.then((map) => {
      expect(map).toEqual({ 'global/is-string': { file: 'impl.js', loc: 'global/is-string' } });
    });
  });
});
