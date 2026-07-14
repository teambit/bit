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

  // Regression for the reverse case: when the seeder is NOT part of a cycle, a cycle that exists
  // purely among its dependencies (published tags) must stay out of the isolation and be installed
  // as packages from the registry. Pulling such a dependency-only cycle in needlessly isolates
  // components we don't build here and force-loads each one's env — which fails `bit build`/`bit sign`
  // when a dependency carries an old/deprecated env that can't be loaded. Only cyclic deps the
  // registry can't serve (unpublished snaps, or cycles that include a seeder) should be isolated.
  describe('a dependency-only cycle, seeder not part of the cycle, isolated seeders-only', () => {
    let capsuleIds: string[];
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // comp1 <-> comp2 form a cycle among the dependencies. comp3 (the seeder) depends on comp1 but
      // is not itself part of the cycle.
      helper.fs.outputFile('comp1/index.js', `require('@${helper.scopes.remote}/comp2');`);
      helper.fs.outputFile('comp2/index.js', `require('@${helper.scopes.remote}/comp1');`);
      helper.fs.outputFile('comp3/index.js', `require('@${helper.scopes.remote}/comp1');`);
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.addComponent('comp3');
      helper.command.install();
      helper.command.tagAllWithoutBuild('--ignore-issues="CircularDependencies"');
      const output = helper.command.runCmd('bit capsule create comp3 --seeders-only -j');
      capsuleIds = JSON.parse(output).map((capsule: { id: string }) => capsule.id.split('@')[0]);
    });
    it('should isolate only the seeder, not the dependency-only cycle members', () => {
      expect(capsuleIds).to.include(`${helper.scopes.remote}/comp3`);
      expect(capsuleIds).to.not.include(`${helper.scopes.remote}/comp1`);
      expect(capsuleIds).to.not.include(`${helper.scopes.remote}/comp2`);
    });
  });

  // Regression for the Ripple failure that persisted after the seeders-only fix above: it happens
  // in the ASPECT-loading isolation path, not the sign path. A custom env built on a lane together
  // with a component it cycles with (the env's mounter imports the component; the component uses
  // the env) is loaded from the scope by isolating it with `seedersOnly: true` + `context.aspects`.
  // The cyclic dependency's snap-version was never published, so installing it as a registry
  // package fails (`ERR_PNPM_NO_MATCHING_VERSION`). The isolator must pull the snap-versioned
  // cyclic dep into the aspect isolation as a capsule instead.
  describe('env in a cycle with a component, loaded from scope (aspect isolation)', () => {
    let snapFromScopeError: Error | undefined;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomNewEnv('react-based-env');
      const envId = `${helper.scopes.remote}/${envName}`;

      // a "theme" component used by the env's mounter -> creates an env -> theme edge.
      helper.fixtures.populateComponents(1, false);
      helper.command.rename('comp1', 'theme');
      helper.fs.outputFile(
        'theme/index.tsx',
        `import React from 'react';
export const MyTheme = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;`
      );
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
      // the theme uses the custom env -> creates the theme -> env edge, closing the cycle.
      helper.command.setEnv('theme', envId);

      // snap both on a lane and export. The snaps are never published to the registry.
      helper.command.compile();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild(
        '--ignore-issues "CircularDependencies,MissingPackagesDependenciesOnFs"'
      );
      helper.command.export();

      // snap-from-scope on a bare scope forces the env to be loaded from the scope, which isolates
      // it via the aspect path. Without the fix this fetches the unpublished cyclic snap from the
      // registry and throws; with the fix the snap-versioned cyclic dep is isolated as a capsule.
      const bareScope = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      try {
        await helper.snapping.snapFromScope(
          bareScope.scopePath,
          [{ componentId: `${helper.scopes.remote}/theme`, message: 'snap from scope' }],
          { lane: `${helper.scopes.remote}/dev` }
        );
      } catch (err) {
        snapFromScopeError = err as Error;
      }
    });
    it('should isolate the cyclic snap dependency as a capsule instead of fetching it from the registry', () => {
      expect(snapFromScopeError, snapFromScopeError?.message).to.be.undefined;
    });
  });
});
