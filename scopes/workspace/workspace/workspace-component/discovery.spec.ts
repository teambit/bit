import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { classifyIds } from './discovery';

function id(idStr: string): ComponentID {
  return ComponentID.fromString(idStr);
}

describe('classifyIds', () => {
  it('returns empty maps for empty input', () => {
    const result = classifyIds([], { knownWorkspaceIds: [], resolveWorkspaceVersion: (i) => i });
    expect(result.workspaceIds.size).to.equal(0);
    expect(result.scopeIds.size).to.equal(0);
  });

  it('classifies an id present in the workspace as a workspace id', () => {
    const wsId = id('scope/comp1@1.0.0');
    const result = classifyIds([wsId], {
      knownWorkspaceIds: [wsId],
      resolveWorkspaceVersion: (i) => i,
    });
    expect(result.workspaceIds.size).to.equal(1);
    expect(result.workspaceIds.get(wsId.toString())?.toString()).to.equal(wsId.toString());
    expect(result.scopeIds.size).to.equal(0);
  });

  it('classifies an id absent from the workspace as a scope id', () => {
    const scopeOnly = id('scope/comp1@1.0.0');
    const result = classifyIds([scopeOnly], {
      knownWorkspaceIds: [],
      resolveWorkspaceVersion: (i) => i,
    });
    expect(result.scopeIds.size).to.equal(1);
    expect(result.scopeIds.get(scopeOnly.toString())?.toString()).to.equal(scopeOnly.toString());
    expect(result.workspaceIds.size).to.equal(0);
  });

  it('matches workspace presence ignoring version when input has no version', () => {
    const inputId = id('scope/comp1');
    const wsId = id('scope/comp1@1.0.0');
    const result = classifyIds([inputId], {
      knownWorkspaceIds: [wsId],
      resolveWorkspaceVersion: () => wsId,
    });
    expect(result.workspaceIds.size).to.equal(1);
    expect(result.workspaceIds.get(wsId.toString())?.toString()).to.equal(wsId.toString());
  });

  it('uses the resolved version as the workspaceIds map key, not the input id', () => {
    const inputId = id('scope/comp1');
    const wsId = id('scope/comp1@2.5.0');
    const result = classifyIds([inputId], {
      knownWorkspaceIds: [wsId],
      resolveWorkspaceVersion: () => wsId,
    });
    expect(Array.from(result.workspaceIds.keys())).to.deep.equal([wsId.toString()]);
  });

  it('appends to an existing result map when one is provided', () => {
    const first = id('scope/a@1.0.0');
    const second = id('scope/b@1.0.0');
    const initial = classifyIds([first], {
      knownWorkspaceIds: [first],
      resolveWorkspaceVersion: (i) => i,
    });
    const after = classifyIds([second], { knownWorkspaceIds: [], resolveWorkspaceVersion: (i) => i }, initial);
    expect(after).to.equal(initial);
    expect(after.workspaceIds.has(first.toString())).to.equal(true);
    expect(after.scopeIds.has(second.toString())).to.equal(true);
  });

  it('handles a mix of workspace and scope ids in one call', () => {
    const wsComp = id('scope/in-ws@1.0.0');
    const scopeComp = id('scope/scope-only@2.0.0');
    const result = classifyIds([wsComp, scopeComp], {
      knownWorkspaceIds: [wsComp],
      resolveWorkspaceVersion: (i) => i,
    });
    expect(result.workspaceIds.size).to.equal(1);
    expect(result.scopeIds.size).to.equal(1);
    expect(result.workspaceIds.has(wsComp.toString())).to.equal(true);
    expect(result.scopeIds.has(scopeComp.toString())).to.equal(true);
  });
});
