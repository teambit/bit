import { expect } from 'chai';
import type { Dependency, DependencyLifecycleType } from './dependency';
import { DependencyList } from './dependency-list';

function createDependency(id: string, lifecycle: DependencyLifecycleType, hidden: boolean): Dependency {
  return {
    id,
    version: '1.0.0',
    type: 'package',
    idWithoutVersion: id,
    lifecycle,
    hidden,
    serialize: () => ({}) as any,
    setVersion: () => {},
    toManifest: () => ({ packageName: id, version: '1.0.0' }),
    getPackageName: () => id,
  };
}

describe('DependencyList.getHiddenPeers()', () => {
  it('returns hidden peers and excludes visible peers and hidden non-peer dependencies', () => {
    const dependencies = new DependencyList([
      createDependency('hidden-peer', 'peer', true),
      createDependency('visible-peer', 'peer', false),
      createDependency('hidden-runtime', 'runtime', true),
      createDependency('hidden-dev', 'dev', true),
    ]);

    expect(dependencies.getHiddenPeers().dependencies.map((dependency) => dependency.id)).to.deep.equal([
      'hidden-peer',
    ]);
  });
});
