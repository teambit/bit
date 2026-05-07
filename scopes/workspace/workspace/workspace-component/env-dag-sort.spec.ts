import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { groupEnvsByDepLayer } from './env-dag-sort';

function id(idStr: string): ComponentID {
  return ComponentID.fromString(idStr);
}

describe('groupEnvsByDepLayer', () => {
  it('returns both layers empty for empty input', () => {
    const [deeper, shallower] = groupEnvsByDepLayer([], () => undefined, new Set());
    expect(deeper).to.deep.equal([]);
    expect(shallower).to.deep.equal([]);
  });

  it('puts every env in shallower when no env-of-env relationships exist in the list', () => {
    const ids = [id('teambit.react/react@1.0.0'), id('teambit.node/node@1.0.0')];
    const [deeper, shallower] = groupEnvsByDepLayer(ids, () => undefined, new Set());
    expect(deeper).to.deep.equal([]);
    expect(shallower).to.have.lengthOf(2);
  });

  it('layers correctly when one env is the env of another env in the list', () => {
    // ReactEnv's env is BitEnv. Both are in the list. BitEnv must load first.
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@1.0.0');
    const [deeper, shallower] = groupEnvsByDepLayer(
      [reactEnv, bitEnv],
      (envId) => (envId.toString() === reactEnv.toString() ? bitEnv.toStringWithoutVersion() : undefined),
      new Set()
    );
    expect(deeper.map((c) => c.toStringWithoutVersion())).to.deep.equal(['bitdev.general/envs/bit-env']);
    expect(shallower.map((c) => c.toStringWithoutVersion())).to.deep.equal(['teambit.react/react']);
  });

  it('matches env-of-env by id without version', () => {
    // The lookup returns an id-without-version; we must still match the versioned id in the list.
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@2.5.0');
    const [deeper] = groupEnvsByDepLayer(
      [reactEnv, bitEnv],
      (envId) => (envId.toString() === reactEnv.toString() ? 'bitdev.general/envs/bit-env' : undefined),
      new Set()
    );
    expect(deeper).to.have.lengthOf(1);
    expect(deeper[0].toString()).to.equal(bitEnv.toString());
  });

  it('skips propagating env-of-env when the env is itself a workspace-component env', () => {
    // Quirk preserved from V1's regroupEnvsIdsFromTheList. See env-dag-sort.ts.
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@1.0.0');
    const wsEnvs = new Set([reactEnv.toString()]);
    const envOf: Record<string, string | undefined> = {
      [reactEnv.toString()]: bitEnv.toStringWithoutVersion(),
      [bitEnv.toString()]: undefined,
    };
    const [deeper, shallower] = groupEnvsByDepLayer([reactEnv, bitEnv], (envId) => envOf[envId.toString()], wsEnvs);
    // Because reactEnv is in wsEnvs, the reactEnv → bitEnv edge is NOT propagated
    // into envsOfEnvs. Nothing else points at bitEnv. Both envs end up in shallower.
    expect(deeper).to.deep.equal([]);
    expect(shallower).to.have.lengthOf(2);
  });

  it('does NOT recursively layer env-of-env-of-env (one-level limitation, by design)', () => {
    // This test pins V1's known limitation. When we make the sort recursive in a follow-up,
    // this test should fail and be updated.
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const envOf: Record<string, string> = {
      [a.toString()]: b.toStringWithoutVersion(),
      [b.toString()]: c.toStringWithoutVersion(),
    };
    const [deeper, shallower] = groupEnvsByDepLayer([a, b, c], (envId) => envOf[envId.toString()], new Set());
    // Old behavior: deeper = {b, c}, shallower = {a}. We don't get [[c], [b], [a]].
    expect(deeper.map((x) => x.toStringWithoutVersion()).sort()).to.deep.equal(['scope/b', 'scope/c']);
    expect(shallower.map((x) => x.toStringWithoutVersion())).to.deep.equal(['scope/a']);
  });
});
