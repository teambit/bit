import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('app root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    let virtualStoreDir!: string;
    let numberOfFilesInVirtualStore!: number;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(4);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
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
      helper.extensions.addExtensionToVariant('comp1', 'teambit.harmony/node', {});
      helper.extensions.addExtensionToVariant('comp2', 'teambit.harmony/node', {});
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          react: '17',
        },
      });
      helper.command.install('@teambit/aspect@1.0.1042 @teambit/node@1.0.1042');
      // the envs were not loaded during the first install, so the component manifests were built
      // without their dependency policies. a second install applies them (the standard flow for
      // old-style envs, see the "run bit install again" suggestion).
      helper.command.install();
      virtualStoreDir = path.join(helper.fixtures.scopes.localPath, 'node_modules/.pnpm');
      numberOfFilesInVirtualStore = fs.readdirSync(virtualStoreDir).length;
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(helper.env.rootCompDirDep('teambit.harmony/node', 'comp3')).to.be.a.path();
      expect(helper.env.rootCompDirDep('teambit.harmony/node', 'comp4')).to.be.a.path();
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp3`, 'comp3')).to.be.a.path();
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp3`, 'comp4')).to.be.a.path();
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp4`, 'comp3')).to.be.a.path();
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp4`, 'comp4')).to.be.a.path();
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
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^17\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
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
      let pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
      // TODO: skipped for now as it's unstable. @zoltan please fix
      it.skip('should not add new or remove old deps', () => {
        expect(fs.readdirSync(virtualStoreDir).length).to.eq(numberOfFilesInVirtualStore);
      });
      it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^17\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'react/package.json',
            ])
          ).version
        ).to.match(/^16\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
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
        let pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
          path.join(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp3`, 'comp1'), 'dist/foo.js')
        ).to.be.a.path();
      });
      it('should create the dist folders in nested injected directories of the components', () => {
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/foo.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(4);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
      helper.fs.outputFile(`comp1/index.js`, `const isOdd = require("is-odd")`);
      helper.fs.outputFile(
        `comp2/index.js`,
        `const isOdd = require("is-odd");const comp1 = require("@${helper.scopes.remote}/comp1");`
      );
      helper.fs.outputFile(
        `comp3/index.js`,
        `const isOdd = require("is-odd");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp3/comp3.node-app.js`,
        `const isOdd = require("is-odd");
module.exports.default = {
  name: 'comp3',
  entry: require.resolve('./index.js'),
}`
      );
      helper.fs.outputFile(
        `comp4/index.js`,
        `const isOdd = require("is-odd");const comp2 = require("@${helper.scopes.remote}/comp2");`
      );
      helper.fs.outputFile(
        `comp4/comp4.node-app.js`,
        `const isOdd = require("is-odd");
module.exports.default = {
  name: 'comp4',
  entry: require.resolve('./index.js'),
}`
      );
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            'is-odd': '1 || 2',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp2', 'teambit.dependencies/dependency-resolver', {
        policy: {
          peerDependencies: {
            'is-odd': '1 || 2',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            'is-odd': '1',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp4', 'teambit.dependencies/dependency-resolver', {
        policy: {
          dependencies: {
            'is-odd': '2',
          },
        },
      });
      helper.extensions.addExtensionToVariant('comp3', 'teambit.harmony/aspect');
      helper.extensions.addExtensionToVariant('comp4', 'teambit.harmony/aspect');
      helper.extensions.addExtensionToVariant('comp1', 'teambit.harmony/node', {});
      helper.extensions.addExtensionToVariant('comp2', 'teambit.harmony/node', {});
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          'is-odd': '2',
        },
      });
      helper.command.install('@teambit/aspect@1.0.1042 @teambit/node@1.0.1042');
      // the envs were not loaded during the first install, so the component manifests were built
      // without their dependency policies. a second install applies them (the standard flow for
      // old-style envs, see the "run bit install again" suggestion).
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(helper.env.rootCompDirDep('teambit.harmony/node', 'comp3')).to.be.a.path();
      expect(helper.env.rootCompDirDep('teambit.harmony/node', 'comp4')).to.be.a.path();
    });
    it('should install the dependencies of the root component that has react 17 in the dependencies with react 17', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^2\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^2\./);
    });
    it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^1\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^1\./);
    });
    it.skip('should install the non-root components with their default React versions', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp1/index.js`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^2\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp2/index.js`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^2\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp3/index.js`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^1\./);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.fixtures.scopes.localPath, [
            `@${helper.scopes.remote}/comp4/index.js`,
            'is-odd/package.json',
          ])
        ).version
      ).to.match(/^2\./);
    });
    it('should create package.json file in every variation of the component', () => {
      let pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
        `@${helper.scopes.remote}/comp4`,
        `@${helper.scopes.remote}/comp2/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
        `@${helper.scopes.remote}/comp3`,
        `@${helper.scopes.remote}/comp2`,
        `@${helper.scopes.remote}/comp1/package.json`,
      ]);
      expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

      pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
              `@${helper.scopes.remote}/comp4`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
      });
      it('should install the dependencies of the root component that has react 16 in the dependencies with react 16', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^1\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
              `@${helper.scopes.remote}/comp3`,
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^1\./);
      });
      it.skip('should install the non-root components with their default React versions', () => {
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp1/index.js`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp2/index.js`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp3/index.js`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^1\./);
        expect(
          fs.readJsonSync(
            resolveFrom(helper.fixtures.scopes.localPath, [
              `@${helper.scopes.remote}/comp4/index.js`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
      });
      it('should create package.json file in every variation of the component', () => {
        let pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
          `@${helper.scopes.remote}/comp4`,
          `@${helper.scopes.remote}/comp2/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp2`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
          `@${helper.scopes.remote}/comp3`,
          `@${helper.scopes.remote}/comp2`,
          `@${helper.scopes.remote}/comp1/package.json`,
        ]);
        expect(fs.readJsonSync(pkgJsonLoc).name).to.eq(`@${helper.scopes.remote}/comp1`);

        pkgJsonLoc = resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
          path.join(helper.env.rootCompDirDep(`${helper.scopes.remote}/comp3`, 'comp1'), 'dist/foo.js')
        ).to.be.a.path();
      });
      it('should create the dist folders in nested injected directories of the components', () => {
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp3`), [
            `@${helper.scopes.remote}/comp3`,
            `@${helper.scopes.remote}/comp2`,
            `@${helper.scopes.remote}/comp1/dist/foo.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
            `@${helper.scopes.remote}/comp4`,
            `@${helper.scopes.remote}/comp2/dist/index.js`,
          ])
        ).to.be.a.path();
        expect(
          resolveFrom(helper.env.rootCompDir(`${helper.scopes.remote}/comp4`), [
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
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^2\./);
        expect(
          fs.readJsonSync(
            resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp3`), [
              `@${helper.scopes.remote}/comp2`,
              `@${helper.scopes.remote}/comp1`,
              'is-odd/package.json',
            ])
          ).version
        ).to.match(/^1\./);
      });
      it('should link build side-effects to all instances of the component in the capsule directory', () => {
        const comp2DepDir = path.dirname(
          resolveFrom(path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp3`), [
            `@${helper.scopes.remote}/comp2/package.json`,
          ])
        );
        expect(path.join(comp2DepDir, 'dist/index.js')).to.be.a.path();
        expect(path.join(comp2DepDir, 'types/asset.d.ts')).to.be.a.path();
      });
    });
  });
});
