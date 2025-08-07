import { expect } from 'chai';
import type { DedupedPaths } from './dedup-paths';
import { dedupePaths } from './dedup-paths';
import type { ExtendingConfigFilesMap } from './writers';

const envCompsDirsMap = {
  'teambit.harmony/node': {
    id: 'teambit.harmony/node',
    paths: [
      'react/apps/react-app-types',
      'compilation/babel-compiler',
      'compilation/compiler-task',
      'mdx/compilers/mdx-compiler',
      'mdx/compilers/mdx-multi-compiler',
      'compilation/compilers/multi-compiler',
      'defender/eslint-linter',
      'mdx/generator/mdx-starters',
      'mdx/generator/mdx-templates',
      'react/generator/react-starters',
      'react/generator/react-templates',
      'defender/jest-tester',
      'react/jest/react-jest',
      'defender/linter-task',
      'defender/mocha-tester',
      'compilation/modules/babel-file-transpiler',
      'defender/prettier-formatter',
      'preview/react-preview',
      'defender/tester-task',
      'typescript/typescript-compiler',
      'webpack/webpack-bundler',
      'webpack/webpack-dev-server',
      'react/webpack/react-webpack',
    ],
  },
  'teambit.react/react-env@0.0.44': {
    id: 'teambit.react/react-env@0.0.44',
    paths: ['test-new-envs-app/apps/test-app', 'test-new-env/ui/button2'],
  },
  'teambit.react/react': {
    id: 'teambit.react/react',
    paths: ['docs/docs-template', 'react/mounter'],
  },
  'teambit.envs/env': {
    id: 'teambit.envs/env',
    paths: [
      'react/examples/my-react-env',
      'mdx/mdx-env',
      'node/node',
      'node/node-env-extension',
      'react/react-env',
      'react/react-env-extension',
    ],
  },
  'teambit.mdx/mdx-env@0.0.6': {
    id: 'teambit.mdx/mdx-env@0.0.6',
    paths: ['test-new-env/mdx/content-comp'],
  },
  'teambit.node/node@0.0.16': {
    id: 'teambit.node/node@0.0.16',
    paths: ['test-new-env/node/node-comp1', 'test-new-env/node/node-comp2'],
  },
  'teambit.react/examples/my-react-env@0.0.39': {
    id: 'teambit.react/examples/my-react-env@0.0.39',
    paths: ['test-new-env/ui/button'],
  },
};

const tsExtendingConfigFilesMap: ExtendingConfigFilesMap = {
  '816b7f584991ff21a7682ef8a4229ebf312c457f': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-typescript-config\n' +
        '\n' +
        '{\n' +
        '  "extends": "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.4957ea3122e57ea3302aadd885eed84127d9c54b.json"\n' +
        '}',
      name: 'tsconfig.json',
      extendingTarget: {
        hash: '4957ea3122e57ea3302aadd885eed84127d9c54b',
        content: 'does not matter',
        name: 'tsconfig.bit.4957ea3122e57ea3302aadd885eed84127d9c54b.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.4957ea3122e57ea3302aadd885eed84127d9c54b.json',
      },

      hash: '816b7f584991ff21a7682ef8a4229ebf312c457f',
    },
    envIds: ['teambit.harmony/node', 'teambit.react/react'],
  },
  '00330a9c547353867d519c34f47e17ddc9f161d1': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-typescript-config\n' +
        '\n' +
        '{\n' +
        '  "extends": "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.17b99a1071b1d2d86ed04ebce68903b82403f278.json"\n' +
        '}',
      name: 'tsconfig.json',
      extendingTarget: {
        hash: '17b99a1071b1d2d86ed04ebce68903b82403f278',
        content: 'does not matter',
        name: 'tsconfig.bit.17b99a1071b1d2d86ed04ebce68903b82403f278.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.17b99a1071b1d2d86ed04ebce68903b82403f278.json',
      },
      hash: '00330a9c547353867d519c34f47e17ddc9f161d1',
    },
    envIds: ['teambit.react/react-env@0.0.44', 'teambit.react/examples/my-react-env@0.0.39'],
  },
  '3c5960bcad98570b98834a5c37f47dd4729dbef0': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-typescript-config\n' +
        '\n' +
        '{\n' +
        '  "extends": "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.dab521d0914afe64de248743e05a169cf9b4b50c.json"\n' +
        '}',
      name: 'tsconfig.json',
      extendingTarget: {
        hash: 'dab521d0914afe64de248743e05a169cf9b4b50c',
        content: 'does not matter',
        name: 'tsconfig.bit.dab521d0914afe64de248743e05a169cf9b4b50c.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/tsconfig.bit.dab521d0914afe64de248743e05a169cf9b4b50c.json',
      },
      hash: '3c5960bcad98570b98834a5c37f47dd4729dbef0',
    },
    envIds: ['teambit.node/node@0.0.16'],
  },
};

const tsExpectedDedupedPaths: DedupedPaths = [
  {
    fileHash: '00330a9c547353867d519c34f47e17ddc9f161d1',
    paths: ['test-new-envs-app', 'test-new-env/ui'],
  },
  {
    fileHash: '3c5960bcad98570b98834a5c37f47dd4729dbef0',
    paths: ['test-new-env/node'],
  },
  {
    fileHash: '816b7f584991ff21a7682ef8a4229ebf312c457f',
    paths: ['.'],
  },
];

const eslintExtendingConfigFilesMap: ExtendingConfigFilesMap = {
  '8810839e74a9c41694bb5a2a8587dcae71dc389d': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-eslint-config\n' +
        '{\n' +
        '  "extends": [\n' +
        '    "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.be8facfbdcf1db685d5020f8612d8c2c3ac2eb7c.json"\n' +
        '  ]\n' +
        '}',
      name: '.eslintrc.json',
      extendingTarget: {
        hash: 'be8facfbdcf1db685d5020f8612d8c2c3ac2eb7c',
        content: 'does not matter',
        name: '.eslintrc.bit.be8facfbdcf1db685d5020f8612d8c2c3ac2eb7c.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.be8facfbdcf1db685d5020f8612d8c2c3ac2eb7c.json',
      },
      hash: '8810839e74a9c41694bb5a2a8587dcae71dc389d',
    },
    envIds: ['teambit.harmony/node', 'teambit.react/react', 'teambit.envs/env'],
  },
  ff6ea265e6f21ce25f7985570beef37dd957d0dc: {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-eslint-config\n' +
        '{\n' +
        '  "extends": [\n' +
        '    "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.e5ca5528c64e0442b05b949fea42cdda4243d840.json"\n' +
        '  ]\n' +
        '}',
      name: '.eslintrc.json',
      extendingTarget: {
        hash: 'e5ca5528c64e0442b05b949fea42cdda4243d840',
        content: 'does not matter',
        name: '.eslintrc.bit.e5ca5528c64e0442b05b949fea42cdda4243d840.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.e5ca5528c64e0442b05b949fea42cdda4243d840.json',
      },
      hash: 'ff6ea265e6f21ce25f7985570beef37dd957d0dc',
    },
    envIds: ['teambit.react/react-env@0.0.44'],
  },
  '91021f2c973a2940c70b75447639e4ea2a799955': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-eslint-config\n' +
        '{\n' +
        '  "extends": [\n' +
        '    "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.7f229bf5ab41e8bfe61916de6c68f9c14c76f23e.json"\n' +
        '  ]\n' +
        '}',
      name: '.eslintrc.json',
      extendingTarget: {
        hash: '7f229bf5ab41e8bfe61916de6c68f9c14c76f23e',
        content: 'does not matter',
        name: '.eslintrc.bit.7f229bf5ab41e8bfe61916de6c68f9c14c76f23e.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.7f229bf5ab41e8bfe61916de6c68f9c14c76f23e.json',
      },
      hash: '91021f2c973a2940c70b75447639e4ea2a799955',
    },
    envIds: ['teambit.mdx/mdx-env@0.0.6', 'teambit.react/examples/my-react-env@0.0.39'],
  },
  f1743b227e588db0c59d4a43171653e6c4262816: {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-eslint-config\n' +
        '{\n' +
        '  "extends": [\n' +
        '    "/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.c503f7386e2a637d91c74f7df90d8fafe79c4378.json"\n' +
        '  ]\n' +
        '}',
      name: '.eslintrc.json',
      extendingTarget: {
        hash: 'c503f7386e2a637d91c74f7df90d8fafe79c4378',
        content: 'does not matter',
        name: '.eslintrc.bit.c503f7386e2a637d91c74f7df90d8fafe79c4378.json',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.eslintrc.bit.c503f7386e2a637d91c74f7df90d8fafe79c4378.json',
      },
      hash: 'f1743b227e588db0c59d4a43171653e6c4262816',
    },
    envIds: ['teambit.node/node@0.0.16'],
  },
};

const eslintExpectedDedupedPaths: DedupedPaths = [
  {
    fileHash: 'ff6ea265e6f21ce25f7985570beef37dd957d0dc',
    paths: ['test-new-envs-app', 'test-new-env/ui/button2'],
  },
  {
    fileHash: '91021f2c973a2940c70b75447639e4ea2a799955',
    paths: ['test-new-env/mdx', 'test-new-env/ui/button'],
  },
  {
    fileHash: 'f1743b227e588db0c59d4a43171653e6c4262816',
    paths: ['test-new-env/node'],
  },
  {
    fileHash: '8810839e74a9c41694bb5a2a8587dcae71dc389d',
    paths: ['.'],
  },
];

const prettierExtendingConfigFilesMap: ExtendingConfigFilesMap = {
  '082f546b2555ea89e7063b20de47c039d387fc74': {
    extendingConfigFile: {
      useAbsPaths: false,
      content:
        '// bit-generated-prettier-config\n' +
        'module.exports = {\n' +
        "  ...require('/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.prettierrc.bit.e4882af8861bcf5b0147891d8b70b40a10428881.cjs')\n" +
        '}',
      name: '.prettierrc.cjs',
      extendingTarget: {
        hash: 'e4882af8861bcf5b0147891d8b70b40a10428881',
        content: 'does not matter',
        name: '.prettierrc.bit.e4882af8861bcf5b0147891d8b70b40a10428881.cjs',
        filePath:
          '/Users/giladshoham/dev/temp/new-react-18-config-files/node_modules/.cache/.prettierrc.bit.e4882af8861bcf5b0147891d8b70b40a10428881.cjs',
      },
      hash: '082f546b2555ea89e7063b20de47c039d387fc74',
    },
    envIds: [
      'teambit.harmony/node',
      'teambit.react/react-env@0.0.44',
      'teambit.react/react',
      'teambit.envs/env',
      'teambit.mdx/mdx-env@0.0.6',
      'teambit.node/node@0.0.16',
      'teambit.react/examples/my-react-env@0.0.39',
    ],
  },
};

const prettierExpectedDedupedPaths: DedupedPaths = [
  {
    fileHash: '082f546b2555ea89e7063b20de47c039d387fc74',
    paths: ['.'],
  },
];

describe('Workspace Config files - dedupe paths', function () {
  this.timeout(0);

  describe('dedupePaths', () => {
    describe('ts example', () => {
      let result: DedupedPaths;
      before(async () => {
        // @ts-expect-error (we don't really care about the env itself here)
        result = dedupePaths(tsExtendingConfigFilesMap, envCompsDirsMap);
      });

      it('should reduce files to minimum necessary', async () => {
        expect(result).to.have.lengthOf(tsExpectedDedupedPaths.length);
      });

      it('should place files in correct folders', async () => {
        expect(result).to.deep.equal(tsExpectedDedupedPaths);
      });
    });

    describe('eslint example', () => {
      let result: DedupedPaths;
      before(async () => {
        // @ts-expect-error (we don't really care about the env itself here)
        result = dedupePaths(eslintExtendingConfigFilesMap, envCompsDirsMap);
      });

      it('should reduce files to minimum necessary', async () => {
        expect(result).to.have.lengthOf(eslintExpectedDedupedPaths.length);
      });

      it('should place files in correct folders', async () => {
        expect(result).to.deep.equal(eslintExpectedDedupedPaths);
      });
    });

    describe('prettier example', () => {
      let result: DedupedPaths;
      before(async () => {
        // @ts-expect-error (we don't really care about the env itself here)
        result = dedupePaths(prettierExtendingConfigFilesMap, envCompsDirsMap);
      });

      it('should reduce files to minimum necessary', async () => {
        expect(result).to.have.lengthOf(prettierExpectedDedupedPaths.length);
      });

      it('should place files in correct folders', async () => {
        expect(result).to.deep.equal(prettierExpectedDedupedPaths);
      });
    });
  });
});
