import { expect } from 'chai';
import type { Component } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import type { WorkspaceRootMain } from '@teambit/workspace-root';
import { WorkspaceRootAspect } from '@teambit/workspace-root';
import type { TreeSource } from './pnpm-workspace-tree';
import { ScopeTreeSource, WorkspaceTreeSource } from './pnpm-workspace-tree';

function memberOf(root?: string): Component {
  const data = root ? { root } : undefined;
  return {
    state: { aspects: { get: (id: string) => (id === WorkspaceRootAspect.id && data ? { data } : undefined) } },
  } as unknown as Component;
}

function workspaceRootWith(rootId?: string): WorkspaceRootMain {
  return {
    getRootComponentId: () => (rootId ? { toString: () => rootId } : undefined),
  } as unknown as WorkspaceRootMain;
}

describe('pnpm workspace tree sources', () => {
  describe('WorkspaceTreeSource.getRootId', () => {
    it('takes the root of the workspace, not the root the members were snapped with', () => {
      const source: TreeSource = new WorkspaceTreeSource({} as Workspace, workspaceRootWith('org.scope/ws-root'));
      const members = [memberOf('org.other/foreign-root@0.0.1'), memberOf('org.scope/ws-root@0.0.2'), memberOf()];
      expect(source.getRootId(members)).to.equal('org.scope/ws-root');
    });
    it('throws when the workspace has no root', () => {
      const source: TreeSource = new WorkspaceTreeSource({} as Workspace, workspaceRootWith());
      expect(() => source.getRootId([memberOf('org.scope/ws-root@0.0.2')])).to.throw('no workspace root was found');
    });
  });
  describe('ScopeTreeSource.getRootId', () => {
    const source = new ScopeTreeSource({} as ScopeMain);
    it('takes the root the members were snapped with', () => {
      expect(source.getRootId([memberOf('org.scope/ws-root@0.0.2'), memberOf('org.scope/ws-root@0.0.2')])).to.equal(
        'org.scope/ws-root@0.0.2'
      );
    });
    it('throws when the members were snapped with different roots', () => {
      expect(() =>
        source.getRootId([memberOf('org.scope/ws-root@0.0.1'), memberOf('org.scope/ws-root@0.0.2')])
      ).to.throw('different workspace roots');
    });
    it('throws when no member has a root', () => {
      expect(() => source.getRootId([memberOf()])).to.throw('no workspace root was found');
    });
  });
});
