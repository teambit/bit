import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import { ComponentID } from '@teambit/component-id';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents, modifyMockedComponents } from '@teambit/component.testing.mock-components';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { CheckoutMain } from './checkout.main.runtime';
import { CheckoutAspect } from './checkout.aspect';

/**
 * "bit reset" of a component checked out to a non-head version, with a detached head. it lives here and not in the
 * snapping aspect (which owns "reset"), since the checkout aspect depends on snapping, not the other way around.
 */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect, CheckoutAspect], workspacePath);
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const runCmd = async (name: string, args: any[], flags: Record<string, any> = {}) => {
    const cmd = cli.getCommand(name);
    if (!cmd?.report) throw new Error(`the "${name}" command is not registered`);
    return cmd.report(args as any, flags);
  };
  return {
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    checkout: harmony.get<CheckoutMain>(CheckoutAspect.id),
    exportAll: () => runCmd('export', [[]]),
    resetAll: () => runCmd('reset', [undefined], { silent: true }),
  };
}

describe('bit reset when checked out to a non-head version with detach-head functionality', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let compId: ComponentID;
  const getModelComponent = async () => {
    const { workspace } = await loadWorkspace(workspaceData.workspacePath);
    return workspace.consumer.scope.getModelComponent(compId);
  };
  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath, remoteScopeName } = workspaceData;
    compId = ComponentID.fromString(`${remoteScopeName}/comp1`);
    await mockComponents(workspacePath);
    const tagOpts = { build: false, ignoreIssues: '*' };
    await (await loadWorkspace(workspacePath)).snapping.tag({ ...tagOpts, version: '0.0.1' });
    await modifyMockedComponents(workspacePath, '-version2');
    await (await loadWorkspace(workspacePath)).snapping.tag({ ...tagOpts, version: '0.0.2' });
    await modifyMockedComponents(workspacePath, '-version3');
    await (await loadWorkspace(workspacePath)).snapping.tag({ ...tagOpts, version: '0.0.3' });
    await (await loadWorkspace(workspacePath)).exportAll();
    const { checkout } = await loadWorkspace(workspacePath);
    await checkout.checkoutByCLIValues('comp1', { version: '0.0.2', ids: [compId], skipNpmInstall: true });
    const { snapping } = await loadWorkspace(workspacePath);
    await snapping.snap({ pattern: 'comp1', unmodified: true, detachHead: true, build: false, ignoreIssues: '*' });

    // an intermediate step, make sure the component is detached
    const modelComponent = await getModelComponent();
    expect(modelComponent.toObject()).to.have.property('detachedHeads');
    expect(modelComponent.detachedHeads.getAllHeads()).to.have.lengthOf(1);

    await (await loadWorkspace(workspacePath)).resetAll();
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });
  it('expect .bitmap to point to the same version as it was before the reset, and not the latest', () => {
    const bitmap = parse(fs.readFileSync(path.join(workspaceData.workspacePath, '.bitmap'), 'utf8')) as any;
    expect(bitmap.comp1.version).to.equal('0.0.2');
  });
  it('should not show the component as modified', async () => {
    const { workspace } = await loadWorkspace(workspaceData.workspacePath);
    expect(await workspace.modified()).to.have.lengthOf(0);
  });
  it('should clear the detached head', async () => {
    const modelComponent = await getModelComponent();
    // "bit cat-component" omits the empty detachedHeads, so check there are no heads at all
    expect(modelComponent.detachedHeads.getAllHeads()).to.have.lengthOf(0);
  });
});
