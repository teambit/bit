import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);
describe('custom env (config and versioning scenarios) (part 2)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('ejecting conf when current env exists locally', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.env.setCustomEnv('node-env-1');
      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', 'node-env-1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.ejectConf('comp1');
    });
    it('should write the env aspect without a version to the component.json file', () => {
      const compJson = helper.componentJson.read('comp1');
      expect(compJson.extensions).to.have.property(`${helper.scopes.remote}/node-env-1`);
      expect(compJson.extensions).to.not.have.property(`${helper.scopes.remote}/node-env-1@0.0.1`);
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
      // lint only the component using the empty env. the env component itself is linted by its
      // own env (teambit.envs/env, a published package), whose linter setup is not the concern
      // of this test.
      const output = helper.command.lint('comp1');
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
      const envName = helper.env.setCustomEnv('node-env-1');
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', envId);
    });
    it('should throw a descriptive error when a policy entry is not an object', () => {
      helper.fs.outputFile(
        'node-env-1/env.jsonc',
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
        'node-env-1/env.jsonc',
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
