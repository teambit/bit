import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';
import type { DependenciesSnapshot } from './merge-dependencies';
import { mergeDependencies } from './merge-dependencies';

type SnapshotInput = {
  comps?: string[]; // runtime component deps, e.g. "my-scope/b@0.0.1"
  devComps?: string[];
  pkgs?: Record<string, string>;
  devPkgs?: Record<string, string>;
};

// a component loaded from the scope has its dependencies as plain objects (see Dependencies.getClone())
const asLoaded = (deps: Dependency[]) => new Dependencies(deps.map((dep) => Dependency.getClone(dep) as Dependency));

const toDeps = (ids: string[] = []) =>
  asLoaded(
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

const idsOf = (deps: Dependencies) => deps.get().map((dep) => dep.id.toString());

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
      const f = merged.dependencies.get().find((dep) => dep.id.fullName === 'f');
      expect(f?.packageName).to.equal('@my-scope/f');
    });
    it('should return copies of the dependencies of the inputs', () => {
      const e = merged.dependencies.get().find((dep) => dep.id.fullName === 'e');
      expect(other.dependencies.get()).to.not.include(e);
    });
  });
  describe('a dependency that moved to another field on one side and changed its version on the other side', () => {
    const base = snapshot({ comps: ['my-scope/b@0.0.1'], pkgs: { chai: '4.0.0' } });
    const current = snapshot({ comps: ['my-scope/b@0.0.2'], pkgs: { chai: '4.1.0' } });
    const other = snapshot({ devComps: ['my-scope/b@0.0.1'], devPkgs: { chai: '4.0.0' } });
    const merged = mergeDependencies(base, current, other, 'manual');
    it('should keep it in one field only', () => {
      expect(idsOf(merged.dependencies)).to.deep.equal(['my-scope/b@0.0.2']);
      expect(idsOf(merged.devDependencies)).to.deep.equal([]);
      expect(merged.packageDependencies).to.deep.equal({ chai: '4.1.0' });
      expect(merged.devPackageDependencies).to.deep.equal({});
    });
  });
  describe('a component dependency that other imports from another file too', () => {
    const relativePath = (sourceRelativePath: string) => ({
      sourceRelativePath,
      destinationRelativePath: 'index.ts',
      importSpecifiers: [],
    });
    const depWithPaths = (paths: string[]) =>
      asLoaded([new Dependency(ComponentID.fromString('my-scope/b@0.0.1'), paths.map(relativePath), '@my-scope/b')]);
    const base = { ...snapshot({}), dependencies: depWithPaths(['a.ts']) };
    const current = { ...snapshot({}), dependencies: depWithPaths(['a.ts']) };
    const other = { ...snapshot({}), dependencies: depWithPaths(['a.ts', 'b.ts']) };
    it('should take the import paths of other', () => {
      const [merged] = mergeDependencies(base, current, other, 'manual').dependencies.get();
      expect(merged.relativePaths.map((paths) => paths.sourceRelativePath)).to.deep.equal(['a.ts', 'b.ts']);
    });
  });
  describe('a peer component dependency whose version range changed on other only', () => {
    const peerWithRange = (range: string) =>
      asLoaded([new Dependency(ComponentID.fromString('my-scope/b@1.0.0'), [], '@my-scope/b', range)]);
    const base = { ...snapshot({}), peerDependencies: peerWithRange('^1.0.0') };
    const current = { ...snapshot({}), peerDependencies: peerWithRange('^1.0.0') };
    const other = { ...snapshot({}), peerDependencies: peerWithRange('^1.0.0 || ^2.0.0') };
    it('should take the version range of other', () => {
      const [merged] = mergeDependencies(base, current, other, 'manual').peerDependencies.get();
      expect(merged.versionRange).to.equal('^1.0.0 || ^2.0.0');
    });
  });
  describe('a dependency on a lane component that other removed', () => {
    // b was snapped on the lane, so current has the lane snap of it. other removed the dependency.
    const base = snapshot({ comps: ['my-scope/b@0.0.1'] });
    const current = snapshot({ comps: [`my-scope/b@${'a'.repeat(40)}`] });
    const other = snapshot({});
    it('should be removed when b is on the lane, as only its version changed on current', () => {
      const laneIds = ComponentIdList.fromArray([ComponentID.fromString(`my-scope/b@${'a'.repeat(40)}`)]);
      expect(idsOf(mergeDependencies(base, current, other, 'manual', laneIds).dependencies)).to.deep.equal([]);
    });
    it('should be kept when b is not on the lane, as both sides changed it', () => {
      expect(mergeDependencies(base, current, other, 'manual').dependencies.get()).to.have.lengthOf(1);
    });
  });
});
