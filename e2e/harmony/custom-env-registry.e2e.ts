import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { IssuesClasses } from '@teambit/component-issues';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);
describe('custom env (registry)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('load env from env root', () => {
    let envId;
    let envName;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.workspaceJsonc.setupDefault();
      envName = helper.env.setCustomNewEnv(undefined, undefined, {
        policy: {
          peers: [
            {
              name: 'react',
              version: '^16.8.0',
              supportedRange: '^16.8.0',
            },
          ],
        },
      });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.showComponent(envId);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      // Clean the capsule dir to make sure it's empty before we continue
      const scopeAspectsCapsulesRootDir = helper.command.capsuleListParsed().scopeAspectsCapsulesRootDir;
      if (fs.pathExistsSync(scopeAspectsCapsulesRootDir)) {
        fs.rmdirSync(scopeAspectsCapsulesRootDir, { recursive: true });
      }

      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.extensions.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', true);
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', envId);
      helper.command.install();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper = new Helper();
    });
    it('should load the env without issue', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.NonLoadedEnv.name);
      const showOutput = helper.command.showComponent('comp1');
      expect(showOutput).to.have.string(envId);
      expect(showOutput).to.not.have.string('not loaded');
    });
    it('should have the env installed in its root', () => {
      const envRootDir = helper.env.rootCompDir(`${envId}@0.0.1`);
      const resolvedInstalledEnv = resolveFrom(envRootDir, [
        `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.react-based-env`,
      ]);
      expect(envRootDir).to.be.a.path();
      expect(resolvedInstalledEnv).to.be.a.path();
    });
    it('should not create scope aspect capsule', () => {
      const scopeAspectsCapsulesRootDir = helper.command.capsuleListParsed().scopeAspectsCapsulesRootDir;
      expect(scopeAspectsCapsulesRootDir).to.not.be.a.path();
    });
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)('custom env installed as a package', () => {
    let envId: string;
    let envName: string;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      // see the comment about the node-env-1 fixture in the 'non loaded env' describe. crucial
      // here: each sub-describe re-inits a workspace and loads this env from the scope into a
      // scope-aspects capsule - a full-chain env would pay that chain per sub-describe.
      envName = helper.env.setCustomEnv('node-env-1');
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.tagAllComponents('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper = new Helper();
    });
    describe('setting up the external env without a version', () => {
      before(() => {
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('*', envId);
      });
      it('should show a descriptive error when tagging the component', () => {
        const tagOutput = helper.general.runWithTryCatch('bit tag -m msg');
        expect(tagOutput).to.have.string('failed loading env - external env without a version');
      });
      describe('running any other command', () => {
        // @Gilad TODO
        it.skip('should warn or error about the misconfigured env and suggest to enter the version', () => {});
      });
    });

    describe('set up the env using bit env set without a version', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', envId);
      });
      it('should save it with the latest version in root', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.2`);
      });
    });
    describe('set up the env using bit env set with a version', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.2`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.2`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });
    describe('set up the env using bit create --env with a version', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.create('starter', 'comp1', `--env ${envId}@0.0.1`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });
    describe('set up the env and then unset it', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.unsetEnv('comp1');
      });
      it('should remove the env not only from envs/envs but also from root', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.not.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config).to.not.have.property(Extensions.envs);
      });
    });
    describe('set up the env and then replace it with another env without mentioning the version', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.replaceEnv(envId, `${envId}@0.0.2`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.not.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.2`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });
    describe('set up the same env with two different versions, then replace with another env', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(2);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.setEnv('comp2', `${envId}@0.0.2`);
        helper.command.replaceEnv(envId, `teambit.react/react`);
      });
      it('should replace the env for both components', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.not.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp2.config).to.not.have.property(`${envId}@0.0.2`);
        expect(bitMap.comp1.config).to.have.property('teambit.react/react');
        expect(bitMap.comp2.config).to.have.property('teambit.react/react');
      });
    });
    describe('tag and change the env version', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.tagAllWithoutBuild();
        helper.command.setEnv('comp1', `${envId}@0.0.2`);
      });
      it('bit status should show it as modified', () => {
        const isModified = helper.command.statusComponentIsModified('my-scope/comp1');
        expect(isModified).to.be.true;
      });
    });
    describe('snapping the env on the lane and then deleting it', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.createLane();
        helper.command.importComponent(envName);
        helper.command.setEnv('comp1', envId);
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();

        helper.command.softRemoveOnLane(envId);
      });
      it('bit status should show the RemovedEnv issue', () => {
        helper.command.expectStatusToHaveIssue(IssuesClasses.RemovedEnv.name);
      });
      it('replacing the env should fix the issue', () => {
        helper.command.replaceEnv(envId, `${envId}@0.0.2`);
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.RemovedEnv.name);
      });
    });
    describe('missing modules in the env capsule', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('*', `${envId}@0.0.1`);
        helper.command.status(); // populate capsules.
        const capsules = helper.command.capsuleListParsed();
        const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
        fs.removeSync(path.join(scopeAspectCapsulesPath, 'node_modules'));
      });
      it('should re-create the capsule dir and should not show any warning/error about loading the env', () => {
        const status = helper.command.status();
        expect(status).to.not.include('unable to load the extension');
      });
      it('bit show should show the correct env', () => {
        const env = helper.env.getComponentEnv('comp1');
        expect(env).to.equal(`${envId}@0.0.1`);
      });
    });
    describe('core-env was set in previous tag and another non-core env is set now', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        // the mdx env used to be a core aspect, now its package (and its chain) must be
        // installed for the env to load
        helper.command.install(
          '@teambit/mdx@1.0.1043 @teambit/react@1.0.1042 @teambit/node@1.0.1042 @teambit/aspect@1.0.1042'
        );
        helper.command.setEnv('comp1', 'teambit.mdx/mdx');
        helper.command.tagAllWithoutBuild();
        // it's important to have here a non-core env. otherwise, the issue won't be shown.
        helper.command.setEnv('comp1', envId);
        helper.command.status(); // run any command to get rid of pnpm output so the next command will be a valid json.
      });
      it('bit status should not show it as an issue', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
      });
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  });
});
