import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { buildLoadPlanGroups } from './load-plan';
import type { LoadPlanInput } from './load-plan';

function id(idStr: string): ComponentID {
  return ComponentID.fromString(idStr);
}

interface MockComp {
  id: ComponentID;
  isCoreEnv?: boolean;
  envId?: string;
  extensions?: Array<{ stringId: string; newExtensionId?: ComponentID }>;
}

function inputFor(workspaceComps: MockComp[], scopeComps: MockComp[] = []): LoadPlanInput {
  const all = [...workspaceComps, ...scopeComps];
  const byKey = new Map<string, MockComp>();
  for (const c of all) {
    byKey.set(c.id.toString(), c);
    byKey.set(c.id.toStringWithoutVersion(), c);
  }
  return {
    workspaceIds: workspaceComps.map((c) => c.id),
    scopeIds: scopeComps.map((c) => c.id),
    isCoreEnv: (cid) => byKey.get(cid.toString())?.isCoreEnv ?? false,
    extensionsOf: (cid) => byKey.get(cid.toString())?.extensions ?? [],
    envIdOf: (cid) => byKey.get(cid.toString())?.envId,
  };
}

describe('buildLoadPlanGroups', () => {
  it('returns no groups when input is empty', () => {
    const result = buildLoadPlanGroups(inputFor([]));
    expect(result.groups).to.deep.equal([]);
    expect(result.extraExtensionIds).to.deep.equal([]);
  });

  it('puts core envs in the first group', () => {
    const coreEnv = { id: id('teambit.harmony/aspect@1.0.0'), isCoreEnv: true };
    const regular = { id: id('scope/comp1@1.0.0') };
    const result = buildLoadPlanGroups(inputFor([coreEnv, regular]));
    expect(result.groups[0].core).to.equal(true);
    expect(result.groups[0].ids.map((c) => c.toStringWithoutVersion())).to.deep.equal(['teambit.harmony/aspect']);
  });

  it('places regular components (no env, no ext-of-others) in the last group', () => {
    const comp = { id: id('scope/regular@1.0.0') };
    const result = buildLoadPlanGroups(inputFor([comp]));
    expect(result.groups).to.have.lengthOf(1);
    const last = result.groups[result.groups.length - 1];
    expect(last.envs).to.equal(false);
    expect(last.aspects).to.equal(false);
  });

  it("layers a workspace component's env before the component", () => {
    const env: MockComp = { id: id('scope/my-env@1.0.0') };
    // The component lists my-env in its extensions so it gets discovered as an ext component.
    const comp: MockComp = {
      id: id('scope/my-comp@1.0.0'),
      envId: env.id.toStringWithoutVersion(),
      extensions: [{ stringId: env.id.toString(), newExtensionId: env.id }],
    };
    const result = buildLoadPlanGroups(inputFor([env, comp]));

    const envIdx = result.groups.findIndex((g) => g.envs && g.ids.some((c) => c.toString() === env.id.toString()));
    const compIdx = result.groups.findIndex((g) => g.ids.some((c) => c.toString() === comp.id.toString()));
    expect(envIdx).to.be.greaterThan(-1);
    expect(compIdx).to.be.greaterThan(-1);
    expect(envIdx).to.be.lessThan(compIdx);
  });

  it('reports extra extension ids that are referenced but not in the input', () => {
    const externalExt = id('external-scope/ext@2.0.0');
    const comp = {
      id: id('scope/comp1@1.0.0'),
      extensions: [{ stringId: externalExt.toString(), newExtensionId: externalExt }],
    };
    const result = buildLoadPlanGroups(inputFor([comp]));
    expect(result.extraExtensionIds.map((c) => c.toStringWithoutVersion())).to.deep.equal(['external-scope/ext']);
  });

  it('layers a chain of extensions deepest-first', () => {
    const extC = { id: id('scope/ext-c@1.0.0') };
    const extB = {
      id: id('scope/ext-b@1.0.0'),
      extensions: [{ stringId: extC.id.toString(), newExtensionId: extC.id }],
    };
    const extA = {
      id: id('scope/ext-a@1.0.0'),
      extensions: [{ stringId: extB.id.toString(), newExtensionId: extB.id }],
    };
    // The "user" component pulls extA in. extA pulls extB. extB pulls extC. All should
    // end up in the load plan as extension components, in order [C], [B], [A].
    const userComp = {
      id: id('scope/user@1.0.0'),
      extensions: [{ stringId: extA.id.toString(), newExtensionId: extA.id }],
    };
    const result = buildLoadPlanGroups(inputFor([userComp, extA, extB, extC]));

    // Find the layered ext groups (envs=false, aspects=true).
    const extGroups = result.groups.filter((g) => g.aspects && !g.envs && !g.core);
    const orderedExts = extGroups.map((g) => g.ids.map((c) => c.toStringWithoutVersion()));
    expect(orderedExts).to.deep.equal([['scope/ext-c'], ['scope/ext-b'], ['scope/ext-a']]);
  });

  it('drops empty groups from the result', () => {
    const result = buildLoadPlanGroups(inputFor([{ id: id('scope/regular@1.0.0') }]));
    for (const g of result.groups) expect(g.ids.length).to.be.greaterThan(0);
  });
});
