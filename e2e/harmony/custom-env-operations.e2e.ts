import fs from 'fs-extra';
import path from 'path';
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomEnv();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
  describe('ejecting conf when current env exists locally', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.env.setEmptyEnv();

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
  describe('an env with a preview/bundler but without a compiler', () => {
    let buildOutput: string;
    before(() => {
      // preview is disabled by default in e2e to speed up tagging. enable it so the GeneratePreview
      // task actually runs - this is the path that used to fail for a compiler-less env.
      helper.scopeHelper.setWorkspaceWithRemoteScope({ disablePreview: false });
      // a react-based env with the compiler (and the env build pipe) removed. so the env has a
      // preview/bundler but no compiler, exactly like bitdev.general/envs/js-env.
      const envName = helper.env.setCustomNewEnv('react-no-compiler-env');
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', envId);
      helper.command.install();
    });
    it('bit build should not fail generating the preview', () => {
      // before the fix it used to throw "context.env.getCompiler is not a function" and then
      // ENOENT when writing the preview link into the (never created) dist dir.
      // skip the TSCompiler task: comp1's env has no compiler anyway, and skipping it avoids
      // compiling the env component itself (irrelevant to this scenario - the user's env was a
      // resolved dependency, not built). the global GeneratePreview task still runs.
      buildOutput = helper.command.build('comp1', '--skip-tasks TSCompiler');
      expect(buildOutput).to.have.string('build succeeded');
    });
    it('the GeneratePreview task should have run (preview was needed, not skipped)', () => {
      expect(buildOutput).to.have.string('GeneratePreview');
    });
  });
  describe('custom env with invalid env.jsonc', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', envId);
    });
    it('should throw a descriptive error when a policy entry is not an object', () => {
      helper.fs.outputFile(
        'node-env/env.jsonc',
        `{
  "policy": {
    "dev": [
      "lodash"
    ]
  }
}`
      );
      const output = helper.general.runWithTryCatch('bit status');
      expect(output).to.have.string(
        'error: failed validating the env.jsonc file. policy.dev entry must be an object, got type "string" value: "lodash"'
      );
    });
    it('should throw a descriptive error when a policy entry object has no "version" field', () => {
      helper.fs.outputFile(
        'node-env/env.jsonc',
        `{
  "policy": {
    "dev": [
      {
        "name": "lodash"
      }
    ]
  }
}`
      );
      const output = helper.general.runWithTryCatch('bit status');
      expect(output).to.have.string(
        'error: failed validating the env.jsonc file. policy.dev entry must have a "version" property'
      );
    });
  });
});
