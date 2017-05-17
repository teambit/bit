import fsMock from 'fs-extra';
import * as linksGenerator from '../../src/links-generator';

jest.mock('fs-extra');
fsMock.outputFile = jest.fn((file, content, cb) => cb());

afterEach(() => {
  fsMock.outputFile.mockClear();
});

const mapFixture = {
  'bit.envs/compilers/flow::2': {
    loc: 'compilers/flow/bit.envs/2',
    file: 'impl.js',
    dependencies: [],
    isFromLocalScope: true,
  },
  'bit.utils/object/foreach::1': {
    loc: 'object/foreach/bit.utils/1',
    file: 'dist/dist.js',
    dependencies: [],
  },
  'bit.utils/object/values::1': {
    loc: 'object/values/bit.utils/1',
    file: 'dist/dist.js',
    dependencies: ['bit.utils/object/foreach::1'],
  },
};

const namespacesMapFixture = { compilers: ['flow'] };

const projectBitJsonFixture = {
  impl: 'impl.js',
  spec: 'spec.js',
  misc: [],
  compiler: 'none',
  tester: 'none',
  dependencies:
    { 'bit.envs/compilers/flow': '2', 'bit.utils/object/values': '1' },
  packageDepndencies: undefined,
  dependencyMap: null,
  getDependenciesArray: () => ['bit.envs/compilers/flow::2', 'bit.utils/object/values::1'],
};

describe('dependencies', () => {
  it('should not create links if there are no dependencies', () => {
    const result = linksGenerator.dependencies('dir', {}, {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });

  it('should generate dependencies links', () => {
    const result = linksGenerator.dependencies('/my/project/components', mapFixture, projectBitJsonFixture);
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(3);
      expect(outputFileCalls[0][0]).toBe('/my/project/components/object/values/bit.utils/1/node_modules/bit/object/foreach/index.js');
      expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../../../../../object/foreach/bit.utils/1/dist/dist.js');");
    });
  });
});

describe('publicApiComponentLevel', () => {
  it('should not generate links if there are no dependencies', () => {
    const result = linksGenerator.publicApiComponentLevel('dir', {}, {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });
  it('should generate links', () => {
    const result = linksGenerator.publicApiComponentLevel('/my/project/node_modules/bit', mapFixture, projectBitJsonFixture);
    return result
      .then(() => {
        const outputFileCalls = fsMock.outputFile.mock.calls;

        // this makes sure it doesn't generate a link for "foreach" as it's not in the bit.json
        expect(outputFileCalls.length).toBe(2);

        expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/compilers/flow/index.js');
        expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../components/compilers/flow/bit.envs/2/impl.js');");

        expect(outputFileCalls[1][0]).toBe('/my/project/node_modules/bit/object/values/index.js');
        expect(outputFileCalls[1][1]).toBe("module.exports = require('../../../../components/object/values/bit.utils/1/dist/dist.js');");
      });
  });
});

describe('publicApiForInlineComponents', () => {
  const env = process.env.NODE_ENV;
  const inlineMapFixture = { 'global/is-string': { loc: 'global/is-string', file: 'impl.js', compiler: 'none' } };
  const inlineMapWithCompilerFixture = { 'global/is-string':
    { loc: 'global/is-string', file: 'dist/impl.js', compiler: 'bit.envs/compilers/babel::2' } };
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('should not create links if there are no inline components', () => {
    const result = linksGenerator.publicApiForInlineComponents('dir', {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });

  it('should generate public-api links', () => {
    const result = linksGenerator.publicApiForInlineComponents('/my/project/node_modules/bit',
      inlineMapFixture, '/my/project/inline_components');
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(1);
      expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/global/is-string/index.js');
      expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../inline_components/global/is-string/impl.js');");
    });
  });

  xit('should generate "register" public-api links when compiler is specified and environment is not prod', () => {
    process.env.NODE_ENV = 'dev';
    const result = linksGenerator.publicApiForInlineComponents('/my/project/node_modules/bit',
      inlineMapWithCompilerFixture, '/my/project/inline_components');
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(1);
      expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/global/is-string/index.js');
      expect(outputFileCalls[0][1]).toBe("module.exports = require('bit-javascript/register-component')('/my/project/inline_components/global/is-string','/my/project/inline_components/global/is-string/dist/impl.js');");
    });
  });

  it('should NOT generate "register" public-api links when compiler is specified but the environment is production', () => {
    process.env.NODE_ENV = 'production';
    const result = linksGenerator.publicApiForInlineComponents('/my/project/node_modules/bit',
      inlineMapWithCompilerFixture, '/my/project/inline_components');
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(1);
      expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/global/is-string/index.js');
      expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../inline_components/global/is-string/dist/impl.js');");
    });
  });
});

describe('publicApiRootLevel', () => {
  it('should not create links if there are no boxes', () => {
    const result = linksGenerator.publicApiRootLevel('dir', []);
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });

  it('should generate an index.js in the node_modules/bit root', () => {
    const result = linksGenerator.publicApiRootLevel('/my/project/node_modules/bit', namespacesMapFixture);
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(1);
      expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/index.js');
      expect(outputFileCalls[0][1]).toBe(`module.exports = {
  compilers: require('./compilers')
};`);
    });
  });
});

describe('publicApiNamespaceLevel', () => {
  it('should not create links if there are no namespaces', () => {
    const result = linksGenerator.publicApiNamespaceLevel('dir', {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });

  it('should generate an index.js in the node_modules/bit/namespace directory', () => {
    const result = linksGenerator.publicApiNamespaceLevel('/my/project/node_modules/bit', namespacesMapFixture);
    return result.then(() => {
      const outputFileCalls = fsMock.outputFile.mock.calls;
      expect(outputFileCalls.length).toBe(1);
      expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/compilers/index.js');
      expect(outputFileCalls[0][1]).toBe(`module.exports = {
  flow: require('./flow')
};`);
    });
  });
});

describe('publicApiForExportPendingComponents', () => {
  it('should not generate links if there are no export-pending components', () => {
    const result = linksGenerator.publicApiForExportPendingComponents('dir', {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });
  it('should generate links for components with isFromLocalScope = true', () => {
    const result = linksGenerator.publicApiForExportPendingComponents('/my/project/node_modules/bit', mapFixture);
    return result
      .then(() => {
        const outputFileCalls = fsMock.outputFile.mock.calls;
        expect(outputFileCalls.length).toBe(1);
        expect(outputFileCalls[0][0]).toBe('/my/project/node_modules/bit/compilers/flow/index.js');
        expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../components/compilers/flow/bit.envs/2/impl.js');");
      });
  });
});

describe('dependenciesForInlineComponents', () => {
  it('should not generate links if there are no dependencies in the inline-map', () => {
    const result = linksGenerator.dependenciesForInlineComponents('dir', {}, {});
    return result.then(() => {
      expect(fsMock.outputFile.mock.calls.length).toBe(0);
    });
  });
  it('should generate dependencies links for inline components', () => {
    const inlineMapFixture = { 'global/is-string': { loc: 'global/is-string', file: 'impl.js', compiler: 'none', dependencies: ['bit.utils/object/foreach::1'] } };
    const result = linksGenerator.dependenciesForInlineComponents('/my/project/inline_components', mapFixture, inlineMapFixture);
    return result
      .then(() => {
        const outputFileCalls = fsMock.outputFile.mock.calls;
        expect(outputFileCalls.length).toBe(3);

        // name level
        expect(outputFileCalls[0][0]).toBe('/my/project/inline_components/global/is-string/node_modules/bit/object/foreach/index.js');
        expect(outputFileCalls[0][1]).toBe("module.exports = require('../../../../../../../../components/object/foreach/bit.utils/1/dist/dist.js');");

        // namespace level
        expect(outputFileCalls[1][0]).toBe('/my/project/inline_components/global/is-string/node_modules/bit/object/index.js');
        expect(outputFileCalls[1][1]).toBe(`module.exports = {
  foreach: require('./foreach')
};`);

        // root level
        expect(outputFileCalls[2][0]).toBe('/my/project/inline_components/global/is-string/node_modules/bit/index.js');
        expect(outputFileCalls[2][1]).toBe(`module.exports = {
  object: require('./object')
};`);
      });
  });
});
