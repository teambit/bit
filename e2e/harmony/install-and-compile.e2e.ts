/* eslint-disable spaced-comment */
// import fs from 'fs';
import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('all custom envs are compiled during installation', function () {
  let helper: Helper;
  function prepare() {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();

    helper.env.setCustomNewEnv(
      'node-based-env',
      ['@teambit/node.node'],
      {
        policy: {
          runtime: [
            {
              name: 'is-negative',
              version: '1.0.0',
              force: true,
            },
          ],
        },
      },
      false,
      'custom-env1',
      'custom-env1'
    );

    helper.env.setCustomNewEnv(
      'mdx-based-env',
      // We put here the node.node as well to save the time (only run one install)
      ['@teambit/mdx.mdx-env', '@teambit/node.node'],
      {
        policy: {
          runtime: [
            {
              name: 'is-odd',
              version: '1.0.0',
              force: true,
            },
          ],
        },
      },
      true,
      'custom-env2',
      'custom-env2'
    );

    helper.command.create('module', 'comp', `--env ${helper.scopes.remoteWithoutOwner}/custom-env2`);
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/comp/comp.ts`,
      `
import isOdd from 'is-odd';

export function comp() {
  console.log(isOdd(17));
}
`
    );
    helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/comp/comp.mdx`, '');
    helper.command.create('module', 'comp1', `--env ${helper.scopes.remoteWithoutOwner}/custom-env1`);

    helper.command.install('is-positive'); // installing the dependency of custom-env1
  }
  describe('using pnpm', function () {
    this.timeout(0);
    before(prepare);
    it('should use the compiled custom env to build the component', () => {
      expect(
        path.join(helper.fixtures.scopes.localPath, 'node_modules', `@${helper.scopes.remote}/comp/dist/comp.mdx.js`)
      ).to.be.a.path();
    });
    it('should install the dependencies dynamically added by the custom envs', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules', 'is-negative')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules', 'is-odd')).to.be.a.path();
    });
  });
  describe('using yarn', function () {
    this.timeout(0);
    before(prepare);
    it('should use the compiled custom env to build the component', () => {
      expect(
        path.join(helper.fixtures.scopes.localPath, 'node_modules', `@${helper.scopes.remote}/comp/dist/comp.mdx.js`)
      ).to.be.a.path();
    });
    it('should install the dependencies dynamically added by the custom envs', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules', 'is-negative')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules', 'is-odd')).to.be.a.path();
    });
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'environment adding a peer dependency should not cause an infinite lop of install compile install',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: 'react',
                supportedRange: '^16.8.0',
                version: '16.14.0',
              },
            ],
          },
        },
        true,
        'custom-react/env1',
        'custom-react/env1'
      );

      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.command.create('react', 'comp1', '--env teambit.react/react');
      helper.command.create('react', 'comp2', '--env teambit.react/react');
      helper.command.setEnv('comp1', `${helper.scopes.remote}/custom-react/env1`);
    });
    it('should not run install indefinitely', () => {
      helper.command.install();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);

describe('skipping compilation on install', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.fixtures.populateComponents(1, true, '', false); // don't compile
    helper.command.install(undefined, { skipCompile: true });
  });
  it('should link the component', () => {
    expect(
      path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/comp1/package.json`)
    ).to.be.a.path();
  });
  it('should not compile the component', () => {
    expect(path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/comp1/dist`)).to.not.be.a.path();
  });
});

describe('do not fail on environment loading files from a location inside node_modules that does not exist', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.fixtures.copyFixtureDir('workspace-with-tsconfig-issue', helper.scopes.localPath);
    helper.command.init();
  });
  it('should not fail', () => {
    helper.command.install();
  });
});
