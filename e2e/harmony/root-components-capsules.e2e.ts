import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)('root components for scope aspect capsules', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(async () => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
    npmCiRegistry.configureCiInPackageJsonHarmony();
    helper.fixtures.createAspect('dep-dep-aspect');
    helper.fixtures.createAspect('dep-aspect');
    helper.fixtures.createAspect('main-aspect');
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/dep-aspect/dep-aspect.main.runtime.ts`,
      getDepAspect(helper.scopes.remoteWithoutOwner)
    );
    helper.fs.outputFile(
      `${helper.scopes.remoteWithoutOwner}/main-aspect/main-aspect.main.runtime.ts`,
      getMainAspect(helper.scopes.remoteWithoutOwner)
    );
    helper.extensions.addExtensionToVariant('*', 'teambit.harmony/aspect');
    helper.extensions.addExtensionToVariant(
      '{**/dep-dep-aspect},{**/dep-aspect}',
      'teambit.dependencies/dependency-resolver',
      {
        policy: {
          peerDependencies: {
            react: '16 || 17',
          },
        },
      }
    );
    helper.extensions.addExtensionToVariant('{**/main-aspect}', 'teambit.dependencies/dependency-resolver', {
      policy: {
        peerDependencies: {
          react: '16',
        },
      },
    });
    helper.command.install('react@16.6.3');
    helper.command.tagAllComponents();
    helper.command.export();

    helper.extensions.addExtensionToVariant('{**/main-aspect}', 'teambit.dependencies/dependency-resolver', {
      policy: {
        peerDependencies: {
          react: '17',
        },
      },
    });
    helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/dep-aspect/new-file.ts`, '');
    helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/main-aspect/new-file.ts`, '');
    helper.command.install('react@17.0.2');
    helper.command.tagAllComponents();
    helper.command.export();

    helper.scopeHelper.reInitWorkspace({
      yarnRCConfig: {
        unsafeHttpWhitelist: ['localhost'],
      },
    });
    helper.scopeHelper.addRemoteScope();
    helper.workspaceJsonc.setupDefault();
  });
  describe('using pnpm', () => {
    let scopeAspectsCapsulesRootDir!: string;
    before(() => {
      helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/main-aspect@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/main-aspect@0.0.2`);
      helper.capsules.removeScopeAspectCapsules();
      helper.command.status(); // populate capsules.
      scopeAspectsCapsulesRootDir = helper.command.capsuleListParsed().scopeAspectsCapsulesRootDir;
    });
    it('should install components with the right peer dependencies', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.1`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^19\./);
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_main-aspect@0.0.2`), [
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-aspect`,
            `@ci/${helper.scopes.remote.replace(/^ci\./, '')}.dep-dep-aspect`,
            'react/package.json',
          ])
        ).version
      ).to.match(/^19\./);
    });
  });
  after(() => {
    npmCiRegistry.destroy();
  });
});

function getMainAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
  import { DepAspectAspect, DepAspectMain } from '@ci/${remoteScope}.dep-aspect';
  import React from 'react';
  import { MainAspectAspect } from './main-aspect.aspect';

  export class MainAspectMain {
    static slots = [];
    static dependencies = [DepAspectAspect];
    static runtime = MainRuntime;
    static async provider([depAspect]: [DepAspectMain]) {
      if (!depAspect) {
        throw new Error('unable to load the depAspect');
      }
      return new MainAspectMain();
    }
  }

  MainAspectAspect.addRuntime(MainAspectMain);
  `;
}

function getDepAspect(remoteScope: string) {
  return `import { MainRuntime } from '@teambit/cli';
import { DepDepAspectAspect, DepDepAspectMain } from '@ci/${remoteScope}.dep-dep-aspect';
import React from 'react';
import { DepAspectAspect } from './dep-aspect.aspect';

export class DepAspectMain {
  static slots = [];
  static dependencies = [DepDepAspectAspect];
  static runtime = MainRuntime;
  static async provider([depDepAspect]: [DepDepAspectMain]) {
    if (!depDepAspect) {
      throw new Error('unable to load the depDepAspect');
    }
    return new DepAspectMain();
  }
}

DepAspectAspect.addRuntime(DepAspectMain);
`;
}
