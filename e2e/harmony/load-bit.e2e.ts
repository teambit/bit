import { loadBit } from '@teambit/bit';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

describe('loadBit()', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
    helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
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
    expect(scopeA.name).to.eq(scopeName);
    expect(scopeB.name).to.eq(helper.scopes.remote);
    expect(scopeC.name).to.eq(helper.scopes.local);
  });

  it('should throw when defaultScope is invalid', async () => {
    helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
    const bitJsonc = helper.bitJsonc.read();
    bitJsonc['teambit.workspace/workspace'].defaultScope = 'hi/';
    helper.bitJsonc.write(bitJsonc);
    let error: Error;
    try {
      await loadBit(helper.scopes.localPath);
    } catch (err) {
      error = err;
    }
    // @ts-ignore
    expect(error.name).to.equal('InvalidScopeName');
  });
});
