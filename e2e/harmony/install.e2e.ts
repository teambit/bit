import stripAnsi from 'strip-ansi';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { addDistTag } from '@pnpm/registry-mock';
import { IssuesClasses } from '@teambit/component-issues';
import { getAnotherInstallRequiredOutput } from '@teambit/install';
import chai, { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('install command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('component is in .bitmap and in workspace.jsonc', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      const pkg = helper.general.getPackageNameByCompName('comp1');
      helper.command.install(pkg);
      helper.fs.appendFile('comp1/index.js');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('bit status should show it with DuplicateComponentAndPackage issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.DuplicateComponentAndPackage.name);
    });
  });

  describe('install with old envs in the workspace', () => {
    let wsEmptyNM: string;
    let envId;
    let envName;
    let output;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
      envName = helper.env.setCustomEnv('env-add-dependencies', { skipCompile: true, skipInstall: true });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, undefined, undefined, false);
      helper.extensions.addExtensionToVariant('*', envId);
      // Clean the node_modules as we want to run tests when node_modules is empty
      fs.rmdirSync(path.join(helper.scopes.localPath, 'node_modules'), { recursive: true });
      wsEmptyNM = helper.scopeHelper.cloneWorkspace(IS_WINDOWS);
    });
    describe('without --recurring-install', () => {
      before(async () => {
        output = helper.command.install();
      });
      it('should show a warning that the workspace has old env without env.jsonc so another install might be required', async () => {
        const msg = stripAnsi(getAnotherInstallRequiredOutput(false, [envId]));
        expect(output).to.have.string(msg);
      });
      it('should not install deps that were configured in the env in first install', async () => {
        expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.not.be.a.path();
      });
      describe('without --recurring-install - second install', () => {
        before(async () => {
          output = helper.command.install();
        });
        it('should not show a warning that the workspace has old env without env.jsonc so another install might be required', async () => {
          const msg = stripAnsi(getAnotherInstallRequiredOutput(false, [envId]));
          expect(output).to.not.have.string(msg);
        });
        it('should install deps that were configured in the env in second install', async () => {
          expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.be.a.path();
        });
      });
    });
    describe('with --recurring-install', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsEmptyNM);
        output = helper.command.install(undefined, { 'recurring-install': '' });
      });
      it('should install deps that were configured in the env', async () => {
        expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.be.a.path();
      });
    });
  });
});

describe('install generator configured envs', function () {
  this.timeout(0);
  let helper: Helper;
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    const generatorConfig = {
      envs: ['teambit.react/react-env', 'teambit.react/react'],
    };
    helper.extensions.workspaceJsonc.addKeyVal('teambit.generator/generator', generatorConfig);
    helper.command.install();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should install custom envs configured for the generator aspect', async () => {
    const reactEnvPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/@teambit/react.react-env');
    expect(reactEnvPath).to.be.a.path();
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)('install --no-optional', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      npmCiRegistry.setRegistry();
      helper.command.install('@pnpm.e2e/pkg-with-good-optional --no-optional');
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should not install optional dependencies', async () => {
      const dirs = helper.fs.getVirtualStoreDirNames();
      expect(dirs).to.not.include('is-positive@1.0.0');
      expect(dirs).to.include('@pnpm.e2e+pkg-with-good-optional@1.0.0');
    });
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)('install --update', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('minimumReleaseAge', 0);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      npmCiRegistry.setRegistry();
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      helper.command.install('@pnpm.e2e/dep-of-pkg-with-1-dep @pnpm.e2e/parent-of-pkg-with-1-dep');
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '101.0.0', distTag: 'latest' });
      helper.command.install('--update');
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should update direct dependency inside existing range', async () => {
      const manifest = fs.readJSONSync(
        path.join(helper.fixtures.scopes.localPath, 'node_modules/@pnpm.e2e/dep-of-pkg-with-1-dep/package.json')
      );
      expect(manifest.version).to.eq('100.1.0');
    });
    it('should update subdependency inside existing range', async () => {
      const lockfile = yaml.load(
        fs.readFileSync(path.join(helper.fixtures.scopes.localPath, 'pnpm-lock.yaml'), 'utf8')
      ) as any;
      expect(lockfile.packages).to.have.property('@pnpm.e2e/pkg-with-1-dep@100.1.0');
      expect(
        lockfile.snapshots?.['@pnpm.e2e/parent-of-pkg-with-1-dep@1.0.0']?.dependencies?.['@pnpm.e2e/pkg-with-1-dep']
      ).to.eq('100.1.0');
    });
  });
});

describe('install new dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceJsonc;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.command.install('is-positive@~1.0.0 is-odd@3.0.0 is-even@1 is-negative semver@2.0.0-beta');
    workspaceJsonc = helper.workspaceJsonc.read();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should add new dependency preserving the ~ prefix', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
      '~1.0.0'
    );
  });
  it('should add new dependency with exact version if the dependency was installed by specifying the exact version', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.equal('3.0.0');
    expect(fs.readJsonSync(path.join(helper.scopes.localPath, 'node_modules/is-odd/package.json')).version).to.equal(
      '3.0.0'
    );
  });
  it('should add new dependency with ^ prefix if the dependency was installed by specifying a range not using ~', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-even']).to.equal(
      '^1.0.0'
    );
  });
  it('should add new dependency with ^ prefix by default', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative'][0]).to.equal(
      '^'
    );
  });
  it('should add prerelease version as exact version', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies.semver).to.equal(
      '2.0.0-beta'
    );
  });
});

describe('named install', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceJsonc;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.command.install('is-positive@1.0.0');
    helper.command.install('is-positive');
    workspaceJsonc = helper.workspaceJsonc.read();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should override already existing dependency with the latest version', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
      '^3.1.0'
    );
  });
});

describe('install with --lockfile-only', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceJsonc;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.command.install('is-positive@^1.0.0 --lockfile-only');
    workspaceJsonc = helper.workspaceJsonc.read();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should update workspace.jsonc', () => {
    expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
      '^1.0.0'
    );
  });
  it('should create pnpm-lock.yaml', () => {
    expect(fs.existsSync(path.join(helper.fixtures.scopes.localPath, 'pnpm-lock.yaml'))).to.equal(true);
  });
  it('should not write dependencies to node_modules', () => {
    expect(fs.existsSync(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive'))).to.equal(false);
  });
});

describe('comment preservation during install', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceConfigAfter: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitWorkspace();

    // Create workspace.jsonc with comments
    const workspaceJsoncWithComments = `/**
 * this is the main configuration file of your bit workspace.
 * for full documentation, please see: https://bit.dev/reference/workspace/workspace-json
 **/
{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  /**
   * main configuration of the Bit workspace.
   **/
  "teambit.workspace/workspace": {
    /**
     * the name of the component workspace. used for development purposes.
     **/
    "name": "68621823",
    /**
     * set the icon to be shown on the Bit server.
     **/
    "icon": "https://static.bit.dev/brands/bit-logo-min.png",
    /**
     * default directory to place a component during \`bit import\` and \`bit create\`.
     * the following placeholders are available:
     * name - component name includes namespace, e.g. 'ui/button'.
     * scopeId - full scope-id includes the owner, e.g. 'teambit.compilation'.
     * scope - scope name only, e.g. 'compilation'.
     * owner - owner name in bit.dev, e.g. 'teambit'.
     **/
    "defaultDirectory": "{scope}/{name}",
    /**
     * default scope for all components in workspace.
     **/
    "defaultScope": "my-scope",
    "resolveAspectsFromNodeModules": true,
    "resolveEnvsFromRoots": true
  },
  /**
  * Enable generator templates by uncommenting the desired environments below.
  * These generators scaffold components for Node, React, Vue, and Angular.
  * After uncommenting, run \`bit install\` to make them available in your workspace.
  * Explore more dev environments at: https://bit.dev/docs/getting-started/composing/dev-environments
  **/
  "teambit.generator/generator": {
    "envs": [
      // "bitdev.node/node-env",
      // "bitdev.react/react-env",
      // "bitdev.vue/vue-env",
      // "bitdev.angular/angular-env"
      // "bitdev.symphony/envs/symphony-env"
    ]
  },
  /**
   * main configuration for component dependency resolution.
   **/
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // this dependency must stay pinned
        "is-odd": "1.0.0"
      },
      "peerDependencies": {}
    },
    "linkCoreAspects": true,
    "packageManager": "teambit.dependencies/pnpm",
    "rootComponents": true,
    "engineStrict": true,
    // Some comments.
    "packageImportMethod": "copy"
  },
  "teambit.workspace/workspace-config-files": {
    "enableWorkspaceConfigWrite": true
  }
}`;
    helper.fs.outputFile('workspace.jsonc', workspaceJsoncWithComments);

    // Install a dependency which should preserve comments
    helper.command.install('lodash');
    workspaceConfigAfter = helper.fs.readFile('workspace.jsonc');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should preserve comments in workspace.jsonc when installing a new dependency', () => {
    expect(workspaceConfigAfter).to.include('// Some comments.');
  });
  it('should preserve block comments in workspace.jsonc', () => {
    expect(workspaceConfigAfter).to.include('/**');
    expect(workspaceConfigAfter).to.include('main configuration for component dependency resolution');
  });
  it('should have added the lodash dependency to policy', () => {
    // Simply check if the lodash dependency is present in the text
    expect(workspaceConfigAfter).to.include('"lodash":');
  });
  it('should preserve a comment attached to a dependency inside the policy', () => {
    expect(workspaceConfigAfter).to.include('// this dependency must stay pinned');
  });
});

describe('repeat install with nothing changed', function () {
  this.timeout(0);
  let helper: Helper;
  let secondInstallOutput: string;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.fixtures.populateComponents(1);
    helper.command.install();
    secondInstallOutput = stripAnsi(helper.command.install());
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should let the package manager return early instead of reinstalling', () => {
    expect(secondInstallOutput).to.include('Already up to date');
  });
});

describe('install when the package manager re-creates the injected copy of a workspace env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.extensions.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.extensions.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', true);
    // the generated tsconfig.json of each component has an "extends" relative to the workspace, which is
    // invalid from inside an injected copy under node_modules/.pnpm.
    helper.extensions.workspaceJsonc.addKeyVal('teambit.workspace/workspace-config-files', {
      enableWorkspaceConfigWrite: true,
    });
    helper.command.install('@teambit/typescript.typescript-compiler@3.0.0 @teambit/compiler');

    const tsconfig = {
      compilerOptions: {
        target: 'es2019',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        declaration: true,
        sourceMap: true,
        skipLibCheck: true,
        esModuleInterop: true,
        outDir: './dist',
      },
      exclude: ['artifacts', 'public', 'dist', 'node_modules'],
    };
    // the env resolves its tsconfig relative to its compiled file, i.e. inside "dist" of its injected copy.
    // it depends on comp1, which uses this env, so a failure to load the env compiles comp1 with it.
    const envCode = `import { TypescriptCompiler } from '@teambit/typescript.typescript-compiler';
import { compName } from '@${helper.scopes.remote}/comp1';

export class MyEnv {
  name = compName;

  compiler() {
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
    });
  }
}

export default new MyEnv();
`;
    helper.fs.outputFile('comp1/index.ts', `export const compName = 'my-env';`);
    helper.fs.outputFile('my-env/my-env.bit-env.ts', envCode);
    helper.fs.outputFile('my-env/index.ts', `export { MyEnv } from './my-env.bit-env';`);
    helper.fs.outputFile('my-env/config/tsconfig.json', JSON.stringify(tsconfig, null, 2));
    helper.command.addComponent('comp1');
    helper.command.addComponent('my-env');
    helper.command.setEnv('my-env', 'teambit.envs/env');
    helper.command.install();
    // the next install loads my-env, then the package manager re-creates its package dir with the sources only,
    // so the loaded instance holds a tsconfig path into a "dist" that no longer exists.
    helper.command.setEnv('comp1', 'my-env');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should restore the env files before compiling with it', () => {
    expect(() => helper.command.install()).to.not.throw();
  });
});
