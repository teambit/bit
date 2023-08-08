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
    helper.command.create('node-env', 'custom-env1');
    helper.fixtures.generateEnvJsoncFile(`${helper.scopes.remoteWithoutOwner}/custom-env1`, {
      policy: {
        runtime: [
          {
            name: 'is-negative',
            version: '1.0.0',
            force: true,
          },
        ],
      },
    });
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/custom-env1/custom-env1.main.runtime.ts`,
      `
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { EnvAspect, EnvMain } from '@teambit/env';

import isPositive from 'is-positive'
import { CustomEnv1Aspect } from './custom-env1.aspect';

export class CustomEnv1Main {
  static slots = [];

  static dependencies = [EnvAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider([env, envs]: [EnvMain, EnvsMain]) {
    console.log(isPositive(1));
    const CustomEnv1Env = env.compose([]);
    envs.registerEnv(CustomEnv1Env);
    return new CustomEnv1Main();
  }
}

CustomEnv1Aspect.addRuntime(CustomEnv1Main);
`
    );
    helper.command.create('node-env', 'custom-env2');
    helper.fixtures.generateEnvJsoncFile(`${helper.scopes.remoteWithoutOwner}/custom-env2`, {
      policy: {
        runtime: [
          {
            name: 'is-odd',
            version: '1.0.0',
            force: true,
          },
        ],
      },
    });
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/custom-env2/custom-env2.main.runtime.ts`,
      `
import { MainRuntime } from '@teambit/cli';
import { NodeAspect, NodeMain } from '@teambit/node'
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { CustomEnv2Aspect } from './custom-env2.aspect';
import isNegative from 'is-negative';
import { MDXAspect, MDXMain } from '@teambit/mdx';
import { babelConfig } from '@teambit/mdx/dist/babel/babel.config';

export class CustomEnv2Main {
  static slots = [];

  static dependencies = [NodeAspect, EnvsAspect, MDXAspect];

  static runtime = MainRuntime;

  static async provider([node, envs, mdx]: [NodeMain, EnvsMain, MDXMain]) {
    console.log(isNegative(17));
    const comp = mdx.createCompiler({ ignoredPatterns: [], babelTransformOptions: babelConfig });
    const CustomEnv2Env = node.compose([
      node.overrideCompiler(comp),
    ]);
    envs.registerEnv(CustomEnv2Env);
    return new CustomEnv2Main();
  }
}

CustomEnv2Aspect.addRuntime(CustomEnv2Main);
`
    );
    helper.command.setEnv(`custom-env2`, `custom-env1`);
    helper.command.create('node', 'comp');
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
    helper.command.setEnv(`comp`, `custom-env2`);
    helper.command.install('is-positive'); // installing the dependency of custom-env1
    // TODO: since we disabled the install compile loop this isn't working right now
    // as in the first install we can't load the custom env.
    // disable this rm for now, but we need to see how we fix it.
    // fs.rmdirSync(path.join(helper.scopes.localPath, 'node_modules'), { recursive: true });
    helper.command.install();
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
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
        envName: 'env1',
        dependencies: {
          dependencies: {},
          devDependencies: {},
          peers: [
            {
              name: 'react',
              supportedRange: '^16.8.0',
              version: '16.14.0',
            },
          ],
        },
      });
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.create('react', 'comp1');
      helper.command.create('react', 'comp2');
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

// TODO: temporary disabled as it fails on CI -
// need to be enabled once we update this chain to grid-component 1.0.2
// @teambit/react.react-env 0.1.18
//├─┬ @teambit/docs.docs-template 0.0.12
//│ └─┬ @teambit/react.ui.docs-app 0.0.207
//│   └─┬ @teambit/react.ui.docs.properties-table 0.0.12
//│     └─┬ @teambit/documenter.ui.property-table 4.1.3
//│       ├─┬ @teambit/documenter.ui.table 4.1.2
//│       │ ├─┬ @teambit/documenter.ui.table-heading-row 4.0.4
//│       │ │ └── @teambit/base-ui.layout.grid-component 1.0.1
//│       │ └─┬ @teambit/documenter.ui.table-row 4.1.2
//│       │   └── @teambit/base-ui.layout.grid-component 1.0.1
//│       └─┬ @teambit/documenter.ui.table-row 4.1.2
//│         └── @teambit/base-ui.layout.grid-component 1.0.1
//└─┬ @teambit/preview.react-preview 0.0.42
//  └─┬ @teambit/docs.docs-template 0.0.12
//    └─┬ @teambit/react.ui.docs-app 0.0.207
//      └─┬ @teambit/react.ui.docs.properties-table 0.0.12
//        └─┬ @teambit/documenter.ui.property-table 4.1.3
//          ├─┬ @teambit/documenter.ui.table 4.1.2
//          │ ├─┬ @teambit/documenter.ui.table-heading-row 4.0.4
//          │ │ └── @teambit/base-ui.layout.grid-component 1.0.1
//          │ └─┬ @teambit/documenter.ui.table-row 4.1.2
//          │   └── @teambit/base-ui.layout.grid-component 1.0.1
//          └─┬ @teambit/documenter.ui.table-row 4.1.2
//            └── @teambit/base-ui.layout.grid-component 1.0.1

describe.skip('do not fail on environment loading files from a location inside node_modules that does not exist', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.fixtures.copyFixtureDir('workspace-with-tsconfig-issue', helper.scopes.localPath);
  });
  it('should not fail', () => {
    helper.command.install();
  });
});
