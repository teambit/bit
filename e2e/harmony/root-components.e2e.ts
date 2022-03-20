import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { sync as resolveSync } from 'resolve';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const ROOT_COMPS_DIR = 'node_modules';

function rootCompDirDep(helper: Helper, rootComponentName: string, depComponentName: string) {
  return path.join(
    rootCompDir(helper, rootComponentName),
    'node_modules',
    `@${helper.scopes.remote}/${depComponentName}`
  );
}

function rootCompDir(helper: Helper, rootComponentName: string) {
  return path.join(helper.fixtures.scopes.localPath, `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/${rootComponentName}`);
}

describe('app root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    let virtualStoreDir!: string;
    let numberOfFilesInVirtualStore!: number;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp4`, {});
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
          peerDependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
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
      // Only after the second install is bit able to detect apps
      helper.command.compile();
      helper.command.install();
      virtualStoreDir = path.join(helper.fixtures.scopes.localPath, 'node_modules/.pnpm');
      numberOfFilesInVirtualStore = fs.readdirSync(virtualStoreDir).length;
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'comp3', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp4', 'comp4')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
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
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp3'), [
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
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
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
            resolveFrom(rootCompDir(helper, 'comp4'), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp4'), [
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
            resolveFrom(rootCompDir(helper, 'comp3'), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp3'), [
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
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.command.compile();
      });
      it('should create the dist folder in all the locations of the component', () => {
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp1/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp2/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp3/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp4/dist/index.js`])).to
          .exist;
        expect(resolveFrom(rootCompDir(helper, 'comp3'), [`@${helper.scopes.remote}/comp3/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
        expect(resolveFrom(rootCompDir(helper, 'comp4'), [`@${helper.scopes.remote}/comp4/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp4/node_modules/@${helper.scopes.remote}/comp4`
              ),
              [`@${helper.scopes.remote}/comp2`, 'react/package.json']
            )
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp3/node_modules/@${helper.scopes.remote}/comp3`
              ),
              [`@${helper.scopes.remote}/comp2`, `@${helper.scopes.remote}/comp1`, 'react/package.json']
            )
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/dist/comp4.node-app.js`)).to.exist
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/types/asset.d.ts`)).to.exist
      });
    });
  });

  describe('pnpm hoisted linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp4`, {});
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
          peerDependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
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
      // Only after the second install is bit able to detect apps
      helper.command.compile();
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'comp3', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp4', 'comp4')).to.be.a.path();
    });
    it('should use a hoisted layout', () => {
      expect(rootCompDirDep(helper, 'comp3', 'comp1')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp3', 'comp2')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp4', 'comp1')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp4', 'comp2')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
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
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp3'), [
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
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
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
      it('should use a hoisted layout', () => {
        expect(rootCompDirDep(helper, 'comp3', 'comp1')).to.be.a.path();
        expect(rootCompDirDep(helper, 'comp3', 'comp2')).to.be.a.path();
        expect(rootCompDirDep(helper, 'comp4', 'comp1')).to.be.a.path();
        expect(rootCompDirDep(helper, 'comp4', 'comp2')).to.be.a.path();
      });
      it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp4'), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp4'), [
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
            resolveFrom(rootCompDir(helper, 'comp3'), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp3'), [
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
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.command.compile();
      });
      it('should create the dist folder in all the locations of the component', () => {
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp1/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp2/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp3/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp4/dist/index.js`])).to
          .exist;
        expect(resolveFrom(rootCompDir(helper, 'comp3'), [`@${helper.scopes.remote}/comp3/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
        expect(resolveFrom(rootCompDir(helper, 'comp4'), [`@${helper.scopes.remote}/comp4/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp4/node_modules/@${helper.scopes.remote}/comp4`
              ),
              [`@${helper.scopes.remote}/comp2`, 'react/package.json']
            )
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp3/node_modules/@${helper.scopes.remote}/comp3`
              ),
              [`@${helper.scopes.remote}/comp2`, `@${helper.scopes.remote}/comp1`, 'react/package.json']
            )
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/dist/comp4.node-app.js`)).to.exist
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/types/asset.d.ts`)).to.exist
      });
    });
  });

  describe('yarn hoisted linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(4);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', 'teambit.dependencies/yarn');
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
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
        `comp4/index.js`,
        `const React = require("react");const comp2 = require("@${helper.scopes.remote}/comp2");`
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
          peerDependencies: {
            react: '16',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
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
      expect(rootCompDirDep(helper, 'comp3', 'comp3')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp4', 'comp4')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp4'), [
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
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDir(helper, 'comp3'), [
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
      let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
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
            resolveFrom(rootCompDir(helper, 'comp4'), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp4'), [
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
            resolveFrom(rootCompDir(helper, 'comp3'), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(rootCompDir(helper, 'comp3'), [
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
        let pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp3'), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(rootCompDir(helper, 'comp4'), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);
      });
    });
    describe('compilation', () => {
      before(() => {
        helper.command.compile();
      });
      it('should create the dist folder in all the locations of the component', () => {
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp1/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp2/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp3/dist/index.js`])).to
          .exist;
        expect(resolveFrom(helper.fixtures.scopes.localPath, [`@${helper.scopes.remote}/comp4/dist/index.js`])).to
          .exist;
        expect(resolveFrom(rootCompDir(helper, 'comp3'), [`@${helper.scopes.remote}/comp3/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp3'), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
        expect(resolveFrom(rootCompDir(helper, 'comp4'), [`@${helper.scopes.remote}/comp4/dist/index.js`])).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.exist;
        expect(
          resolveFrom(rootCompDir(helper, 'comp4'), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.exist;
      });
    });
    describe('build', () => {
      let workspaceCapsulesRootDir: string
      before(() => {
        helper.command.build();
        workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
      });
      it('should create root components for workspace capsules', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp4/node_modules/@${helper.scopes.remote}/comp4`
              ),
              [`@${helper.scopes.remote}/comp2`, 'react/package.json']
            )
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(
              path.join(
                workspaceCapsulesRootDir,
                `${ROOT_COMPS_DIR}/@${helper.scopes.remote}/comp3/node_modules/@${helper.scopes.remote}/comp3`
              ),
              [`@${helper.scopes.remote}/comp2`, `@${helper.scopes.remote}/comp1`, 'react/package.json']
            )
          ).version
        ).to.match(/^16\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/dist/comp4.node-app.js`)).to.exist
        expect(path.join(workspaceCapsulesRootDir, `node_modules/@${helper.scopes.remote}/comp4/types/asset.d.ts`)).to.exist
      });
    });
  });
});

describe('env root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
      helper.fs.outputFile(
        `custom-react/env1/env1.main.runtime.ts`,
        `
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Env1Aspect } from './env1.aspect';

export class EnvMain {
  static slots = [];

  static dependencies = [ReactAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const templatesReactEnv = envs.compose(react.reactEnv, [
      envs.override({
        getDependencies: () => ({
          dependencies: {},
          devDependencies: {
          },
          peers: [
            {
              name: 'react',
              supportedRange: '^16.8.0',
              version: '16.14.0',
            },
          ],
        })
      })
    ]);
    envs.registerEnv(templatesReactEnv);
    return new EnvMain();
  }
}

Env1Aspect.addRuntime(EnvMain);
`
      );
      helper.command.create('react-env', 'custom-react/env2', '-p custom-react/env2');
      helper.fs.outputFile(
        `custom-react/env2/env2.main.runtime.ts`,
        `
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Env2Aspect } from './env2.aspect';

export class EnvMain {
  static slots = [];

  static dependencies = [ReactAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const templatesReactEnv = envs.compose(react.reactEnv, [
      envs.override({
        getDependencies: () => ({
          dependencies: {},
          devDependencies: {
          },
          peers: [
            {
              name: 'react',
              supportedRange: '^16.8.0',
              version: '16.13.1',
            },
          ],
        })
      })
    ]);
    envs.registerEnv(templatesReactEnv);
    return new EnvMain();
  }
}

Env2Aspect.addRuntime(EnvMain);
`
      );
      helper.fixtures.populateComponents(2);
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp3`, {});
      helper.bitJsonc.addKeyVal(undefined, `${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      // helper.extensions.addExtensionToVariant('custom-react/env', 'teambit.dependencies/dependency-resolver', {
      // policy: {
      // dependencies: {
      // react: '16.14.0',
      // },
      // },
      // });
      helper.bitJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          react: '17',
        },
      });
      // helper.command.install();
      // // Only after the second install is bit able to detect apps
      // helper.command.compile();
      helper.command.install();
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(rootCompDirDep(helper, 'comp1', 'comp1')).to.be.a.path();
      expect(rootCompDirDep(helper, 'comp2', 'comp2')).to.be.a.path();
    });
    it('should install the right version of react to components that have a custom react environment', () => {
      expect(
        fs.readJsonSync(resolveFrom(rootCompDirDep(helper, 'comp1', 'comp1'), ['react/package.json'])).version
      ).to.match(/^16\.14/);
      expect(
        fs.readJsonSync(resolveFrom(rootCompDirDep(helper, 'comp2', 'comp2'), ['react/package.json'])).version
      ).to.match(/^16\.13/);
    });
    it('should install the right version of react to custom environment components', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, 'custom-react.env1', 'custom-react.env1'), ['react/package.json'])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(rootCompDirDep(helper, 'custom-react.env2', 'custom-react.env1'), ['react/package.json'])
        ).version
      ).to.match(/^17\./);
    });
  });
});

function resolveFrom(fromDir: string, moduleIds: string[]) {
  if (moduleIds.length === 0) return fromDir;
  const [moduleId, ...rest] = moduleIds;
  // We use the "resolve" library because the native "require.resolve" method uses a cache.
  // So with the native resolve method we cannot check the same path twice.
  return resolveFrom(resolveSync(moduleId, { basedir: fromDir, preserveSymlinks: false }), rest);
}
