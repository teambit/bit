import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('custom aspects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // current workspace has my-env and comp1 that uses my-env.
  // my-env depends on external aspect 'main-aspect', which installed as a package, and therefore exists only
  // in the scope, not in the workspace.
  // previously, aspects from workspace were loaded first and as a result, this main-aspect wasn't loaded, causing
  // my-env load to fail.
  (supportNpmCiRegistryTesting ? describe : describe.skip)('workspace aspects using external aspects with deps', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
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
      helper.command.compile();
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();

      helper.command.install(`@ci/${helper.scopes.remoteWithoutOwner}.main-aspect`);

      helper.command.create('react-env', 'my-env', '--path my-env');
      helper.fs.outputFile('my-env/my-env.main.runtime.ts', getEnvRuntimeMain(helper.scopes.remoteWithoutOwner));
      helper.fixtures.populateComponents(1);

      helper.extensions.addExtensionToVariant(`comp1`, `${helper.scopes.remote}/my-env`);
      helper.extensions.addExtensionToVariant(`my-env`, 'teambit.harmony/aspect');

      helper.command.compile();
      helper.command.install();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should load the env correctly and use it for the consuming component', async () => {
      const envId = helper.env.getComponentEnv('comp1');
      expect(envId).to.equal(`${helper.scopes.remote}/my-env`);
    });
    describe('when the aspect dependency is loaded from the workspace but the main dependency is loaded from the scope', () => {
      before(() => {
        helper.command.importComponent('dep-aspect');
      });
      it('should load the env correctly and use it for the consuming component', async () => {
        const envId = helper.env.getComponentEnv('comp1');
        expect(envId).to.equal(`${helper.scopes.remote}/my-env`);
      });
    });
  });
  describe('aspect with another aspect as regular dep', function () {
    let output;
    const LOADING_MSG = 'loading ext2';
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      helper.fixtures.populateExtensions(2, true);
      helper.extensions.addExtensionToVariant('extensions', 'teambit.harmony/aspect');
      helper.command.create('aspect', 'main-aspect');
      helper.fs.outputFile(
        `${helper.scopes.remoteWithoutOwner}/main-aspect/main-aspect.main.runtime.ts`,
        getMainAspectWithRegularDep(helper.scopes.remoteWithoutOwner)
      );
      helper.fs.prependFile('extensions/ext2/ext2.main.runtime.ts', `console.log('${LOADING_MSG}');`);
      helper.command.install();
      helper.command.compile();
      helper.command.use('main-aspect');
      output = helper.command.showComponent('main-aspect');
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should run main aspect provider', () => {
      expect(output).to.have.string('main-aspect');
    });
    it('should run aspect dep provider', () => {
      expect(output).to.have.string('ext 1');
    });
    // @todo currently this is failing, although the aspect is not loaded through Harmony,
    // the manifest is retrieved by running "require" on the main file. another optimization is needed to fix this.
    it.skip('should not load at all aspect which is regular dep provider', () => {
      expect(output).to.not.have.string(LOADING_MSG);
    });
    it('should not run aspect which is regular dep provider', () => {
      expect(output).to.not.have.string('ext 2');
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('simple case of using an external aspect', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.create('aspect', 'my-aspect');
      helper.command.compile();
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('bit use', () => {
      before(() => {
        const aspectId = `${helper.scopes.remote}/my-aspect`;
        helper.command.use(aspectId);
      });
      it('should save the aspect in the workspace.jsonc with a version', () => {
        const workspaceJson = helper.bitJsonc.read();
        expect(workspaceJson).to.have.property(`${helper.scopes.remote}/my-aspect@0.0.1`);
      });
    });
  });
});

function getEnvRuntimeMain(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
  import { ReactAspect, ReactMain } from '@teambit/react';
  import { EnvsAspect, EnvsMain } from '@teambit/envs';
  import { MyEnvAspect } from './my-env.aspect';
  import { MainAspectAspect, MainAspectMain } from '@ci/${remoteScope}.main-aspect'

  export class EnvMain {
    static slots = [];
    static dependencies = [ReactAspect, EnvsAspect, MainAspectAspect];
    static runtime = MainRuntime;
    static async provider([react, envs, main]: [ReactMain, EnvsMain, MainAspectMain]) {
      if (!main) {
        throw new Error('MainAspect dependency is missing');
      }
      const templatesReactEnv = envs.compose(react.reactEnv, []);
      envs.registerEnv(templatesReactEnv);
      return new EnvMain();
    }
  }

  MyEnvAspect.addRuntime(EnvMain);
  `;
}

function getMainAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
  import { DepAspectAspect, DepAspectMain } from '@ci/${remoteScope}.dep-aspect';
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

function getMainAspectWithRegularDep(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
  import { Ext1Aspect, Ext1Main } from '@${remoteScope}/ext1';
  import { Ext2Main } from '@${remoteScope}/ext2';
  import { MainAspectAspect } from './main-aspect.aspect';

  export class MainAspectMain {
    static slots = [];
    static dependencies = [Ext1Aspect];
    static runtime = MainRuntime;
    static async provider([ext1Aspect]: [Ext1Main]) {
      console.log('main aspect');
      return new MainAspectMain();
    }
  }

  MainAspectAspect.addRuntime(MainAspectMain);
  `;
}
