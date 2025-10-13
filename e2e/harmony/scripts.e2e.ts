import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);

describe('script command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('custom env with scripts defined', () => {
    let envId: string;
    let envName: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      envName = helper.env.setCustomEnv('env-with-scripts');
      envId = `${helper.scopes.remote}/${envName}`;

      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);

      // Configure scripts to allow this env
      helper.workspaceJsonc.addKeyVal('teambit.workspace/scripts', {
        envs: [envId],
      });

      helper.command.compile();
    });

    describe('bit script --list', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script --list');
      });
      it('should list all available scripts', () => {
        expect(output).to.have.string('Available scripts');
      });
      it('should show the environment id', () => {
        expect(output).to.have.string(envId);
      });
      it('should show the script names', () => {
        expect(output).to.have.string('test-script');
        expect(output).to.have.string('another-script');
      });
      it('should show the script commands', () => {
        expect(output).to.have.string('echo hello from script');
        expect(output).to.have.string('echo another output');
      });
    });

    describe('bit script test-script', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script test-script');
      });
      it('should run the script successfully', () => {
        expect(output).to.have.string('Running script "test-script"');
      });
      it('should show the script output', () => {
        expect(output).to.have.string('hello from script');
      });
    });

    describe('bit script async-script', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script async-script');
      });
      it('should run the async script successfully', () => {
        expect(output).to.have.string('Running script "async-script"');
      });
      it('should show the async script output', () => {
        expect(output).to.have.string('async script executed');
      });
      it('should show the component count in the context', () => {
        expect(output).to.have.string('executed for 3 component(s)');
      });
      it('should show success message', () => {
        expect(output).to.have.string('✓ Script function executed successfully');
      });
    });

    describe('bit env get should show scripts', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit env get comp1');
      });
      it('should show scripts section', () => {
        expect(output).to.have.string('available scripts');
      });
      it('should list the scripts', () => {
        expect(output).to.have.string('test-script');
        expect(output).to.have.string('echo hello from script');
      });
    });

    describe('running non-existent script', () => {
      it('should throw an error', () => {
        expect(() => helper.command.runCmd('bit script non-existent-script')).to.throw();
      });
    });
  });

  describe('environment without scripts config', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react');
      helper.command.compile();
    });

    describe('bit script --list without config', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script --list');
      });
      it('should show config warning', () => {
        expect(output).to.have.string('no envs configured');
        expect(output).to.have.string('"teambit.workspace/scripts"');
        expect(output).to.have.string('"envs"');
      });
    });
  });

  describe('multiple environments with same env but different components', () => {
    let envId: string;

    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      const envName = helper.env.setCustomEnv('env-with-scripts');
      envId = `${helper.scopes.remote}/${envName}`;

      // Create components with the same env
      helper.fixtures.populateComponents(2);

      helper.extensions.addExtensionToVariant('comp1', envId);
      helper.extensions.addExtensionToVariant('comp2', envId);

      // Configure scripts to allow this env
      helper.workspaceJsonc.addKeyVal('teambit.workspace/scripts', {
        envs: [envId],
      });

      helper.command.compile();
    });

    describe('bit script --list', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script --list');
      });
      it('should list scripts from the environment', () => {
        expect(output).to.have.string(envId);
      });
      it('should show the scripts', () => {
        expect(output).to.have.string('test-script');
        expect(output).to.have.string('echo hello from script');
      });
    });

    describe('bit script test-script', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script test-script');
      });
      it('should run for all components', () => {
        expect(output).to.have.string('hello from script');
      });
      it('should mention the env in the output', () => {
        expect(output).to.have.string(envId);
      });
    });
  });

  describe('env version mismatch', () => {
    let envId: string;
    let envIdWithDifferentVersion: string;

    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      const envName = helper.env.setCustomEnv('env-with-scripts');
      envId = `${helper.scopes.remote}/${envName}`;
      // Simulate a different version by tagging
      envIdWithDifferentVersion = `${envId}@0.0.1`;

      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('*', envId);

      // Configure scripts to allow specific version only
      helper.workspaceJsonc.addKeyVal('teambit.workspace/scripts', {
        envs: [envIdWithDifferentVersion],
      });

      helper.command.compile();
    });

    describe('bit script --list with version mismatch', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script --list');
      });
      it('should not list scripts from env with different version', () => {
        expect(output).to.have.string('no scripts defined in the configured environments');
      });
    });

    describe('bit script test-script with version mismatch', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit script test-script');
      });
      it('should not run scripts', () => {
        expect(output).to.not.have.string('Running script');
        expect(output).to.not.have.string('hello from script');
      });
    });
  });
});
