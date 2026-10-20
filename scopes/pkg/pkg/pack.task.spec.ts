import { expect } from 'chai';
import { PackTask } from './pack.task';

const PKG_ASPECT_ID = 'teambit.pkg/pkg';
const BUILDER_ASPECT_ID = 'teambit.pipelines/builder';

type ScriptsSources = {
  pkgConfig?: Record<string, string>;
  overrides?: Record<string, string>;
  lastBuild?: Record<string, string>;
};
const componentWithScripts = ({ pkgConfig, overrides, lastBuild }: ScriptsSources = {}) =>
  ({
    state: {
      aspects: {
        get: (id: string) =>
          id === PKG_ASPECT_ID ? { data: { packageJsonModification: { scripts: pkgConfig } } } : undefined,
      },
      _consumer: {
        overrides: { componentOverridesPackageJsonData: { scripts: overrides } },
        extensions: {
          findExtension: (id: string) =>
            id === BUILDER_ASPECT_ID
              ? { data: { aspectsData: [{ aspectId: PKG_ASPECT_ID, data: { pkgJson: { scripts: lastBuild } } }] } }
              : undefined,
        },
      },
    },
  }) as any;

describe('PackTask', () => {
  describe('requiresCapsuleInstallation', () => {
    const packTask = new PackTask(PKG_ASPECT_ID, undefined as any, undefined as any);
    const requiresInstallation = (scriptsSources: ScriptsSources) =>
      packTask.requiresCapsuleInstallation([componentWithScripts(), componentWithScripts(scriptsSources)]);
    it('does not require the installation when the package.json has no pack lifecycle scripts', () => {
      expect(requiresInstallation({ pkgConfig: { test: 'mocha' }, lastBuild: { start: 'node index.js' } })).to.be.false;
    });
    it('requires the installation when the pkg config has a pack lifecycle script', () => {
      expect(requiresInstallation({ pkgConfig: { prepack: 'tsc' } })).to.be.true;
    });
    it('requires the installation when the component overrides have a pack lifecycle script', () => {
      expect(requiresInstallation({ overrides: { prepare: 'tsc' } })).to.be.true;
    });
    it('requires the installation when the package.json of the last build has a pack lifecycle script', () => {
      expect(requiresInstallation({ lastBuild: { postpack: 'node clean.js' } })).to.be.true;
    });
  });
});
