import { loadBit } from '@teambit/bit';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('loadBit()', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
  });

  it('should return a valid workspace instance', async () => {
    const harmony = await loadBit(helper.scopes.localPath);
    const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    expect(workspace.path).to.eq(helper.scopes.localPath);
  });

  async function createScope(path: string) {
    const harmony = await loadBit(path);
    const scope = harmony.get<ScopeMain>(ScopeAspect.id);

    return scope;
  }

  it('should create and load three different scopes', async () => {
    const { scopePath, scopeName } = helper.scopeHelper.getNewBareScope();
    const scopeA = await createScope(scopePath);
    const scopeB = await createScope(helper.scopes.remotePath);
    const scopeC = await createScope(helper.scopes.localPath);
    // expect(workspace.path).to.eq(helper.scopes.localPath);
    expect(scopeA.name.startsWith(scopeName)).to.be.true;
    expect(scopeB.name.startsWith(helper.scopes.remote)).to.be.true;
    expect(scopeC.name.startsWith(helper.scopes.local)).to.be.true;
  });

  it('should throw when defaultScope is invalid', async () => {
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    const workspaceJsonc = helper.workspaceJsonc.read();
    workspaceJsonc['teambit.workspace/workspace'].defaultScope = 'hi/';
    helper.workspaceJsonc.write(workspaceJsonc);
    let error: Error;
    try {
      await loadBit(helper.scopes.localPath);
    } catch (err: any) {
      error = err;
    }
    // @ts-ignore
    expect(error.name).to.equal('InvalidScopeName');
  });
});
