import { expect } from 'chai';
import { PACK_LIFECYCLE_SCRIPTS, packageJsonRequiresInstallation } from './package-json-requires-installation';
import { PackTask } from './pack.task';
import { PublishTask } from './publish.task';

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
const componentsWith = (pkgJsonSources: PkgJsonSources) => [
  componentWithPkgJson(),
  componentWithPkgJson(pkgJsonSources),
];

describe('packageJsonRequiresInstallation', () => {
  const requiresInstallation = (pkgJsonSources: PkgJsonSources) =>
    packageJsonRequiresInstallation(componentsWith(pkgJsonSources), PKG_ASPECT_ID, PACK_LIFECYCLE_SCRIPTS);
  it('does not require the installation when neither the scripts run nor dependencies are bundled', () => {
    expect(
      requiresInstallation({
        pkgConfig: { scripts: { test: 'mocha' } },
        lastBuild: { scripts: { start: 'node index.js' }, bundledDependencies: [] },
      })
    ).to.be.false;
  });
  it('requires the installation when the pkg config has a lifecycle script', () => {
    expect(requiresInstallation({ pkgConfig: { scripts: { prepack: 'tsc' } } })).to.be.true;
  });
  it('requires the installation when the component overrides have a lifecycle script', () => {
    expect(requiresInstallation({ overrides: { scripts: { prepare: 'tsc' } } })).to.be.true;
  });
  it('requires the installation when the package.json of the last build has a lifecycle script', () => {
    expect(requiresInstallation({ lastBuild: { scripts: { postpack: 'node clean.js' } } })).to.be.true;
  });
  it('requires the installation when the package.json bundles dependencies', () => {
    expect(requiresInstallation({ lastBuild: { bundledDependencies: ['lodash'] } })).to.be.true;
    expect(requiresInstallation({ pkgConfig: { bundleDependencies: true } })).to.be.true;
  });
});

describe('PackTask and PublishTask requiresCapsuleInstallation', () => {
  const packTask = new PackTask(PKG_ASPECT_ID, undefined as any, undefined as any);
  const publishTask = new PublishTask(PKG_ASPECT_ID, undefined as any, undefined as any);
  it('requires the installation for a publish lifecycle script only when publishing', () => {
    const components = componentsWith({ pkgConfig: { scripts: { prepublishOnly: 'npm test' } } });
    expect(packTask.requiresCapsuleInstallation(components)).to.be.false;
    expect(publishTask.requiresCapsuleInstallation(components)).to.be.true;
  });
  it('requires the installation for a pack lifecycle script in both tasks', () => {
    const components = componentsWith({ pkgConfig: { scripts: { prepack: 'tsc' } } });
    expect(packTask.requiresCapsuleInstallation(components)).to.be.true;
    expect(publishTask.requiresCapsuleInstallation(components)).to.be.true;
  });
});
