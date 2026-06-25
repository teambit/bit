import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('isolating cyclic dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  // Regression for the Ripple circular-dependency build failure. Seeders-only isolation (used by
  // `bit sign` and tag/snap-from-scope) installs non-seeder dependencies as packages from the
  // registry. A dependency that is in a cycle with a seeder can't be installed that way — its
  // snap-version isn't published — so the isolator must pull it into the isolation as a capsule.
  describe('two components requiring each other, isolated seeders-only', () => {
    let capsuleIds: string[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('comp1/index.js', `require('@${helper.scopes.remote}/comp2');`);
      helper.fs.outputFile('comp2/index.js', `require('@${helper.scopes.remote}/comp1');`);
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.install();
      helper.command.tagAllWithoutBuild('--ignore-issues="CircularDependencies"');
      const output = helper.command.runCmd('bit capsule create comp2 --seeders-only -j');
      capsuleIds = JSON.parse(output).map((capsule: { id: string }) => capsule.id.split('@')[0]);
    });
    it('should isolate the cyclic dependency as a capsule, not only the seeder', () => {
      expect(capsuleIds).to.include(`${helper.scopes.remote}/comp1`);
      expect(capsuleIds).to.include(`${helper.scopes.remote}/comp2`);
    });
  });
});
