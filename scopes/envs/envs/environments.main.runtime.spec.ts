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
    // the env landing in "failed to load envs" is the observable side effect of the warning.
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

    it('should not mute a calculation running outside the scope while a scope is open', async () => {
      const envId = 'some-scope/envs/concurrent-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/concurrent-comp@1.0.0', envId);
      // the scope stays open until the next macrotask, so calculateEnv below runs while it's open
      const openScope = envs.skipNotLoadedWarnings(() => new Promise<void>((resolve) => setImmediate(resolve)));
      envs.calculateEnv(component);
      await openScope;
      expect(envs.getFailedToLoadEnvs()).to.include(envId);
    });

    it('should stop muting once the scope ends, including when it throws', async () => {
      const envId = 'some-scope/envs/after-throw-env@1.0.0';
      const component = mockComponentWithUnregisteredEnv('some-scope/comps/after-throw-comp@1.0.0', envId);
      try {
        await envs.skipNotLoadedWarnings(async () => {
          throw new Error('some error');
        });
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('some error');
      }
      envs.calculateEnv(component);
      expect(envs.getFailedToLoadEnvs()).to.include(envId);
    });
  });
});
