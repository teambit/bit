import { expect } from 'chai';
import sinon from 'sinon';
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

/**
 * an env component with the given env.jsonc and no resolved env.jsonc stored, so it's calculated on load.
 */
function mockEnvComponent(envId: string, envJsonc: string, dependencies: Array<{ id: ComponentID }> = []): Component {
  return {
    id: ComponentID.fromString(envId),
    state: {
      aspects: { get: (aspectId: string) => (aspectId === EnvsAspect.id ? { data: {} } : undefined) },
      _consumer: { dependencies: { dependencies } },
    },
    filesystem: { files: [{ relative: 'env.jsonc', contents: Buffer.from(envJsonc) }] },
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

  describe('an env.jsonc that "extends" another env, with no resolver registered (e.g. in a bare scope)', () => {
    const parentId = 'some-scope/envs/parent-env';
    const parentEnv = mockEnvComponent(`${parentId}@1.0.0`, '{ "policy": {} }');
    let getEnvComponentStub: sinon.SinonStub;
    let result: Record<string, any>;
    before(async () => {
      sinon.stub(envs, 'getAllRegisteredEnvJsoncResolvers').returns([]);
      getEnvComponentStub = sinon.stub(envs, 'getEnvComponentByEnvId').resolves(parentEnv);
      // the extending env depends on the parent env, which determines the version to load
      result = await envs.recursivelyMergeWithParentManifest({ extends: parentId }, [{ id: parentEnv.id }] as any);
    });
    after(() => sinon.restore());
    it('should load the parent env from the component host, in the version the extending env depends on', () => {
      expect(getEnvComponentStub.calledOnceWithExactly(`${parentId}@1.0.0`)).to.be.true;
    });
    it('should merge the parent manifest and drop the "extends"', () => {
      expect(result).to.not.have.property('extends');
    });
  });

  describe('a parent env that "extends" an env whose pinned version cannot be loaded, with no resolver registered', () => {
    const parentId = 'some-scope/envs/parent-env';
    const grandparentId = 'some-scope/envs/grandparent-env';
    const parentEnv = mockEnvComponent(`${parentId}@1.0.0`, `{ "extends": "${grandparentId}" }`, [
      { id: ComponentID.fromString(`${grandparentId}@1.0.0`) },
    ]);
    before(() => {
      sinon.stub(envs, 'getAllRegisteredEnvJsoncResolvers').returns([]);
      const getEnvComponentStub = sinon.stub(envs, 'getEnvComponentByEnvId');
      getEnvComponentStub.withArgs(`${parentId}@1.0.0`).resolves(parentEnv);
      getEnvComponentStub.withArgs(`${grandparentId}@1.0.0`).rejects(new Error('version 1.0.0 not found'));
      getEnvComponentStub
        .withArgs(grandparentId)
        .resolves(mockEnvComponent(`${grandparentId}@2.0.0`, '{ "policy": {} }'));
    });
    after(() => sinon.restore());
    it('should fail rather than load another version of that env', async () => {
      try {
        await envs.recursivelyMergeWithParentManifest({ extends: parentId }, [{ id: parentEnv.id }] as any);
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('version 1.0.0 not found');
      }
    });
  });
});
