import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { DeprecationMain } from './deprecation.main.runtime';
import { DeprecationAspect } from './deprecation.aspect';

/**
 * "bit reset" on components with config in the .bitmap file (deprecation). it lives here and not in the snapping
 * aspect, since the snapping aspect must not depend on the deprecation aspect.
 */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, DeprecationAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  return {
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    deprecation: harmony.get<DeprecationMain>(DeprecationAspect.id),
    exportAll: async () => {
      const cmd = cli.getCommand('export');
      if (!cmd?.report) throw new Error('the "export" command is not registered');
      await cmd.report([[]] as any, {});
    },
    resetAll: async () => {
      const cmd = cli.getCommand('reset');
      if (!cmd?.report) throw new Error('the "reset" command is not registered');
      await cmd.report([undefined] as any, { silent: true });
    },
  };
}

async function tag(workspacePath: string, params: { unmodified?: boolean } = {}) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.tag({ build: false, ignoreIssues: '*', ...params });
}

async function getDeprecationConfig(workspaceData: WorkspaceData, compName: string) {
  const { workspace } = await loadWorkspace(workspaceData.workspacePath);
  const component = await workspace.get(ComponentID.fromString(`${workspaceData.remoteScopeName}/${compName}`));
  return component.state.aspects.get(DeprecationAspect.id)?.config as Record<string, any> | undefined;
}

describe('bit reset command on components with config in the .bitmap file', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    await mockComponents(workspacePath, { numOfComponents: 2 });
    await tag(workspacePath);
    const { deprecation } = await loadWorkspace(workspacePath);
    await deprecation.deprecate(ComponentID.fromString(`${workspaceData.remoteScopeName}/comp1`));
    await tag(workspacePath);
    const config = await getDeprecationConfig(workspaceData, 'comp1');
    expect(config?.deprecate).to.be.true; // intermediate step.
    const { resetAll } = await loadWorkspace(workspacePath);
    await resetAll();
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });
  it('bit reset should leave the config as they were before the tag', async () => {
    const config = await getDeprecationConfig(workspaceData, 'comp1');
    expect(config?.deprecate).to.be.true;
  });
  it('bit export should remove the entries form the staged-config file', async () => {
    await tag(workspaceData.workspacePath, { unmodified: true });
    await (await loadWorkspace(workspaceData.workspacePath)).exportAll();
    const stagedConfigPath = path.join(workspaceData.workspacePath, '.bit', 'staged-config', 'main.json');
    const stagedConfig = await fs.readJSON(stagedConfigPath);
    expect(stagedConfig).to.have.lengthOf(0);
  });
});
