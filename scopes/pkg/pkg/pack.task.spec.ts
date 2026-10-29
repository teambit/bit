import { expect } from 'chai';
import { PackTask } from './pack.task';

const PKG_ASPECT_ID = 'teambit.pkg/pkg';
const BUILDER_ASPECT_ID = 'teambit.pipelines/builder';

type PkgJsonSources = {
  pkgConfig?: Record<string, any>;
  overrides?: Record<string, any>;
  lastBuild?: Record<string, any>;
};
const componentWithPkgJson = ({ pkgConfig, overrides, lastBuild }: PkgJsonSources = {}) =>
  ({
    state: {
      aspects: {
        get: (id: string) => (id === PKG_ASPECT_ID ? { data: { packageJsonModification: pkgConfig } } : undefined),
      },
      _consumer: {
        overrides: { componentOverridesPackageJsonData: overrides },
        extensions: {
          findExtension: (id: string) =>
            id === BUILDER_ASPECT_ID
              ? { data: { aspectsData: [{ aspectId: PKG_ASPECT_ID, data: { pkgJson: lastBuild } }] } }
              : undefined,
        },
      },
    },
  }) as any;

describe('PackTask', () => {
  describe('requiresCapsuleInstallation', () => {
    const packTask = new PackTask(PKG_ASPECT_ID, undefined as any, undefined as any);
    const requiresInstallation = (pkgJsonSources: PkgJsonSources) =>
      packTask.requiresCapsuleInstallation([componentWithPkgJson(), componentWithPkgJson(pkgJsonSources)]);
    it('does not require the installation when packing neither runs scripts nor bundles dependencies', () => {
      expect(
        requiresInstallation({
          pkgConfig: { scripts: { test: 'mocha' } },
          lastBuild: { scripts: { start: 'node index.js' }, bundledDependencies: [] },
        })
      ).to.be.false;
    });
    it('requires the installation when the pkg config has a pack lifecycle script', () => {
      expect(requiresInstallation({ pkgConfig: { scripts: { prepack: 'tsc' } } })).to.be.true;
    });
    it('requires the installation when the component overrides have a pack lifecycle script', () => {
      expect(requiresInstallation({ overrides: { scripts: { prepare: 'tsc' } } })).to.be.true;
    });
    it('requires the installation when the package.json of the last build has a pack lifecycle script', () => {
      expect(requiresInstallation({ lastBuild: { scripts: { postpack: 'node clean.js' } } })).to.be.true;
    });
    it('requires the installation when the package.json bundles dependencies', () => {
      expect(requiresInstallation({ lastBuild: { bundledDependencies: ['lodash'] } })).to.be.true;
      expect(requiresInstallation({ pkgConfig: { bundleDependencies: true } })).to.be.true;
    });
  });
});
