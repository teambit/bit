import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { groupExtsByDepLayer, topoLayerByDeps } from './dep-dag-sort';

function id(idStr: string): ComponentID {
  return ComponentID.fromString(idStr);
}

function withoutVersion(c: ComponentID): string {
  return c.toStringWithoutVersion();
}

describe('groupExtsByDepLayer', () => {
  it('returns an empty array for empty input', () => {
    expect(groupExtsByDepLayer([], () => [])).to.deep.equal([]);
  });

  it('returns a single layer when no ext-of-ext relationships exist in the list', () => {
    const ids = [id('scope/ext-a@1.0.0'), id('scope/ext-b@1.0.0')];
    const layers = groupExtsByDepLayer(ids, () => []);
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(2);
  });

  it('layers extA before its dep extB when extA depends on extB', () => {
    const extA = id('scope/ext-a@1.0.0');
    const extB = id('scope/ext-b@1.0.0');
    const layers = groupExtsByDepLayer([extA, extB], (i) =>
      i.toString() === extA.toString() ? [extB.toStringWithoutVersion()] : []
    );
    expect(layers.map((l) => l.map(withoutVersion))).to.deep.equal([['scope/ext-b'], ['scope/ext-a']]);
  });

  it('handles multi-level chains (extA → extB → extC)', () => {
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const deps: Record<string, string[]> = {
      [a.toString()]: [b.toStringWithoutVersion()],
      [b.toString()]: [c.toStringWithoutVersion()],
    };
    const layers = groupExtsByDepLayer([a, b, c], (i) => deps[i.toString()] ?? []);
    expect(layers.map((l) => l.map(withoutVersion))).to.deep.equal([['scope/c'], ['scope/b'], ['scope/a']]);
  });

  it('handles diamonds (extA + extB both depend on extC)', () => {
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const deps: Record<string, string[]> = {
      [a.toString()]: [c.toStringWithoutVersion()],
      [b.toString()]: [c.toStringWithoutVersion()],
    };
    const layers = groupExtsByDepLayer([a, b, c], (i) => deps[i.toString()] ?? []);
    expect(layers).to.have.lengthOf(2);
    expect(layers[0].map(withoutVersion)).to.deep.equal(['scope/c']);
    expect(layers[1].map(withoutVersion).sort()).to.deep.equal(['scope/a', 'scope/b']);
  });

  it('handles fan-out: one extension with multiple deps', () => {
    // extA depends on both extB and extC.
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const deps: Record<string, string[]> = {
      [a.toString()]: [b.toStringWithoutVersion(), c.toStringWithoutVersion()],
    };
    const layers = groupExtsByDepLayer([a, b, c], (i) => deps[i.toString()] ?? []);
    expect(layers).to.have.lengthOf(2);
    expect(layers[0].map(withoutVersion).sort()).to.deep.equal(['scope/b', 'scope/c']);
    expect(layers[1].map(withoutVersion)).to.deep.equal(['scope/a']);
  });

  it('ignores deps not present in the input list', () => {
    const a = id('scope/a@1.0.0');
    const layers = groupExtsByDepLayer([a], () => ['scope/not-in-list']);
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(1);
  });

  it('falls back to a single layer if a cycle is detected', () => {
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const deps: Record<string, string[]> = {
      [a.toString()]: [b.toStringWithoutVersion()],
      [b.toString()]: [a.toStringWithoutVersion()],
    };
    const layers = groupExtsByDepLayer([a, b], (i) => deps[i.toString()] ?? []);
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(2);
  });
});

describe('topoLayerByDeps (generic)', () => {
  it('layers strings by dependency depth', () => {
    const items = ['a', 'b', 'c'];
    const deps: Record<string, string[]> = { a: ['b'], b: ['c'] };
    const layers = topoLayerByDeps(
      items,
      (s) => s,
      (s) => [s],
      (s) => deps[s] ?? []
    );
    expect(layers).to.deep.equal([['c'], ['b'], ['a']]);
  });

  it('handles self-references gracefully (treats as no dependency)', () => {
    const layers = topoLayerByDeps(
      ['a'],
      (s) => s,
      (s) => [s],
      (s) => [s]
    );
    expect(layers).to.deep.equal([['a']]);
  });
});
