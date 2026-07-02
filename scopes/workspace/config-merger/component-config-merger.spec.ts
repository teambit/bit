import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { Logger } from '@teambit/logger';
import { ComponentConfigMerger } from './component-config-merger';

const noopLogger = { debug() {}, trace() {} } as unknown as Logger;

describe('ComponentConfigMerger', () => {
  describe('env changed on "other" while the current env is a workspace component', () => {
    // Reproduces the `bit ci pr` config-sync failure: the lane still uses a workspace env (so
    // envStrategy bails out with "keep the current env"), and main migrated the component onto a
    // different EXTERNAL env. The generic aspect merge must NOT copy main's `teambit.envs/envs`
    // config verbatim — that config only holds the env id without its version, so leaking it would
    // produce an unversioned external env and crash the snap with ExternalEnvWithoutVersion.
    let mergedConfig: Record<string, any>;
    before(() => {
      const wsEnv = 'my-scope.envs/ws-env';
      const extEnv = 'other-scope.envs/ext-env';
      // current & base: component uses the workspace env `wsEnv`.
      const current = ExtensionDataList.fromConfigObject({
        [EnvsAspect.id]: { env: wsEnv },
        [`${wsEnv}@0.0.1`]: {},
      });
      const base = ExtensionDataList.fromConfigObject({
        [EnvsAspect.id]: { env: wsEnv },
        [`${wsEnv}@0.0.1`]: {},
      });
      // other (main): component migrated onto the external env `extEnv`. As stored in a committed
      // version, `teambit.envs/envs.config.env` carries the id WITHOUT a version; the version lives
      // only in the separate env-aspect entry.
      const other = ExtensionDataList.fromConfigObject({
        [EnvsAspect.id]: { env: extEnv },
        [`${extEnv}@1.0.0`]: {},
      });
      // `wsEnv` is part of the workspace — this is what makes envStrategy decline.
      const workspaceIds = [ComponentID.fromString(`${wsEnv}@0.0.1`)];
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
      mergedConfig = merger.merge().getSuccessfullyMergedConfig();
    });
    it('should NOT sync teambit.envs/envs from the generic aspect merge (no unversioned env leak)', () => {
      expect(
        mergedConfig[EnvsAspect.id],
        `expected no env to be synced, got: ${JSON.stringify(mergedConfig[EnvsAspect.id])}`
      ).to.be.undefined;
    });
  });
});
