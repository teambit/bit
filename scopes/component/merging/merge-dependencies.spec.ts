import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';
import type { DependenciesSnapshot } from './merge-dependencies';
import { applyMergedDependencies, mergeDependencies } from './merge-dependencies';

type SnapshotInput = {
  comps?: string[]; // runtime component deps, e.g. "my-scope/b@0.0.1"
  devComps?: string[];
  pkgs?: Record<string, string>;
  devPkgs?: Record<string, string>;
};

const toDeps = (ids: string[] = []) =>
  new Dependencies(
    ids.map((id) => {
      const compId = ComponentID.fromString(id);
      return new Dependency(compId, [], `@my-scope/${compId.fullName}`);
    })
  );

function snapshot({ comps, devComps, pkgs, devPkgs }: SnapshotInput): DependenciesSnapshot {
  return {
    dependencies: toDeps(comps),
    devDependencies: toDeps(devComps),
    peerDependencies: toDeps(),
    packageDependencies: pkgs || {},
    devPackageDependencies: devPkgs || {},
    peerPackageDependencies: {},
  };
}

const idsOf = (deps: Dependency[]) => deps.map((dep) => dep.id.toString());

describe('mergeDependencies', () => {
  describe('packages', () => {
    const base = snapshot({ pkgs: { lodash: '4.17.20', 'is-string': '1.0.5', chalk: '4.0.0' } });
    // current (the lane) bumped chalk
    const current = snapshot({ pkgs: { lodash: '4.17.20', 'is-string': '1.0.5', chalk: '4.1.0' } });
    // other (main) bumped lodash, removed is-string and added is-number
    const other = snapshot({ pkgs: { lodash: '4.17.21', chalk: '4.0.0', 'is-number': '7.0.0' } });
    const merged = mergeDependencies(base, current, other, 'manual');
    it('should take a version bump of either side', () => {
      expect(merged.packageDependencies.lodash).to.equal('4.17.21');
      expect(merged.packageDependencies.chalk).to.equal('4.1.0');
    });
    it('should remove a package that was removed on other', () => {
      expect(merged.packageDependencies).to.not.have.property('is-string');
    });
    it('should add a package that was added on other', () => {
      expect(merged.packageDependencies['is-number']).to.equal('7.0.0');
    });
  });
  describe('a package that moved from runtime to dev on other', () => {
    const base = snapshot({ pkgs: { chai: '4.0.0' } });
    const current = snapshot({ pkgs: { chai: '4.0.0' } });
    const other = snapshot({ devPkgs: { chai: '4.0.0' } });
    const merged = mergeDependencies(base, current, other, 'manual');
    it('should be a dev dependency only', () => {
      expect(merged.packageDependencies).to.deep.equal({});
      expect(merged.devPackageDependencies).to.deep.equal({ chai: '4.0.0' });
    });
  });
  describe('both sides changed the version of the same package differently', () => {
    const base = snapshot({ pkgs: { lodash: '4.17.19' } });
    const current = snapshot({ pkgs: { lodash: '4.17.20' } });
    const other = snapshot({ pkgs: { lodash: '4.17.21' } });
    it('should keep current unless the strategy is "theirs"', () => {
      expect(mergeDependencies(base, current, other, 'manual').packageDependencies.lodash).to.equal('4.17.20');
      expect(mergeDependencies(base, current, other, 'ours').packageDependencies.lodash).to.equal('4.17.20');
      expect(mergeDependencies(base, current, other, 'theirs').packageDependencies.lodash).to.equal('4.17.21');
    });
  });
  describe('a package removed on current and changed on other', () => {
    const base = snapshot({ pkgs: { lodash: '4.17.19' } });
    const current = snapshot({});
    const other = snapshot({ pkgs: { lodash: '4.17.21' } });
    it('should keep current (removed) unless the strategy is "theirs"', () => {
      expect(mergeDependencies(base, current, other, 'manual').packageDependencies).to.deep.equal({});
      expect(mergeDependencies(base, current, other, 'theirs').packageDependencies.lodash).to.equal('4.17.21');
    });
  });
  describe('components', () => {
    const base = snapshot({ comps: ['my-scope/a@0.0.1', 'my-scope/e@0.0.1', 'my-scope/old@0.0.1'] });
    const current = snapshot({ comps: ['my-scope/a@0.0.1', 'my-scope/e@0.0.1', 'my-scope/old@0.0.1'] });
    const other = snapshot({ comps: ['my-scope/a@0.0.1', 'my-scope/e@0.0.2', 'my-scope/f@0.0.1'] });
    const merged = mergeDependencies(base, current, other, 'manual');
    it('should take the added, removed and updated component dependencies of other', () => {
      expect(idsOf(merged.dependencies)).to.have.members(['my-scope/a@0.0.1', 'my-scope/e@0.0.2', 'my-scope/f@0.0.1']);
    });
    it('should keep the package-name of the dependencies', () => {
      const f = merged.dependencies.find((dep) => dep.id.fullName === 'f');
      expect(f?.packageName).to.equal('@my-scope/f');
    });
    it('should not mutate the dependencies of the inputs', () => {
      applyMergedDependencies(snapshot({}), merged, () => '1.0.0');
      expect(idsOf(other.dependencies.get())).to.include('my-scope/e@0.0.2');
    });
  });
});

describe('applyMergedDependencies', () => {
  it('should override the version of the component dependencies resolved by the callback', () => {
    const base = snapshot({ comps: ['my-scope/b@0.0.1'] });
    const current = snapshot({ comps: ['my-scope/b@0.0.1'] });
    // other (main) imports a lane component, b, that it has on a different version
    const other = snapshot({ comps: ['my-scope/b@0.0.2', 'my-scope/main-only@0.0.3'] });
    const merged = mergeDependencies(base, current, other, 'manual');
    const target = snapshot({ pkgs: { stale: '1.0.0' } });
    applyMergedDependencies(target, merged, (id) => (id.fullName === 'b' ? 'lane-head' : undefined));
    expect(idsOf(target.dependencies.get())).to.have.members(['my-scope/b@lane-head', 'my-scope/main-only@0.0.3']);
    expect(target.packageDependencies).to.deep.equal({});
  });
});
