import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

const MAIN_ASPECT_PROVIDER_TEXT = 'main aspect provider';

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
      helper.workspaceJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.create('bit-aspect', 'dep-dep-aspect');
      helper.command.create('bit-aspect', 'dep-aspect');
      helper.command.create('bit-aspect', 'main-aspect');
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
      helper.workspaceJsonc.setupDefault();

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
    const LOADING_MSG_1 = 'loading ext1';
    const LOADING_MSG_2 = 'loading ext2';
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      helper.fixtures.populateExtensions(2, true);
      helper.extensions.addExtensionToVariant('extensions', 'teambit.harmony/aspect');
      helper.command.create('bit-aspect', 'main-aspect');
      helper.fs.outputFile(
        `${helper.scopes.remoteWithoutOwner}/main-aspect/main-aspect.main.runtime.ts`,
        getMainAspectWithRegularDep(helper.scopes.remoteWithoutOwner)
      );
      helper.fs.prependFile('extensions/ext1/ext1.main.runtime.ts', `console.log('${LOADING_MSG_1}');`);
      helper.fs.prependFile('extensions/ext2/ext2.main.runtime.ts', `console.log('${LOADING_MSG_2}');`);
      helper.command.install();
      helper.command.compile();
      helper.command.use('main-aspect');
      output = helper.command.showComponent('main-aspect');
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    describe('when the dep aspect is not configured in workspace.jsonc', function () {
      it('should run main aspect provider', () => {
        expect(output).to.have.string(MAIN_ASPECT_PROVIDER_TEXT);
      });
      it('should not load at all aspect which is static dep but not configured in workspace.jsonc', () => {
        expect(output).to.not.have.string(LOADING_MSG_1);
      });
      it('should not run aspect which is static dep but not configured in workspace.j', () => {
        expect(output).to.not.have.string('ext 1');
      });
      it('should not load at all aspect which is regular dep provider', () => {
        expect(output).to.not.have.string(LOADING_MSG_2);
      });
      it('should not run aspect which is regular dep provider', () => {
        expect(output).to.not.have.string('ext 2');
      });
    });

    describe('when the dep aspect is configured in workspace.jsonc', function () {
      before(() => {
        helper.command.use('ext1');
        output = helper.command.showComponent('main-aspect');
      });
      it('should run main aspect provider', () => {
        expect(output).to.have.string(MAIN_ASPECT_PROVIDER_TEXT);
      });
      it('should load aspect dep provider', () => {
        expect(output).to.have.string(LOADING_MSG_1);
      });
      it('should run aspect dep provider', () => {
        expect(output).to.have.string('ext 1');
      });
      it('should not load at all aspect which is regular dep provider', () => {
        expect(output).to.not.have.string(LOADING_MSG_2);
      });
      it('should not run aspect which is regular dep provider', () => {
        expect(output).to.not.have.string('ext 2');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('simple case of using an external aspect', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.create('bit-aspect', 'my-aspect');
      helper.command.compile();
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
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
        const workspaceJson = helper.workspaceJsonc.read();
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
      console.log('${MAIN_ASPECT_PROVIDER_TEXT}');
      return new MainAspectMain();
    }
  }

  MainAspectAspect.addRuntime(MainAspectMain);
  `;
}
