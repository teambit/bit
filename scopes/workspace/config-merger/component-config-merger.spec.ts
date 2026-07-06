import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import type { Logger } from '@teambit/logger';
import { ComponentConfigMerger } from './component-config-merger';

const noopLogger = { debug() {}, trace() {} } as unknown as Logger;

// A core-style teambit.envs/envs entry (matched by `name`, so it works without the runtime
// core-extensions registry being populated — as is the case in an isolated component test).
const envsEntry = (env: string) => new ExtensionDataEntry(undefined, undefined, EnvsAspect.id, { env }, {});
// The separate env-aspect entry that carries the resolved version (`id@version`). As stored in a committed
// version, teambit.envs/envs.config.env holds the id WITHOUT a version; the version lives only here.
const envAspectEntry = (idWithVersion: string) =>
  new ExtensionDataEntry(undefined, ComponentID.fromString(idWithVersion), undefined, {}, {});

function mergeEnvConfig(
  current: ExtensionDataList,
  base: ExtensionDataList,
  other: ExtensionDataList,
  workspaceIds: ComponentID[]
) {
  const merger = new ComponentConfigMerger(
    'my-scope/some-comp',
    workspaceIds,
    undefined,
    current,
    base,
    other,
    'lane',
    'main',
    noopLogger,
    'ours'
  );
  return merger.merge().getSuccessfullyMergedConfig();
}

describe('ComponentConfigMerger', () => {
  // teambit.envs/envs is a core extension at full runtime (registered by the core aspects). Register it here
  // so the merger behaves the same inside an isolated component test, and restore the prior state afterwards
  // so we don't leak into the shared static map (which would make other tests order-dependent).
  let hadEnvsCoreName: boolean;
  before(() => {
    hadEnvsCoreName = ExtensionDataList.coreExtensionsNames.has(EnvsAspect.id);
    ExtensionDataList.coreExtensionsNames.set(EnvsAspect.id, '');
  });
  after(() => {
    if (!hadEnvsCoreName) ExtensionDataList.coreExtensionsNames.delete(EnvsAspect.id);
  });

  describe('env migrated on "other" (main) while the current lane kept the old env', () => {
    // Reproduces the `bit ci pr` config-sync scenario: the PR lane never touched its env (base === current)
    // and main migrated the component onto a different EXTERNAL env. The change should propagate from main,
    // and critically must carry the version — syncing teambit.envs/envs.config.env alone (id without version)
    // would produce an unversioned external env and crash the snap with ExternalEnvWithoutVersion.
    let mergedConfig: Record<string, any>;
    before(() => {
      const oldEnv = 'my-scope.envs/ws-env'; // the env the lane keeps; it's also a workspace component.
      const newEnv = 'other-scope.envs/ext-env'; // the external env main migrated to.
      // base === current: the lane didn't change its env.
      const base = new ExtensionDataList(envsEntry(oldEnv), envAspectEntry(`${oldEnv}@0.0.1`));
      const current = new ExtensionDataList(envsEntry(oldEnv), envAspectEntry(`${oldEnv}@0.0.1`));
      const other = new ExtensionDataList(envsEntry(newEnv), envAspectEntry(`${newEnv}@1.0.0`));
      // `oldEnv` is a workspace component — this used to make envStrategy keep it instead of propagating.
      const workspaceIds = [ComponentID.fromString(`${oldEnv}@0.0.1`)];
      mergedConfig = mergeEnvConfig(current, base, other, workspaceIds);
    });
    it('should sync the env from main WITH its version (no unversioned env leak)', () => {
      expect(mergedConfig[EnvsAspect.id]).to.deep.equal({ env: 'other-scope.envs/ext-env@1.0.0' });
    });
  });

  describe('current lane deliberately switched to a workspace env', () => {
    // The lane changed its env (base !== current) to a workspace component. That's a deliberate choice for
    // this lane, so a differing env on "other" must NOT override it.
    let mergedConfig: Record<string, any>;
    before(() => {
      const baseEnv = 'other-scope.envs/orig-env';
      const laneEnv = 'my-scope.envs/ws-env'; // the lane switched to this workspace env.
      const otherEnv = 'other-scope.envs/ext-env';
      const base = new ExtensionDataList(envsEntry(baseEnv), envAspectEntry(`${baseEnv}@0.9.0`));
      const current = new ExtensionDataList(envsEntry(laneEnv), envAspectEntry(`${laneEnv}@0.0.1`));
      const other = new ExtensionDataList(envsEntry(otherEnv), envAspectEntry(`${otherEnv}@1.0.0`));
      const workspaceIds = [ComponentID.fromString(`${laneEnv}@0.0.1`)];
      mergedConfig = mergeEnvConfig(current, base, other, workspaceIds);
    });
    it('should keep the lane env and not sync teambit.envs/envs from "other"', () => {
      expect(mergedConfig[EnvsAspect.id]).to.be.undefined;
    });
  });
});
