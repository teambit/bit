import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { untrackedLaneComponentsSummary, workspaceLaneSlice } from './lane-slice';

describe('workspaceLaneSlice', () => {
  const entry = (id: string, isDeleted = false) => ({ id: ComponentID.fromString(`${id}@abc123`), isDeleted });
  const trackedBy =
    (...ids: string[]) =>
    (id: ComponentID) =>
      ids.includes(id.toStringWithoutVersion());
  const names = (comps: Array<{ id: ComponentID }>) => comps.map((c) => c.id.toStringWithoutVersion());

  it('splits a cross-scope lane into the components this workspace tracks and the ones it leaves to others', () => {
    const lane = [entry('acme.cards/card'), entry('acme.platform/shell'), entry('acme.cards/deck')];
    const slice = workspaceLaneSlice(lane, trackedBy('acme.cards/card', 'acme.cards/deck'));
    expect(names(slice.tracked)).to.deep.equal(['acme.cards/card', 'acme.cards/deck']);
    expect(names(slice.untracked)).to.deep.equal(['acme.platform/shell']);
  });

  it('keeps tracked components of every scope, not only the default scope (multi-scope workspace)', () => {
    const lane = [entry('teambit.bit/cli'), entry('teambit.git/ci'), entry('teambit.react/react')];
    const slice = workspaceLaneSlice(lane, trackedBy('teambit.bit/cli', 'teambit.git/ci', 'teambit.react/react'));
    expect(names(slice.tracked)).to.deep.equal(['teambit.bit/cli', 'teambit.git/ci', 'teambit.react/react']);
    expect(slice.untracked).to.be.empty;
  });

  it('leaves deleted lane components out of both sides', () => {
    const lane = [entry('acme.cards/card', true), entry('acme.platform/shell', true), entry('acme.cards/deck')];
    const slice = workspaceLaneSlice(lane, trackedBy('acme.cards/card', 'acme.cards/deck'));
    expect(names(slice.tracked)).to.deep.equal(['acme.cards/deck']);
    expect(slice.untracked).to.be.empty;
  });

  it('returns an empty slice for an empty lane (or no lane)', () => {
    const slice = workspaceLaneSlice([], () => true);
    expect(slice.tracked).to.be.empty;
    expect(slice.untracked).to.be.empty;
  });
});

describe('untrackedLaneComponentsSummary', () => {
  const entry = (id: string) => ({ id: ComponentID.fromString(`${id}@abc123`) });

  it('says nothing when the workspace tracks the whole lane', () => {
    expect(untrackedLaneComponentsSummary({ tracked: [entry('acme.cards/card')], untracked: [] })).to.be.undefined;
  });

  it('names the untracked components, and counts the ones beyond the first five', () => {
    const untracked = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => entry(`acme.platform/${name}`));
    const summary = untrackedLaneComponentsSummary({ tracked: [], untracked });
    expect(summary).to.include("Lane carries 7 component(s) this workspace doesn't track");
    expect(summary).to.include('acme.platform/a, acme.platform/b, acme.platform/c, acme.platform/d, acme.platform/e');
    expect(summary).to.include('and 2 more');
    expect(summary).to.not.include('acme.platform/f');
  });
});
