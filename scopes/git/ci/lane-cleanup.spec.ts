import { expect } from 'chai';
import { LaneCleanup } from './lane-cleanup';
import type { LaneCleanupDeps } from './lane-cleanup';

describe('LaneCleanup', () => {
  const laneId = { scope: 'acme.cards', name: 'feature', toString: () => 'acme.cards/feature' } as any;
  const entry = (id: string, head: string) => ({
    id: { scope: id.split('/')[0], toStringWithoutVersion: () => id, changeVersion: () => ({}) },
    head,
  });
  const lane = (heads: Record<string, string>, hidden: Record<string, string> = {}, readme?: string) =>
    ({
      components: Object.entries(heads).map(([id, head]) => entry(id, head)),
      updateDependents: Object.entries(hidden).map(([id, head]) => entry(id, head)),
      readme,
    }) as any;

  function cleanup(lanes: Array<any | Error>, overrides: Partial<LaneCleanupDeps> = {}) {
    const calls: string[] = [];
    const reads = [...lanes];
    const deps: LaneCleanupDeps = {
      logger: { console: (line: string) => calls.push(`log:${line.split('\n')[0]}`) } as any,
      defaultScope: 'acme.cards',
      parseLaneId: async () => laneId,
      convertBranchToLaneId: (b) => `acme.cards/${b}`,
      archiveLane: async (id) => {
        calls.push(`archive:${id}`);
        return 'deleted';
      },
      readLane: async () => {
        const next = reads.shift() ?? lanes[lanes.length - 1];
        if (next instanceof Error) throw next;
        return next;
      },
      importMainObjects: async () => {},
      getModelComponent: async () => undefined,
      importObjectsByHashes: async () => {},
      releasedHeadByThisRun: () => undefined,
      objects: {} as any,
      warn: () => {},
      ...overrides,
    };
    return { run: () => new LaneCleanup(deps).run(undefined, 'acme.cards/feature'), calls };
  }

  it('archives a lane of this scope only when it is unchanged between the decision and the archive', async () => {
    const own = lane({ 'acme.cards/ui/card': 'aaa' });
    const { run, calls } = cleanup([own, own]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.deep.equal(['archive:acme.cards/feature']);
  });

  it('leaves the lane open when it changed between the decision and the archive', async () => {
    const { run, calls } = cleanup([lane({ 'acme.cards/ui/card': 'aaa' }), lane({ 'acme.cards/ui/card': 'bbb' })]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
    expect(calls.join('\n')).to.include('changed while the release was checking it');
  });

  it('leaves the lane open when it cannot be re-read before the archive', async () => {
    const { run, calls } = cleanup([lane({ 'acme.cards/ui/card': 'aaa' }), new Error('ECONNRESET')]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
    expect(calls.join('\n')).to.include('Could not re-read lane acme.cards/feature before archiving it');
  });

  it('leaves the lane open when only a hidden updateDependents entry moved before the archive', async () => {
    const own = { 'acme.cards/ui/card': 'aaa' };
    // the hidden dependent was tagged by this run at h1; by the archive it has moved to h2
    const { run, calls } = cleanup(
      [lane(own, { 'acme.cards/ui/row': 'h1' }), lane(own, { 'acme.cards/ui/row': 'h2' })],
      { releasedHeadByThisRun: () => 'h1' }
    );
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
    expect(calls.join('\n')).to.include('changed while the release was checking it');
  });

  it('re-reads an empty lane too, and leaves it open when work arrived before the archive', async () => {
    const { run, calls } = cleanup([lane({}), lane({ 'acme.cards/ui/card': 'new' })]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
    expect(calls.join('\n')).to.include('changed while the release was checking it');
  });

  it('leaves the lane open when its readme changed before the archive', async () => {
    const own = { 'acme.cards/ui/card': 'aaa' };
    const { run, calls } = cleanup([
      lane(own, {}, 'acme.cards/docs/readme@r1'),
      lane(own, {}, 'acme.cards/docs/readme@r2'),
    ]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
  });

  it('leaves the lane open when an entry moved between the visible and hidden buckets before the archive', async () => {
    const { run, calls } = cleanup(
      [
        lane({ 'acme.cards/ui/card': 'aaa' }, { 'acme.cards/ui/row': 'h1' }),
        lane({ 'acme.cards/ui/card': 'aaa', 'acme.cards/ui/row': 'h1' }),
      ],
      { releasedHeadByThisRun: () => 'h1' }
    );
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
  });
});
