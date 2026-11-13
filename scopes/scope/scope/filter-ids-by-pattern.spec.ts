import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { filterIdsByPattern } from './filter-ids-by-pattern';

describe('filterIdsByPattern', () => {
  const comp1 = ComponentID.fromString('my-scope/comp1');
  const comp2 = ComponentID.fromString('my-scope/comp2');
  const comp3 = ComponentID.fromString('my-scope/ui/comp3');
  const ids = [comp1, comp2, comp3];
  // comp1 and comp3 are "modified"
  const filterByState = async (state: string, poolIds: ComponentID[]) => {
    if (state !== 'modified') throw new Error(`unexpected state ${state}`);
    return poolIds.filter((id) => id.isEqual(comp1) || id.isEqual(comp3));
  };
  const run = async (pattern: string) =>
    (await filterIdsByPattern(pattern, ids, false, filterByState)).map((id) => id.fullName).sort();

  it('should filter by a state', async () => {
    expect(await run('$modified')).to.deep.equal(['comp1', 'ui/comp3']);
  });
  it('should exclude a negated state when it is the only pattern', async () => {
    expect(await run('!$modified')).to.deep.equal(['comp2']);
  });
  it('should exclude a negated state from other patterns', async () => {
    expect(await run('**, !$modified')).to.deep.equal(['comp2']);
  });
  it('should exclude a negated state inside an AND pattern', async () => {
    expect(await run('my-scope/** AND !$modified')).to.deep.equal(['comp2']);
  });
  it('should exclude a negated glob inside an AND pattern', async () => {
    expect(await run('$modified AND !my-scope/ui/**')).to.deep.equal(['comp1']);
  });
  it('should keep excluding a negated glob', async () => {
    expect(await run('**, !my-scope/ui/**')).to.deep.equal(['comp1', 'comp2']);
  });
});
