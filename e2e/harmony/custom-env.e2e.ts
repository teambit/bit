import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { IssuesClasses } from '@teambit/component-issues';
import { Extensions, IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('custom env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('non existing env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.extensions.addExtensionToVariant('*', 'company.scope/envs/fake-env');
    });
    // before, it was throwing: "company.scope: access denied"
    it('bit status should show a descriptive error', () => {
      expect(() => helper.command.status()).to.throw(
        'unable to import the following component(s): company.scope/envs/fake-env'
      );
    });
  });
  describe('non loaded env', () => {
    let envId;
    let envName;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
      envName = helper.env.setCustomEnv(undefined, { skipCompile: true, skipInstall: true });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, undefined, undefined, false);
      helper.extensions.addExtensionToVariant('*', envId);
      // Clean the node_modules as we want to run tests when node_modules is empty
      fs.rmdirSync(path.join(helper.scopes.localPath, 'node_modules'), { recursive: true });
    });
    it('should show the correct env in bit show (with no loaded indication)', () => {
      const componentShowParsed = helper.command.showComponentParsedHarmonyByTitle('comp1', 'env');
      expect(componentShowParsed).to.equal(envId);
      const regularShowOutput = helper.command.showComponent('comp1');
      expect(regularShowOutput).to.contain(`${envId} (not loaded)`);
    });
    it('should show the correct env in bit envs (with no loaded indication)', () => {
      const envsOutput = helper.command.envs();
      expect(envsOutput).to.contain(`${envId} (not loaded)`);
    });
    it('should show a component issue in bit status', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.NonLoadedEnv.name);
    });
  });
  describe('custom env with 3 components', () => {
    let wsAllNew;
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      wsAllNew = helper.scopeHelper.cloneLocalScope(IS_WINDOWS);
    });
    describe('tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('should have the correct env in the envs aspect data', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const envIdFromModel = getEnvIdFromModel(comp1);
        expect(envIdFromModel).to.equal(envId);
      });
      describe('tag again', () => {
        before(() => {
          // helper.command.tagWithoutBuild(envName, '-f');
          helper.command.tagComponent(envName, 'message', '--unmodified');
        });
        it('should have the correct env in the envs aspect data after additional tag', () => {
          const comp1 = helper.command.catComponent('comp1@latest');
          const envIdFromModel = getEnvIdFromModel(comp1);
          expect(envIdFromModel).to.equal(`${envId}`);
        });
      });
    });
    describe('untag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsAllNew);
        helper.command.tagAllWithoutBuild();
      });
      // previously it used to throw "error: component "node-env@0.0.1" was not found."
      it('should untag successfully', () => {
        expect(() => helper.command.reset('--all')).to.not.throw();
      });
    });
    describe('out-of-sync scenario where the id is changed during the process', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsAllNew);
        helper.command.tagAllWithoutBuild();
        const bitMapBeforeExport = helper.bitMap.read();
        helper.command.export();
        helper.bitMap.write(bitMapBeforeExport);
      });
      it('bit status should not throw ComponentNotFound error', () => {
        expect(() => helper.command.status()).not.to.throw();
      });
    });
  });
  describe('change an env after tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      const newEnvId = 'teambit.react/react';
      helper.extensions.addExtensionToVariant('*', newEnvId, undefined, true);
    });
    it('bit status should show it as an issue because the previous env was not removed', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
  });
  describe('change an env after tag2 and then change it back to the custom-env in the workspace', () => {
    let envId;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      const envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', envId);
      helper.command.compile();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const newEnvId = 'teambit.react/react';
      helper.command.setEnv('comp1', newEnvId);
      helper.command.setEnv('comp1', envId);
    });
    // previous bug was showing the custom-env with minus in .bitmap and then again with an empty object, causing the
    // env to fallback to node.
    it('should have the correct env', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.include(envId);
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('load env from env root', () => {
    let envId;
    let envName;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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

      helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.tagAllComponents('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
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
  describe('when the env is tagged and set in workspace.jsonc without exporting it', () => {
    before(() => {
      // important! don't disable the preview.
      helper.scopeHelper.setNewLocalAndRemoteScopes({ disablePreview: false });
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.extensions.addExtensionToWorkspace(envId);
      helper.command.tagAllWithoutBuild();
    });
    // previously, it errored "error: component "n8w0pqms-local/3wc3xd3p-remote/node-env@0.0.1" was not found"
    it('should be able to re-tag with no errors', () => {
      // important! don't skip the build. it's important for the Preview task to run.
      expect(() => helper.command.tagIncludeUnmodified()).not.to.throw();
    });
  });
  describe('when the env is exported to a remote scope and is not exist locally', () => {
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.populateComponents(1);
    });
    // previously, it errored "Cannot read property 'id' of undefined"
    it('bit env-set should not throw any error', () => {
      expect(() => helper.command.setEnv('comp1', envId));
    });
  });
  describe('custom-env is 0.0.2 on the workspace, but comp1 is using it in the model with 0.0.1', () => {
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.tagAllWithoutBuild();
      helper.command.tagWithoutBuild(envName, '--skip-auto-tag --unmodified'); // 0.0.2
    });
    // previously, this was failing with ComponentNotFound error.
    // it's happening during the load of comp1, we have the onLoad, where the workspace calculate extensions.
    // Once it has all extensions it's loading them. in this case, comp1 has the custom-env with 0.0.1 in the envs/envs
    // it's unable to find it in the workspace and asks the scope, which can't find it because it's the full-id include
    // scope-name.
    // now, during the extension calculation, it checks whether the component is in the workspace, and if so, it sets
    // the version according to the workspace.
    it('any bit command should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('bit show should show the correct env', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal(`${envId}@0.0.2`);
    });
    it('bit show should not show the previous version of the env', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.not.have.string(`${envId}@0.0.1`);
    });
  });
  describe('rename custom env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.rename(envName, 'new-env');
    });
    it('should update components using the custom-env with the new name', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.include('new-env');
    });
  });
  describe('tag custom env then env-set the comp uses it to another non-core env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.tagAllWithoutBuild();
      helper.command.setEnv('comp1', 'teambit.react/react-env@1.0.5');
    });
    // previously, it didn't remove the custom-env due to mismatch between the legacy-id and harmony-id.
    it('bit status should not show it as an issue because the previous env was removed', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
  });
  // @todo: fix this. currently, it's failing because when loading the env, it runs workspace.loadAspects, which builds
  // the component's graph. It loads the comp1 to check whether isAspect, it returns false, but loading comp1 loads also
  // all its aspects, including the env.
  describe.skip('circular dependencies between an env and a component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.setCustomEnv();
      // const envName = helper.env.setCustomEnv();
      // const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('node-env/foo.ts', `import "@${helper.scopes.remote}/comp1'";`);
    });
    it('should not enter into an infinite loop on any command', () => {
      helper.command.status();
    });
  });
  describe('ejecting conf when current env exists locally', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.setCustomEnv();
      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', 'node-env');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.ejectConf('comp1');
    });
    it('should write the env aspect without a version to the component.json file', () => {
      const compJson = helper.componentJson.read('comp1');
      expect(compJson.extensions).to.have.property(`${helper.scopes.remote}/node-env`);
      expect(compJson.extensions).to.not.have.property(`${helper.scopes.remote}/node-env@0.0.1`);
    });
  });
  describe('an empty env. nothing is configured, not even a compiler', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile(
        'empty-env/empty-env.bit-env.ts',
        `export class EmptyEnv {}
export default new EmptyEnv();
`
      );
      helper.fs.outputFile('empty-env/index.ts', `export { EmptyEnv } from './empty-env.bit-env';`);
      helper.command.addComponent('empty-env');
      helper.command.setEnv('empty-env', 'teambit.envs/env');

      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', 'empty-env');

      fs.removeSync(path.join(helper.scopes.localPath, 'node_modules'));
      helper.command.install();
    });
    it('bit compile should not compile the component', () => {
      const output = helper.command.compile();
      expect(output).to.not.have.string('comp1');
    });
    it('should not create dist dir in the node_modules', () => {
      const dir = path.join(helper.scopes.localPath, 'node_modules', helper.scopes.remote, 'comp1/dist');
      expect(dir).to.not.be.a.path();
    });
    it('bit build should not fail', () => {
      const output = helper.command.build();
      expect(output).to.have.string('build succeeded');
    });
    it('bit format should not show an error', () => {
      const output = helper.command.format();
      expect(output).to.not.have.string('failed');
    });
    it('bit lint should not show an error', () => {
      const output = helper.command.lint();
      expect(output).to.not.have.string('failed');
    });
    it('bit test should not show an error', () => {
      const output = helper.command.test();
      expect(output).to.not.have.string('failed');
    });
  });
});

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
