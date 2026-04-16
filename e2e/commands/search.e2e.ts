import { expect } from 'chai';

import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit search command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('local search with components in workspace', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentIsType();
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagWithoutBuild('utils/is-type');
    });

    it('should find a component by matching keyword', () => {
      const output = helper.command.runCmd('bit search foo --local-only');
      expect(output).to.have.string('bar/foo');
    });

    it('should not find components that do not match', () => {
      const output = helper.command.runCmd('bit search nonexistent --local-only');
      expect(output).to.have.string('no matches in workspace');
    });

    it('should match case-insensitively', () => {
      const output = helper.command.runCmd('bit search FOO --local-only');
      expect(output).to.have.string('bar/foo');
    });

    it('should find multiple components matching the query', () => {
      const output = helper.command.runCmd('bit search is --local-only');
      expect(output).to.have.string('utils/is-type');
    });

    it('should deduplicate results across multiple queries', () => {
      const output = helper.command.runCmd('bit search foo bar --local-only --json');
      const results = JSON.parse(output);
      const fooCount = results.local.filter((id: string) => id.includes('bar/foo')).length;
      expect(fooCount).to.equal(1);
    });

    it('should return json output with --json flag', () => {
      const output = helper.command.runCmd('bit search foo --local-only --json');
      const results = JSON.parse(output);
      expect(results).to.have.property('local');
      expect(results).to.have.property('remote');
      expect(results).to.have.property('perQuery');
      expect(results).to.have.property('hasWorkspace', true);
      expect(results.local).to.be.an('array');
      const match = results.local.find((id: string) => id.includes('bar/foo'));
      expect(match).to.not.be.undefined;
    });

    it('should union results from multiple queries', () => {
      const output = helper.command.runCmd('bit search foo is-type --local-only --json');
      const results = JSON.parse(output);
      expect(results.local.some((id: string) => id.includes('bar/foo'))).to.be.true;
      expect(results.local.some((id: string) => id.includes('is-type'))).to.be.true;
    });
  });

  describe('when no components in workspace', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
    });
    it('should show no matches', () => {
      const output = helper.command.runCmd('bit search anything --local-only');
      expect(output).to.have.string('no matches in workspace');
    });
  });

  describe('combined local and remote search after export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();
    });

    it('should include local results for the exported component', () => {
      const output = helper.command.runCmd('bit search foo --json');
      const results = JSON.parse(output);
      expect(results.local.some((id: string) => id.includes('bar/foo'))).to.be.true;
      expect(results.remote).to.be.an('array');
      expect(results.perQuery).to.have.lengthOf(1);
      expect(results.perQuery[0].query).to.equal('foo');
    });

    it('should show both Local and Remote sections in report output', () => {
      const output = helper.command.runCmd('bit search foo');
      expect(output).to.have.string('Local');
      expect(output).to.have.string('Remote');
    });
  });

  describe('remote-only search', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
    });

    it('should return valid json structure with --remote-only', () => {
      const output = helper.command.runCmd('bit search button --remote-only --skip-auto-owner --json');
      const results = JSON.parse(output);
      expect(results.remote).to.be.an('array');
      expect(results.local).to.be.an('array').that.is.empty;
      expect(results.hasWorkspace).to.be.true;
    });

    it('should not show Local section in report output', () => {
      const output = helper.command.runCmd('bit search button --remote-only --skip-auto-owner');
      expect(output).to.not.have.string('Local');
      expect(output).to.have.string('Remote');
    });
  });
});
