import { getRootComponentDir } from '@teambit/workspace.root-components';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('env root components', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    const env1DefaultPeerVersion = '16.14.0';
    const env2DefaultPeerVersion = '16.13.1';
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                version: env1DefaultPeerVersion,
                supportedRange: '^16.8.0',
              },
            ],
          },
        },
        false,
        'custom-react/env1',
        'custom-react/env1'
      );
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                version: env2DefaultPeerVersion,
                supportedRange: '^16.8.0',
              },
            ],
          },
        },
        false,
        'custom-react/env2',
        'custom-react/env2'
      );
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                supportedRange: '17',
                version: '17.0.0',
              },
            ],
          },
        },
        false,
        'custom-react/env3',
        'custom-react/env3'
      );
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                supportedRange: '17',
                version: '17.0.1',
              },
            ],
          },
        },
        false,
        'custom-react/env4',
        'custom-react/env4'
      );

      helper.fixtures.populateComponents(4);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp3`, {});
      helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/comp4`, {});
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
      // for unclear reason, since upgrading core-envs to use @types/node@20.12.10, the following line throws an error "Unexpected token 'export'"
      // helper.command.install();
      helper.command.install('--add-missing-deps');
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install root components', () => {
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env1`, 'comp1')).to.be.a.path();
      expect(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env2`, 'comp2')).to.be.a.path();
    });
    it('should install the right version of react to components that have a custom react environment', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env1`, 'comp1'), [
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.14/);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env1`, 'comp2'), [
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.14/);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env2`, 'comp2'), [
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.13/);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env2`, 'comp2'), [
            `@${helper.scopes.remote}/comp1`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^16\.13/);
    });
    it('should install the right version of react to custom environment components', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env1`, 'custom-react.env1'), [
            'react/package.json',
          ])
        ).version
      ).to.eq(env1DefaultPeerVersion);
      expect(
        fs.readJsonSync(
          resolveFrom(helper.env.rootCompDirDep(`${helper.scopes.remote}/custom-react/env2`, 'custom-react.env2'), [
            'react/package.json',
          ])
        ).version
      ).to.eq(env2DefaultPeerVersion);
    });
  });
});

describe('env peer dependencies hoisting', function () {
  let helper: Helper;
  this.timeout(0);

  describe('pnpm isolated linker', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.create('react', 'my-button', '-p my-button --env teambit.react/react');
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

  // a plain .bit-env.js plugin env carrying only the peers policy in its env.jsonc. the
  // react-env-based fixture used before pulled the whole react toolchain from npm, which
  // got the yarn-hoisted install OOM-killed on CI; the peers policy is all this test needs.
  function createPeerEnv(id: string, peer: { name: string; supportedRange: string; version: string }) {
    const name = id.split('/').pop();
    helper.fs.outputFile(
      `${id}/${name}.bit-env.js`,
      `class PeerEnv {\n  name = '${name}';\n}\nmodule.exports.default = new PeerEnv();\n`
    );
    helper.fs.outputFile(`${id}/index.js`, `module.exports = require('./${name}.bit-env');\n`);
    helper.fixtures.generateEnvJsoncFile(id, { policy: { peers: [peer] } });
    helper.command.addComponent(id, { i: id });
    helper.command.setEnv(id, 'teambit.envs/env');
    helper.command.link();
  }

  function prepare(pm: 'yarn' | 'pnpm') {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/${pm}`);
    createPeerEnv('custom-react/env1', { name: 'react', supportedRange: '^16.8.0', version: '16.14.0' });
    createPeerEnv('custom-react/env2', { name: 'react', supportedRange: '^18.0.0', version: '18.0.0' });

    helper.fixtures.populateComponents(2);
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
    helper.fs.outputFile(
      `comp2/index.js`,
      `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
    );
    helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
    helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-react/env2`, {});
    helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
    helper.command.install();
  }
});

describe('create with root components on', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.command.create('react', 'card', '--env teambit.react/react');
    helper.command.install();
    helper.command.create('react', 'my-button', '--env teambit.react/react');
  });
  it('should create the runtime component directory for the created component', () => {
    expect(path.join(helper.env.rootCompDirDep('teambit.react/react', 'my-button'), 'index.ts')).to.be.a.path();
  });
});

describe('custom root components directory', function () {
  let helper: Helper;
  this.timeout(0);
  describe('set a valid custom location', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToWorkspace('rootComponentsDirectory', '');
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.create('react', 'card', '--env teambit.react/react');
      helper.command.install();
    });
    it('should create the root component directory at the specified location', () => {
      expect(
        getRootComponentDir(path.join(helper.scopes.localPath, '.bit_roots'), 'teambit.react/react')
      ).to.be.a.path();
    });
  });
});
