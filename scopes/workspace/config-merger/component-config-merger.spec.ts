import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import type { Logger } from '@teambit/logger';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
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
  workspaceIds: ComponentID[],
  mergeStrategy: MergeStrategy = 'ours'
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
    mergeStrategy
  );
  return merger.merge().getSuccessfullyMergedConfig();
}

describe('ComponentConfigMerger', () => {
  // teambit.envs/envs is a core extension at full runtime (registered by the core aspects). Register it here
  // so the merger behaves the same inside an isolated component test, and restore the prior state afterwards
  // so we don't leak into the shared static map (which would make other tests order-dependent).
  let prevEnvsCoreName: string | undefined;
  before(() => {
    prevEnvsCoreName = ExtensionDataList.coreExtensionsNames.get(EnvsAspect.id);
    ExtensionDataList.coreExtensionsNames.set(EnvsAspect.id, '');
  });
  after(() => {
    if (prevEnvsCoreName === undefined) ExtensionDataList.coreExtensionsNames.delete(EnvsAspect.id);
    else ExtensionDataList.coreExtensionsNames.set(EnvsAspect.id, prevEnvsCoreName);
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

  describe('base env version is unknown (base env-aspect entry absent)', () => {
    // base and current share the env id, but base's version is unknown (its env-aspect entry is missing).
    // that must NOT be treated as "the current lane changed its env" — otherwise the keep-workspace-env
    // short-circuit would fire and silently swallow the env change made on "other". Instead the normal
    // 3-way merge applies; with 'theirs' it takes the other lane's env (with its version).
    let mergedConfig: Record<string, any>;
    before(() => {
      const env = 'my-scope.envs/ws-env'; // same env id on base & current; also a workspace component.
      const otherEnv = 'other-scope.envs/ext-env';
      // base carries the env id but NO env-aspect entry -> its version resolves to undefined (unknown).
      const base = new ExtensionDataList(envsEntry(env));
      const current = new ExtensionDataList(envsEntry(env), envAspectEntry(`${env}@0.0.1`));
      const other = new ExtensionDataList(envsEntry(otherEnv), envAspectEntry(`${otherEnv}@1.0.0`));
      const workspaceIds = [ComponentID.fromString(`${env}@0.0.1`)];
      mergedConfig = mergeEnvConfig(current, base, other, workspaceIds, 'theirs');
    });
    it('should not short-circuit on the workspace env; the merge strategy decides (takes other)', () => {
      expect(mergedConfig[EnvsAspect.id]).to.deep.equal({ env: 'other-scope.envs/ext-env@1.0.0' });
    });
  });

  describe('other bumped only the VERSION of the same workspace env (no id change)', () => {
    // current and other use the SAME workspace env id; only the version differs and the current lane did not
    // change it (base === current). A workspace env's version is owned by the workspace, so the other lane's
    // version must NOT be synced. (Uses 'theirs' to prove it's the keep-env short-circuit, not the strategy,
    // that prevents the sync — a plain 3-way merge with base===current would otherwise adopt other's version.)
    let mergedConfig: Record<string, any>;
    before(() => {
      const env = 'my-scope.envs/ws-env'; // workspace-component env, same id on both sides.
      const base = new ExtensionDataList(envsEntry(env), envAspectEntry(`${env}@0.0.1`));
      const current = new ExtensionDataList(envsEntry(env), envAspectEntry(`${env}@0.0.1`));
      const other = new ExtensionDataList(envsEntry(env), envAspectEntry(`${env}@0.0.2`));
      const workspaceIds = [ComponentID.fromString(`${env}@0.0.1`)];
      mergedConfig = mergeEnvConfig(current, base, other, workspaceIds, 'theirs');
    });
    it("should keep the workspace env and NOT sync the other lane's version", () => {
      expect(mergedConfig[EnvsAspect.id]).to.be.undefined;
    });
  });
});
