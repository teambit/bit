import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { UpdateDependentsToExportParams } from './update-dependents-to-export';
import { getUpdateDependentsToExport } from './update-dependents-to-export';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);

const ids = (...strs: string[]) => strs.map((str) => ComponentID.fromString(str));

async function run(params: Partial<UpdateDependentsToExportParams>): Promise<string[]> {
  const results = await getUpdateDependentsToExport({
    localUpdateDependents: [],
    remoteUpdateDependents: [],
    localComponents: new ComponentIdList(),
    includeNewEntries: false,
    isLocalAhead: async () => false,
    ...params,
  });
  return results.map((id) => id.toString());
}

describe('getUpdateDependentsToExport()', () => {
  it('should export a local cascade snap that is ahead of the remote head', async () => {
    const results = await run({
      localUpdateDependents: ids(`my-scope/card@${NEW}`),
      remoteUpdateDependents: ids(`my-scope/card@${OLD}`),
      isLocalAhead: async () => true,
    });
    expect(results).to.deep.equal([`my-scope/card@${NEW}`]);
  });

  it('should keep the remote head when the local head is not ahead of it (remote ahead or diverged)', async () => {
    const results = await run({
      localUpdateDependents: ids(`my-scope/card@${OLD}`),
      remoteUpdateDependents: ids(`my-scope/card@${NEW}`),
    });
    expect(results).to.deep.equal([`my-scope/card@${NEW}`]);
  });

  it('should keep the remote entries that are missing locally', async () => {
    const results = await run({
      localUpdateDependents: ids(`my-scope/card@${NEW}`),
      remoteUpdateDependents: ids(`my-scope/card@${OLD}`, `my-scope/list@${OTHER}`),
      isLocalAhead: async () => true,
    });
    expect(results).to.have.members([`my-scope/card@${NEW}`, `my-scope/list@${OTHER}`]);
  });

  it('should not export a local entry that was removed on the remote', async () => {
    const results = await run({
      localUpdateDependents: ids(`my-scope/card@${NEW}`),
      remoteUpdateDependents: [],
    });
    expect(results).to.have.lengthOf(0);
  });

  it('should export a new local entry when the lane got new entries from a snap from a scope', async () => {
    const results = await run({
      localUpdateDependents: ids(`my-scope/card@${NEW}`),
      remoteUpdateDependents: ids(`my-scope/list@${OTHER}`),
      includeNewEntries: true,
    });
    expect(results).to.have.members([`my-scope/card@${NEW}`, `my-scope/list@${OTHER}`]);
  });

  it('should not export a remote entry that is a visible component on the local lane', async () => {
    const results = await run({
      remoteUpdateDependents: ids(`my-scope/card@${OLD}`),
      localComponents: ComponentIdList.fromStringArray([`my-scope/card@${NEW}`]),
    });
    expect(results).to.have.lengthOf(0);
  });
});
