import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('surfacing swallowed load errors as component issues', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('an aspect that throws on require, configured on a component', () => {
    let statusJson;
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.copyFixtureExtensions('non-requireable-aspect');
      helper.command.addComponent('non-requireable-aspect');
      helper.extensions.addExtensionToVariant('non-requireable-aspect', 'teambit.harmony/aspect');
      helper.fixtures.populateComponents(1, false);
      helper.extensions.addExtensionToVariant('comp1', 'my-scope/non-requireable-aspect');
      helper.command.install();
      helper.command.compile();
      statusJson = helper.command.statusJson();
    });
    it('bit status should complete without throwing', () => {
      expect(statusJson).to.have.property('newComponents');
    });
    it('the failing aspect component itself should have a LoadFailures issue', () => {
      const componentsWithIssues = statusJson.componentsWithIssues || [];
      const aspectComp = componentsWithIssues.find((comp) => comp.id.includes('non-requireable-aspect'));
      expect(aspectComp, 'the failing aspect should be listed with issues').to.not.be.undefined;
      const loadFailureIssue = aspectComp.issues.find((issue) => issue.type === 'LoadFailures');
      expect(loadFailureIssue, 'the failing aspect should have a LoadFailures issue').to.not.be.undefined;
    });
    it('components using the failing aspect should NOT each carry the issue (avoid noise)', () => {
      const componentsWithIssues = statusJson.componentsWithIssues || [];
      const comp1 = componentsWithIssues.find((comp) => comp.id.includes('comp1'));
      const comp1LoadFailures = comp1?.issues.find((issue) => issue.type === 'LoadFailures');
      expect(comp1LoadFailures).to.be.undefined;
    });
    it('instead, a single workspace-level issue should aggregate the affected components', () => {
      const workspaceIssues = statusJson.workspaceIssues || [];
      const aggregated = workspaceIssues.find((issue) => issue.includes('non-requireable-aspect'));
      expect(aggregated, 'a workspace issue naming the failing aspect should exist').to.not.be.undefined;
      expect(aggregated).to.have.string('error by purpose');
      expect(aggregated).to.have.string('affects 1 component');
    });
    it('the LoadFailures issue should not block tagging', () => {
      // tag must not require --ignore-issues for the LoadFailures issue. tagging without build
      // because the issue-blocking check happens before the build pipeline anyway.
      const output = helper.command.tagAllWithoutBuild();
      expect(output).to.have.string('component(s) tagged');
    });
  });
});
