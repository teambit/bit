import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit debug-load command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component with an env set via workspace variants', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.extensions.addExtensionToVariant('comp1', 'teambit.react/react');
      helper.command.install();
    });
    describe('human output', () => {
      let output: string;
      before(() => {
        output = helper.command.runCmd('bit debug-load comp1');
      });
      it('should print all four sections', () => {
        expect(output).to.have.string('load stages');
        expect(output).to.have.string('extension sources');
        expect(output).to.have.string('environment');
        expect(output).to.have.string('load issues');
      });
      it('should attribute the env to the variants source', () => {
        expect(output).to.have.string('teambit.react/react');
        expect(output).to.have.string('WorkspaceVariants');
      });
      it('should show load stages with cache info', () => {
        expect(output).to.have.string('workspace.get');
        expect(output).to.have.string('componentsCache');
      });
    });
    describe('json output', () => {
      let parsed;
      before(() => {
        const output = helper.command.runCmd('bit debug-load comp1 --json');
        parsed = JSON.parse(output);
      });
      it('should emit a valid trace tree with durations', () => {
        expect(parsed.trace).to.have.property('name', 'debug-load');
        expect(parsed.trace).to.have.property('durationMs');
        expect(parsed.trace.children).to.be.an('array');
      });
      it('should emit extension sources, env resolution and issues', () => {
        expect(parsed.extensionSources).to.be.an('array');
        expect(parsed.envId).to.have.string('teambit.react/react');
        expect(parsed.envOrigin).to.equal('WorkspaceVariants');
        expect(parsed.issues).to.be.an('array');
      });
    });
    describe('unknown component id', () => {
      it('should fail with a clear error and no stack trace', () => {
        const func = () => helper.command.runCmd('bit debug-load no/such-component');
        expect(func).to.throw('unable to find "no/such-component" in the workspace');
      });
    });
  });
});
