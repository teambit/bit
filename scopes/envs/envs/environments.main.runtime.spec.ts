import { expect } from 'chai';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { ComponentID } from '@teambit/component-id';
import type { Component } from '@teambit/component';
import type { EnvsMain } from './environments.main.runtime';
import { EnvsAspect } from './environments.aspect';

/**
 * a component configured with an env that is not registered in the envs slot. that's the state
 * that makes `calculateEnv` consider warning "env was not loaded (run bit install)".
 */
function mockComponentWithUnregisteredEnv(componentId: string, envId: string): Component {
  return {
    id: ComponentID.fromString(componentId),
    state: {
      aspects: {
        get: (aspectId: string) => (aspectId === EnvsAspect.id ? { config: { env: envId } } : undefined),
        entries: [{ id: ComponentID.fromString(envId) }],
      },
    },
  } as unknown as Component;
}

describe('EnvsMain', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let envs: EnvsMain;
  before(async () => {
    workspaceData = mockWorkspace();
    envs = await loadAspect(EnvsAspect, workspaceData.workspacePath);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  describe('skipNotLoadedWarnings', () => {
    // an env that is merely absent from the slot is not necessarily broken - it may simply not have
    // been scheduled for loading, which is the case whenever only a subset of the workspace is
    // loaded (e.g. "bit show <comp>" loads <comp>'s env, but not that env's own env). warning there
    // is a false positive, so the loader mutes it for components it pulled in rather than was asked
    // for. the env landing in "failed to load envs" is the observable side effect of the warning.
    it('should not report the env as failed-to-load when muted', async () => {
      const envId = 'some-scope/envs/muted-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/muted-comp@1.0.0', envId);
      await envs.skipNotLoadedWarnings(async () => {
        envs.calculateEnv(component);
      });
      expect(envs.getFailedToLoadEnvs()).to.not.include(envId);
    });

    it('should report the env as failed-to-load when not muted', async () => {
      const envId = 'some-scope/envs/reported-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/reported-comp@1.0.0', envId);
      envs.calculateEnv(component);
      expect(envs.getFailedToLoadEnvs()).to.include(envId);
    });

    // component loads run concurrently (the graphql resolver fans ids out with Promise.all), so the
    // muting must follow the async execution of the wrapped callback and nothing else. a shared flag
    // would let a muted load hide a genuinely missing env of a component loaded next to it.
    it('should not mute a calculation running outside the scope while a scope is open', async () => {
      const envId = 'some-scope/envs/concurrent-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/concurrent-comp@1.0.0', envId);
      let closeScope = () => {};
      const openScope = envs.skipNotLoadedWarnings(
        () =>
          new Promise<void>((resolve) => {
            closeScope = resolve;
          })
      );
      envs.calculateEnv(component);
      closeScope();
      await openScope;
      expect(envs.getFailedToLoadEnvs()).to.include(envId);
    });

    it('should stop muting once the scope ends, including when it throws', async () => {
      const envId = 'some-scope/envs/after-throw-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/after-throw-comp@1.0.0', envId);
      let thrown: Error | undefined;
      try {
        await envs.skipNotLoadedWarnings(async () => {
          throw new Error('some error');
        });
      } catch (err: any) {
        thrown = err;
      }
      expect(thrown?.message).to.equal('some error');
      envs.calculateEnv(component);
      expect(envs.getFailedToLoadEnvs()).to.include(envId);
    });
  });
});
