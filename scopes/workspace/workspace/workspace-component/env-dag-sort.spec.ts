import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { groupEnvsByDepLayer } from './env-dag-sort';

function id(idStr: string): ComponentID {
  return ComponentID.fromString(idStr);
}

function withoutVersion(c: ComponentID): string {
  return c.toStringWithoutVersion();
}

describe('groupEnvsByDepLayer', () => {
  it('returns an empty array for empty input', () => {
    expect(groupEnvsByDepLayer([], () => undefined, new Set())).to.deep.equal([]);
  });

  it('returns a single layer when no env-of-env relationships exist in the list', () => {
    const ids = [id('teambit.react/react@1.0.0'), id('teambit.node/node@1.0.0')];
    const layers = groupEnvsByDepLayer(ids, () => undefined, new Set());
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(2);
  });

  it('layers correctly when one env is the env of another env in the list', () => {
    // ReactEnv's env is BitEnv. Both are in the list. BitEnv must load first.
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@1.0.0');
    const layers = groupEnvsByDepLayer(
      [reactEnv, bitEnv],
      (envId) => (envId.toString() === reactEnv.toString() ? bitEnv.toStringWithoutVersion() : undefined),
      new Set()
    );
    expect(layers).to.have.lengthOf(2);
    expect(layers[0].map(withoutVersion)).to.deep.equal(['bitdev.general/envs/bit-env']);
    expect(layers[1].map(withoutVersion)).to.deep.equal(['teambit.react/react']);
  });

  it('matches env-of-env by id without version', () => {
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@2.5.0');
    const layers = groupEnvsByDepLayer(
      [reactEnv, bitEnv],
      (envId) => (envId.toString() === reactEnv.toString() ? 'bitdev.general/envs/bit-env' : undefined),
      new Set()
    );
    expect(layers).to.have.lengthOf(2);
    expect(layers[0]).to.have.lengthOf(1);
    expect(layers[0][0].toString()).to.equal(bitEnv.toString());
  });

  it('skips propagating env-of-env when the env is itself a workspace-component env', () => {
    const reactEnv = id('teambit.react/react@1.0.0');
    const bitEnv = id('bitdev.general/envs/bit-env@1.0.0');
    const wsEnvs = new Set([reactEnv.toString()]);
    const envOf: Record<string, string | undefined> = {
      [reactEnv.toString()]: bitEnv.toStringWithoutVersion(),
      [bitEnv.toString()]: undefined,
    };
    const layers = groupEnvsByDepLayer([reactEnv, bitEnv], (envId) => envOf[envId.toString()], wsEnvs);
    // The reactEnv → bitEnv edge is NOT propagated, so they aren't ordered.
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(2);
  });

  it('recursively layers env-of-env-of-env', () => {
    // A → B → C: load C, then B, then A.
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const envOf: Record<string, string> = {
      [a.toString()]: b.toStringWithoutVersion(),
      [b.toString()]: c.toStringWithoutVersion(),
    };
    const layers = groupEnvsByDepLayer([a, b, c], (envId) => envOf[envId.toString()], new Set());
    expect(layers.map((layer) => layer.map(withoutVersion))).to.deep.equal([['scope/c'], ['scope/b'], ['scope/a']]);
  });

  it('layers diamond shapes correctly (two envs share an env-of-env)', () => {
    // A → C, B → C: C loads first, then [A, B] together.
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const c = id('scope/c@1.0.0');
    const envOf: Record<string, string> = {
      [a.toString()]: c.toStringWithoutVersion(),
      [b.toString()]: c.toStringWithoutVersion(),
    };
    const layers = groupEnvsByDepLayer([a, b, c], (envId) => envOf[envId.toString()], new Set());
    expect(layers).to.have.lengthOf(2);
    expect(layers[0].map(withoutVersion)).to.deep.equal(['scope/c']);
    expect(layers[1].map(withoutVersion).sort()).to.deep.equal(['scope/a', 'scope/b']);
  });

  it('falls back to a single layer if a cycle is detected', () => {
    // A → B → A. Should not infinite-loop. Returns [[A, B]] defensively.
    const a = id('scope/a@1.0.0');
    const b = id('scope/b@1.0.0');
    const envOf: Record<string, string> = {
      [a.toString()]: b.toStringWithoutVersion(),
      [b.toString()]: a.toStringWithoutVersion(),
    };
    const layers = groupEnvsByDepLayer([a, b], (envId) => envOf[envId.toString()], new Set());
    expect(layers).to.have.lengthOf(1);
    expect(layers[0]).to.have.lengthOf(2);
  });
});
