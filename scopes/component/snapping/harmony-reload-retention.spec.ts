import { expect } from 'chai';
import v8 from 'v8';
import vm from 'vm';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * a process that loads harmony more than once (specs, "bit new", "bit create --aspect") must be able to free the
 * previous instances. process-wide state that keeps one alive, such as a registry that adds an entry per load or a
 * cached legacy object that points back to the workspace, keeps every instance in memory. this flow (tag and export)
 * goes through most of the registries that the aspects write to.
 */
describe('loading harmony more than once in a process', function () {
  this.timeout(0);

  v8.setFlagsFromString('--expose-gc');
  const gc: () => void = vm.runInNewContext('gc');

  async function collectGarbage() {
    // a WeakRef keeps its target alive until the end of the current job, so let each job end before collecting
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      gc();
    }
  }

  async function loadTagAndExport(): Promise<WeakRef<object>> {
    const workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    try {
      await mockComponents(workspacePath);
      const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], workspacePath);
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, version: '0.0.1' });
      await harmony.get<ExportMain>(ExportAspect.id).export();
      return new WeakRef(harmony);
    } finally {
      await destroyWorkspace(workspaceData);
    }
  }

  it('should keep no more than the latest harmony instance in memory', async () => {
    const instances: WeakRef<object>[] = [];
    for (let i = 0; i < 3; i += 1) {
      instances.push(await loadTagAndExport());
    }
    await collectGarbage();
    const alive = instances.filter((instance) => instance.deref()).length;
    expect(alive).to.be.at.most(1);
  });
});
