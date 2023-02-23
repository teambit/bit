import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { getRootComponentDir } from '@teambit/bit-roots';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

function rootCompDirDep(helper: Helper, envName: string, depComponentName: string) {
  return path.join(rootCompDir(helper, envName), 'node_modules', `@${helper.scopes.remote}/${depComponentName}`);
}

function rootCompDir(helper: Helper, envName: string) {
  return getRootComponentDir(helper.fixtures.scopes.localPath, envName);
}

describe('app root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    let virtualStoreDir!: string;
    let numberOfFilesInVirtualStore!: number;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.fs.outputFile(
        `comp3/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp3/comp3.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp3',
  entry: require.resolve('./index.js'),
}`
      );
      helper.fs.outputFile(
        `comp4/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp4/comp4.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp4',
  entry: require.resolve('./index.js'),
}`
      );
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp2', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.harmony/aspect');
      helper.extensions.addExtensionToVariant('comp4', 'teambit.harmony/aspect');
      helper.bitJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          react: '17',
        },
      });
      helper.command.install();
      virtualStoreDir = path.join(helper.fixtures.scopes.localPath, 'node_modules/.pnpm');
      numberOfFilesInVirtualStore = fs.readdirSync(virtualStoreDir).length;
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp4')).to.be.a.path();
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/comp3`, 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/comp3`, 'comp4')).to.be.a.path();
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/comp4`, 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/comp4`, 'comp4')).to.be.a.path();
    });
    it('should not link components into node_modules directories of other components', () => {
      expect(
        path.join(helper.fixtures.scopes.localPath, `comp3/node_modules/@${helper.scopes.remote}/comp2`)
      ).not.to.be.a.path();
    });
    it('should hoist dependencies to the root of the workspace', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules', '@types/jest')).to.be.a.path();
    });
    it('should not nest a dependency to a component directory if it is already in the root', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'comp4/node_modules/react')).to.not.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'comp4/node_modules/react-dom')).to.not.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
    it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
    });
    it.skip('should install the non-root components with their default React versions', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp1/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp2/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp3/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp4/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
    it('should create package.json file in every variation of the component', () => {
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
    });
    describe('repeat install', () => {
      before(() => {
        helper.command.install();
      });
      it('should not add new or remove old deps', () => {
        expect(fs.readdirSync(virtualStoreDir).length).to.eq(numberOfFilesInVirtualStore);
      });
      it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
      });
      it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it.skip('should install the non-root components with their default React versions', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp1/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp2/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp3/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp4/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
      });
      it('should create package.json file in every variation of the component', () => {
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.fs.outputFile(`comp1/foo.ts`, ``);
        helper.command.compile();
      });
      it('should create the dist folder in the linked directories', () => {
        const resolveFromLocal = resolveFrom.bind(null, helper.fixtures.scopes.localPath);
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/foo.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp2/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp3/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp4/dist/index.js`])).to.be.a.path();
      });
      it('should create the dist folder in the root injected folder', () => {
        expect(
          path.join(rootCompDirDep(helper, `${helper.scopes.remote}/comp3`, 'comp1'), 'dist/foo.js')
        ).to.be.a.path();
      });
      it('should create the dist folders in nested injected directories of the components', () => {
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/foo.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string;
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp4`), [
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp3`), [
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp4/node_modules/@${helper.scopes.remote}/comp2/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp4/node_modules/@${helper.scopes.remote}/comp2/types/asset.d.ts`
          )
        ).to.be.a.path();
      });
    });
  });

  describe('pnpm hoisted linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.fs.outputFile(
        `comp3/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp3/comp3.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp3',
  entry: require.resolve('./index.js'),
}`
      );
      helper.fs.outputFile(
        `comp4/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp4/comp4.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp4',
  entry: require.resolve('./index.js'),
}`
      );
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp2', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.harmony/aspect');
      helper.extensions.addExtensionToVariant('comp4', 'teambit.harmony/aspect');
      helper.bitJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          react: '17',
        },
      });
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp4')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
    it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
    });
    it.skip('should install the non-root components with their default React versions', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp1/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp2/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp3/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp4/index.js`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
    it('should create package.json file in every variation of the component', () => {
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
    });
    describe('repeat install', () => {
      before(() => {
        helper.command.install();
      });
      it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
      });
      it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it.skip('should install the non-root components with their default React versions', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp1/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp2/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp3/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp4/index.js`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
      });
      it('should create package.json file in every variation of the component', () => {
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.fs.outputFile(`comp1/foo.ts`, ``);
        helper.command.compile();
      });
      it('should create the dist folder in the linked directories', () => {
        const resolveFromLocal = resolveFrom.bind(null, helper.fixtures.scopes.localPath);
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/foo.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp2/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp3/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp4/dist/index.js`])).to.be.a.path();
      });
      it('should create the dist folder in the root injected folder', () => {
        expect(
          path.join(rootCompDirDep(helper, `${helper.scopes.remote}/comp3`, 'comp1'), 'dist/foo.js')
        ).to.be.a.path();
      });
      it('should create the dist folders in nested injected directories of the components', () => {
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/foo.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string;
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp4`), [
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp3`), [
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp3/node_modules/@${helper.scopes.remote}/comp2/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp3/node_modules/@${helper.scopes.remote}/comp2/types/asset.d.ts`
          )
        ).to.be.a.path();
      });
    });
  });

  describe('yarn hoisted linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.setPackageManager('teambit.dependencies/yarn');
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.fs.outputFile(
        `comp3/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp3/comp3.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp3',
  entry: require.resolve('./index.js'),
}`
      );
      helper.fs.outputFile(
        `comp4/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp4/comp4.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp4',
  entry: require.resolve('./index.js'),
}`
      );
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp2', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            react: '17',
          },
        },
      });
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'teambit.harmony/node', 'comp4')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
    it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
    });
    it.skip('should install the non-root components with their default React versions', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp1/index.js', 'react/package.json'])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp2/index.js', 'react/package.json'])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp3/index.js', 'react/package.json'])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp4/index.js', 'react/package.json'])
        ).version
      ).to.match(/^17\./);
    });
    it('should create package.json file in every variation of the component', () => {
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
    });
    describe('repeat install', () => {
      before(() => {
        helper.command.install();
      });
      it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
      });
      it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it.skip('should install the non-root components with their default React versions', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp1/index.js', 'react/package.json'])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp2/index.js', 'react/package.json'])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp3/index.js', 'react/package.json'])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, ['@my-scope/comp4/index.js', 'react/package.json'])
          ).version
        ).to.match(/^17\./);
      });
      it('should create package.json file in every variation of the component', () => {
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, `${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.fs.outputFile(`comp1/foo.ts`, ``);
        helper.command.compile();
      });
      it('should create the dist folder in the linked directories', () => {
        const resolveFromLocal = resolveFrom.bind(null, helper.fixtures.scopes.localPath);
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp1/dist/foo.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp2/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp3/dist/index.js`])).to.be.a.path();
        expect(resolveFromLocal([`@${helper.scopes.remote}/comp4/dist/index.js`])).to.be.a.path();
      });
      it('should create the dist folders for components inside .bit_roots', () => {
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp3`),
            `node_modules/@${helper.scopes.remote}/comp4/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp3`),
            `node_modules/@${helper.scopes.remote}/comp3/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp3`),
            `node_modules/@${helper.scopes.remote}/comp1/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp4`),
            `node_modules/@${helper.scopes.remote}/comp4/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp4`),
            `node_modules/@${helper.scopes.remote}/comp3/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            rootCompDir(helper, `${helper.scopes.remote}/comp4`),
            `node_modules/@${helper.scopes.remote}/comp1/dist/index.js`
          )
        ).to.be.a.path();
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string;
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp4`), [
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp3`), [
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp4/node_modules/@${helper.scopes.remote}/comp2/dist/index.js`
          )
        ).to.be.a.path();
        expect(
          path.join(
            workspaceCapsulesRootDir,
            `${helper.scopes.remote}_comp4/node_modules/@${helper.scopes.remote}/comp2/types/asset.d.ts`
          )
        ).to.be.a.path();
      });
    });
  });
});

describe('env root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    const env1DefaultPeerVersion = '16.14.0';
    const env2DefaultPeerVersion = '16.13.1';
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
        envName: 'env1',
        dependencies: {
          peers: [
            {
              name: 'react',
              supportedRange: '^16.8.0',
              version: env1DefaultPeerVersion,
            },
          ],
        },
      });
      helper.command.create('react-env', 'custom-react/env2', '-p custom-react/env2');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env2/env2.main.runtime.ts`, {
        envName: 'env2',
        dependencies: {
          peers: [
            {
              name: 'react',
              supportedRange: '^16.8.0',
              version: env2DefaultPeerVersion,
            },
          ],
        },
      });
      helper.command.create('react-env', 'custom-react/env3', '-p custom-react/env3');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env3/env3.main.runtime.ts`, {
        envName: 'env3',
        dependencies: {
          peers: [
            {
              name: 'react',
              supportedRange: '17',
              version: '17.0.0',
            },
          ],
        },
      });
      helper.command.create('react-env', 'custom-react/env4', '-p custom-react/env4');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env4/env4.main.runtime.ts`, {
        envName: 'env4',
        dependencies: {
          peers: [
            {
              name: 'react',
              supportedRange: '17',
              version: '17.0.1',
            },
          ],
        },
      });
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
      helper.extensions.addExtensionToVariant('comp3', `${helper.scopes.remote}/custom-react/env3`, {});
      helper.extensions.addExtensionToVariant('comp4', `${helper.scopes.remote}/custom-react/env4`, {});
      helper.fs.outputFile(
        `comp3/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp3/comp3.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp3',
  entry: require.resolve('./index.js'),
}`
      );
      helper.fs.outputFile(
        `comp4/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp4/comp4.node-app.js`,
        `const React = require("react");
module.exports.default = {
  name: 'comp4',
  entry: require.resolve('./index.js'),
}`
      );
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env1`, 'comp1')).to.be.a.path();
      expect(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env2`, 'comp2')).to.be.a.path();
    });
    it('should install the right version of react to components that have a custom react environment', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env1`, 'comp1'), [
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.14/);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env1`, 'comp2'), [
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.14/);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env2`, 'comp2'), [
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.13/);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env2`, 'comp2'), [
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.13/);
    });
    it('should install the right version of react to custom environment components', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env1`, 'custom-react.env1'), [
            'react/package.json',
          ])
        ).version
      ).to.eq(env1DefaultPeerVersion);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, `${helper.scopes.remote}/custom-react/env2`, 'custom-react.env2'), [
            'react/package.json',
          ])
        ).version
      ).to.eq(env2DefaultPeerVersion);
    });
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)('root components for scope aspect capsules', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(async () => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
    npmCiRegistry.configureCiInPackageJsonHarmony();
    helper.command.create('aspect', 'dep-dep-aspect');
    helper.command.create('aspect', 'dep-aspect');
    helper.command.create('aspect', 'main-aspect');
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/dep-aspect/dep-aspect.main.runtime.ts`,
      getDepAspect(helper.scopes.remoteWithoutOwner)
    );
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/main-aspect/main-aspect.main.runtime.ts`,
      getMainAspect(helper.scopes.remoteWithoutOwner)
    );
    helper.extensions.addExtensionToVariant('*', 'teambit.harmony/aspect');
    helper.extensions.addExtensionToVariant(
      '{**/dep-dep-aspect},{**/dep-aspect}',
      'teambit.dependencies/dependency-resolver',
      {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      }
    );
    helper.extensions.addExtensionToVariant('{**/main-aspect}', 'teambit.dependencies/dependency-resolver', {
      policy: {
        peerDependencies: {
          react: '16',
        },
      },
    });
    helper.command.install('react@16.6.3');
    helper.command.tagAllComponents();
    helper.command.export();

    helper.extensions.addExtensionToVariant('{**/main-aspect}', 'teambit.dependencies/dependency-resolver', {
      policy: {
        peerDependencies: {
          react: '17',
        },
      },
    });
    helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/dep-aspect/new-file.ts`, '');
    helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/main-aspect/new-file.ts`, '');
    helper.command.install('react@17.0.2');
    helper.command.tagAllComponents();
    helper.command.export();

    helper.scopeHelper.reInitLocalScope({
      yarnRCConfig: {
        unsafeHttpWhitelist: ['localhost'],
      },
    });
    helper.scopeHelper.addRemoteScope();
    helper.bitJsonc.setupDefault();
  });
  describe('using Yarn', () => {
    let scopeAspectsCapsulesRootDir!: string;
    before(() => {
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/yarn`);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/main-aspect@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/main-aspect@0.0.2`);
      helper.capsules.removeScopeAspectCapsules();
      helper.command.status(); // populate capsules.
      scopeAspectsCapsulesRootDir = helper.command.capsuleListParsed().scopeAspectsCapsulesRootDir;
    });
    it('should install components with the right peer dependencies', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.1`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.2`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
  });
  describe('using pnpm', () => {
    let scopeAspectsCapsulesRootDir!: string;
    before(() => {
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/main-aspect@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/main-aspect@0.0.2`);
      helper.capsules.removeScopeAspectCapsules();
      helper.command.status(); // populate capsules.
      scopeAspectsCapsulesRootDir = helper.command.capsuleListParsed().scopeAspectsCapsulesRootDir;
    });
    it('should install components with the right peer dependencies', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.1`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.2`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
    });
  });
  after(() => {
    npmCiRegistry.destroy();
  });
});

function getMainAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
  import { DepAspectAspect, DepAspectMain } from '@ci/${remoteScope}.dep-aspect';
  import React from 'react';
  import { MainAspectAspect } from './main-aspect.aspect';

  export class MainAspectMain {
    static slots = [];
    static dependencies = [DepAspectAspect];
    static runtime = MainRuntime;
    static async provider([depAspect]: [DepAspectMain]) {
      if (!depAspect) {
        throw new Error('unable to load the depAspect');
      }
      return new MainAspectMain();
    }
  }

  MainAspectAspect.addRuntime(MainAspectMain);
  `;
}

function getDepAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
import { DepDepAspectAspect, DepDepAspectMain } from '@ci/${remoteScope}.dep-dep-aspect';
import React from 'react';
import { DepAspectAspect } from './dep-aspect.aspect';

export class DepAspectMain {
  static slots = [];
  static dependencies = [DepDepAspectAspect];
  static runtime = MainRuntime;
  static async provider([depDepAspect]: [DepDepAspectMain]) {
    if (!depDepAspect) {
      throw new Error('unable to load the depDepAspect');
    }
    return new DepAspectMain();
  }
}

DepAspectAspect.addRuntime(DepAspectMain);
`;
}

describe('env peer dependencies hoisting', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.create('react', 'my-button', '-p my-button');
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should hoist react to the root of the workspace', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/react')).to.be.a.path();
    });
  });
});

describe('env peer dependencies hoisting when the env is in the workspace', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    before(() => prepare('pnpm'));
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install react to the root of the component', () => {
      expect(
        fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'comp1'), ['react/package.json']))
          .version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'comp2'), ['react/package.json']))
          .version
      ).to.match(/^18\./);
    });
  });

  describe('yarn hoisted linker', function () {
    before(() => prepare('yarn'));
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install react to the root of the component', () => {
      expect(
        fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'comp1'), ['react/package.json']))
          .version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'comp2'), ['react/package.json']))
          .version
      ).to.match(/^18\./);
    });
  });

  function prepare(pm: 'yarn' | 'pnpm') {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/${pm}`);
    helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
    helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
      envName: 'env1',
      dependencies: {
        peers: [
          {
            name: 'react',
            supportedRange: '^16.8.0',
            version: '16.14.0',
          },
        ],
      },
    });
    helper.command.create('react-env', 'custom-react/env2', '-p custom-react/env2');
    helper.fixtures.populateEnvMainRuntime(`custom-react/env2/env2.main.runtime.ts`, {
      envName: 'env2',
      dependencies: {
        peers: [
          {
            name: 'react',
            supportedRange: '^18.0.0',
            version: '18.0.0',
          },
        ],
      },
    });
    helper.fixtures.populateComponents(2);
    helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
    helper.fs.outputFile(
      `comp2/index.js`,
      `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
    );
    helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
    helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
    helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
    helper.command.install();
    helper.command.install(); // For some reason only works on second run with Yarn
  }
});

describe('create with root components on', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.command.create('react', 'card');
    helper.command.install();
    helper.command.create('react', 'my-button');
  });
  it('should create the runtime component directory for the created component', () => {
    expect(path.join(rootCompDirDep(helper, 'teambit.react/react', 'my-button'), 'index.ts')).to.be.a.path();
  });
});
