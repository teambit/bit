import { expect } from 'chai';
import { LaneCleanup } from './lane-cleanup';
import type { LaneCleanupDeps } from './lane-cleanup';

describe('LaneCleanup', () => {
  const laneId = { scope: 'acme.cards', name: 'feature', toString: () => 'acme.cards/feature' } as any;
  const lane = (heads: Record<string, string>) =>
    ({
      components: Object.entries(heads).map(([id, head]) => ({
        id: { scope: id.split('/')[0], toStringWithoutVersion: () => id, changeVersion: () => ({}) },
        head,
      })),
    } as any);

  function cleanup(lanes: any[][]) {
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
      getLanes: async () => reads.shift() ?? lanes[lanes.length - 1],
      importMainObjects: async () => {},
      getModelComponent: async () => undefined,
      importObjectsByHashes: async () => {},
      isReleasedByThisRun: () => false,
      objects: {} as any,
      warn: () => {},
    };
    return { run: () => new LaneCleanup(deps).run(undefined, 'acme.cards/feature'), calls };
  }

  it('archives a lane of this scope only when it is unchanged between the decision and the archive', async () => {
    const own = lane({ 'acme.cards/ui/card': 'aaa' });
    const { run, calls } = cleanup([[own], [own]]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.deep.equal(['archive:acme.cards/feature']);
  });

  it('leaves the lane open when it changed between the decision and the archive', async () => {
    const { run, calls } = cleanup([[lane({ 'acme.cards/ui/card': 'aaa' })], [lane({ 'acme.cards/ui/card': 'bbb' })]]);
    await run();
    expect(calls.filter((c) => c.startsWith('archive:'))).to.be.empty;
    expect(calls.join('\n')).to.include('changed while the release was checking it');
  });
});
