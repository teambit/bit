import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);
describe('custom env (config and versioning scenarios)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when the env is tagged and set in workspace.jsonc without exporting it', () => {
    before(() => {
      // important! don't disable the preview.
      helper.scopeHelper.setWorkspaceWithRemoteScope({ disablePreview: false });
      // node-env-1 is a minimal old-format env fixture - it preserves the custom-env mechanics
      // without installing the full legacy node-env dependency chain
      const envName = helper.env.setCustomEnv('node-env-1');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomEnv('node-env-1');
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv('node-env-1');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv('node-env-1');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      const envName = helper.env.setCustomEnv('node-env-1');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.env.setCustomEnv();
      // const envName = helper.env.setCustomEnv();
      // const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('node-env/foo.ts', `import "@${helper.scopes.remote}/comp1";`);
      helper.command.setEnv('comp1', 'node-env');
    });
    it('should not enter into an infinite loop on any command', () => {
      helper.command.status();
    });
  });
  describe('circular dependencies between an env and a theme component used in env mounter', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      // Create a React env
      const envName = helper.env.setCustomNewEnv('react-based-env');
      const envId = `${helper.scopes.remote}/${envName}`;

      // Create a theme component
      helper.fixtures.populateComponents(1, false);
      helper.command.rename('comp1', 'theme');
      helper.fs.outputFile(
        'theme/index.tsx',
        `import React from 'react';
export const MyTheme = ({ children }: { children: React.ReactNode }) => <div className="theme">{children}</div>;`
      );

      // Set the env to use this theme component in its mounter
      helper.fs.outputFile(
        `${envName}/preview/mounter.tsx`,
        `import React from 'react';
import { createMounter } from '@teambit/react.mounter';
import { MyTheme } from '@${helper.scopes.remote}/theme';

export function MyReactProvider({ children }: { children: React.ReactNode }) {
  return <MyTheme>{children}</MyTheme>;
}

export default createMounter(MyReactProvider) as any;`
      );

      // Set the theme component to use the custom env
      helper.command.setEnv('theme', envId);

      // Compile and snap on a lane
      helper.command.compile();
      helper.command.createLane('test-circular');
      helper.command.snapAllComponentsWithoutBuild(
        '--ignore-issues "CircularDependencies,MissingPackagesDependenciesOnFs"'
      );
      helper.command.export();

      // Create a new workspace and import the lane
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.command.importLane('test-circular', '-x');
    });
    it('bit status should not enter into an infinite loop', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('should complete bit status command successfully', () => {
      const status = helper.command.status();
      expect(status).to.be.a('string');
    });
  });
});
