import chai, { expect } from 'chai';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.createAspect('dep-dep-aspect');
      helper.fixtures.createAspect('dep-aspect');
      helper.fixtures.createAspect('main-aspect');
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

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();

      helper.command.install(`@ci/${helper.scopes.remoteWithoutOwner}.main-aspect`);

      helper.command.create('react-env', 'my-env', '--path my-env --env teambit.react/react');
      helper.fs.outputFile('my-env/my-env.main.runtime.ts', getEnvRuntimeMain(helper.scopes.remoteWithoutOwner));
      helper.fixtures.populateComponents(1);

      helper.extensions.addExtensionToVariant(`comp1`, `${helper.scopes.remote}/my-env`);
      helper.extensions.addExtensionToVariant(`my-env`, 'teambit.harmony/aspect');

      helper.command.compile();
      // the aspect and react envs used to be core aspects, now their packages must be installed
      // for the my-env fixture (which imports @teambit/react) to be compiled and loaded
      helper.command.install('@teambit/aspect@1.0.1107 @teambit/node@1.0.1107 @teambit/react@1.0.1107');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateExtensions(2, true);
      helper.extensions.addExtensionToVariant('extensions', 'teambit.harmony/aspect');
      helper.fixtures.createAspect('main-aspect');
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
      it('should not load nor run aspect which is static dep but not configured in workspace.jsonc', () => {
        expect(output).to.not.have.string(LOADING_MSG_1);
        expect(output).to.not.have.string('ext 1');
      });
      it('should not load nor run aspect which is regular dep provider', () => {
        expect(output).to.not.have.string(LOADING_MSG_2);
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
      it('should load and run aspect dep provider', () => {
        expect(output).to.have.string(LOADING_MSG_1);
        expect(output).to.have.string('ext 1');
      });
      it('should not load nor run aspect which is regular dep provider', () => {
        expect(output).to.not.have.string(LOADING_MSG_2);
        expect(output).to.not.have.string('ext 2');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('simple case of using an external aspect', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.createAspect('my-aspect');
      helper.command.compile();
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
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
  // slot-owner has a slot, registrar registers into it and app-aspect depends on both. app-aspect and slot-owner got a
  // new version, while registrar is still pinned to slot-owner@0.0.1. loading app-aspect from the scope must create
  // one instance of slot-owner, otherwise, registrar registers into a slot that app-aspect never reads.
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'loading an aspect from the scope when its dependencies pin different versions of the same aspect',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      let output: string;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        const scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
        helper.fixtures.createAspect('slot-owner');
        helper.fixtures.createAspect('registrar');
        helper.fixtures.createAspect('app-aspect');
        helper.fs.outputFile(`${scopeWithoutOwner}/slot-owner/slot-owner.main.runtime.ts`, getSlotOwnerAspect());
        helper.fs.outputFile(
          `${scopeWithoutOwner}/registrar/registrar.main.runtime.ts`,
          getRegistrarAspect(scopeWithoutOwner)
        );
        helper.fs.outputFile(
          `${scopeWithoutOwner}/app-aspect/app-aspect.main.runtime.ts`,
          getAppAspect(scopeWithoutOwner)
        );
        helper.extensions.addExtensionToVariant('*', 'teambit.harmony/aspect');
        helper.command.compile();
        helper.command.install();
        helper.command.tagAllComponents('--skip-tasks ExtractSchema');
        helper.command.export();
        // tag a new version of slot-owner and app-aspect. registrar is not in this workspace, so it stays on 0.0.1
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.command.importComponent('slot-owner');
        helper.command.importComponent('app-aspect');
        helper.command.tagAllComponents('--unmodified --skip-tasks ExtractSchema');
        helper.command.export();

        // load the aspect from the bare remote scope, the same way a scope-side build does
        helper.fs.outputFile('load-aspect.js', getLoadAspectScript());
        const scriptPath = path.join(helper.scopes.localPath, 'load-aspect.js');
        try {
          output = execSync(`node ${scriptPath} ${helper.scopes.remotePath} ${helper.scopes.remote}/app-aspect@0.0.2`, {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        } catch (err: any) {
          output = `${err.stdout}\n${err.stderr}`;
        }
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should load slot-owner once, in the version app-aspect depends on', () => {
        const providerRuns = output.split('\n').filter((line) => line.startsWith('slot-owner provider'));
        expect(providerRuns, output).to.deep.equal([`slot-owner provider ${helper.scopes.remote}/slot-owner@0.0.2`]);
      });
      it('should let app-aspect read what registrar registered', () => {
        expect(output).to.have.string('app-aspect sees: ["registrar"]');
      });
    }
  );
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

function getSlotOwnerAspect() {
  return `import { MainRuntime } from '@teambit/cli';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { SlotOwnerAspect } from './slot-owner.aspect';

export class SlotOwnerMain {
  constructor(private slot: SlotRegistry<string>) {}
  register(name: string) {
    this.slot.register(name);
  }
  list() {
    return this.slot.values();
  }
  static slots = [Slot.withType<string>()];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider(_deps: [], _config: any, [slot]: [SlotRegistry<string>]) {
    console.log('slot-owner provider ' + SlotOwnerAspect.id);
    return new SlotOwnerMain(slot);
  }
}

SlotOwnerAspect.addRuntime(SlotOwnerMain);
`;
}

function getRegistrarAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
import { SlotOwnerAspect, SlotOwnerMain } from '@ci/${remoteScope}.slot-owner';
import { RegistrarAspect } from './registrar.aspect';

export class RegistrarMain {
  static slots = [];
  static dependencies = [SlotOwnerAspect];
  static runtime = MainRuntime;
  static async provider([slotOwner]: [SlotOwnerMain]) {
    slotOwner.register('registrar');
    return new RegistrarMain();
  }
}

RegistrarAspect.addRuntime(RegistrarMain);
`;
}

function getAppAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
import { SlotOwnerAspect, SlotOwnerMain } from '@ci/${remoteScope}.slot-owner';
import { RegistrarAspect } from '@ci/${remoteScope}.registrar';
import { AppAspectAspect } from './app-aspect.aspect';

export class AppAspectMain {
  static slots = [];
  static dependencies = [SlotOwnerAspect, RegistrarAspect];
  static runtime = MainRuntime;
  static async provider([slotOwner]: [SlotOwnerMain]) {
    console.log('app-aspect sees: ' + JSON.stringify(slotOwner.list()));
    return new AppAspectMain();
  }
}

AppAspectAspect.addRuntime(AppAspectMain);
`;
}

/**
 * a script that loads an aspect in a bare scope. it runs outside of this repo, so it requires bit by an absolute path.
 */
function getLoadAspectScript() {
  // @ts-ignore
  const bitPath = createRequire(import.meta.url).resolve('@teambit/bit');
  return `const { loadBit } = require('${bitPath}');
const [, , scopePath, aspectId] = process.argv;
(async () => {
  const harmony = await loadBit(scopePath);
  await harmony.get('teambit.scope/scope').loadAspects([aspectId], true);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
}
