import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import type { DependenciesSnapshot, ImportsOfMerge, SideOfMerge } from './merge-dependencies';
import { getDependenciesOfVersion, getImportedPackagesWithoutVersion, mergeDependencies } from './merge-dependencies';

type SnapshotInput = {
  comps?: string[]; // runtime component deps, e.g. "my-scope/b@0.0.1"
  devComps?: string[];
  peerComps?: string[];
  pkgs?: Record<string, string>;
  devPkgs?: Record<string, string>;
  peerPkgs?: Record<string, string>;
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

function snapshot({ comps, devComps, peerComps, pkgs, devPkgs, peerPkgs }: SnapshotInput): DependenciesSnapshot {
  return {
    dependencies: toDeps(comps),
    devDependencies: toDeps(devComps),
    peerDependencies: toDeps(peerComps),
    packageDependencies: pkgs || {},
    devPackageDependencies: devPkgs || {},
    peerPackageDependencies: peerPkgs || {},
  };
}

const importsOf = (merged: Record<string, 'runtime' | 'dev'>, sides: string[]): ImportsOfMerge => ({
  merged: new Map(Object.entries(merged)),
  sides: new Set(sides),
});

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
  describe('a component dependency that other removed, with base and other from Versions', () => {
    // a Version has the package names in the dependency-resolver data only, a component loaded from the scope (current)
    // has them on the dependencies as well
    const asVersion = (deps: DependenciesSnapshot) => {
      const depsData = deps.dependencies.get().map((dep) => ({ id: dep.id.toString(), packageName: dep.packageName }));
      return getDependenciesOfVersion({
        ...deps,
        dependencies: asLoaded(deps.dependencies.get().map((dep) => new Dependency(dep.id, dep.relativePaths))),
        extensions: ExtensionDataList.fromArray([
          new ExtensionDataEntry(undefined, undefined, 'teambit.dependencies/dependency-resolver', undefined, {
            dependencies: depsData,
          }),
        ]),
      });
    };
    const base = asVersion(snapshot({ comps: ['my-scope/b@0.0.1'] }));
    const current = snapshot({ comps: ['my-scope/b@0.0.1'] });
    const other = asVersion(snapshot({}));
    it('should be removed', () => {
      expect(idsOf(mergeDependencies(base, current, other, 'manual').dependencies)).to.deep.equal([]);
    });
  });
  describe('with the imports of the merged files', () => {
    describe('a package that one side stopped importing and the other side imports from another file', () => {
      // the lane removed the only import of lodash, main kept it and imports it from another file as well
      const base = snapshot({ pkgs: { lodash: '4.17.20' } });
      const current = snapshot({});
      const other = snapshot({ pkgs: { lodash: '4.17.21' } });
      const imports = importsOf({ lodash: 'runtime' }, ['lodash']);
      it('should be removed without the imports, as it was removed on current only', () => {
        expect(mergeDependencies(base, current, other, 'manual').packageDependencies).to.deep.equal({});
      });
      it('should be kept, taken from other, when the merged files import it', () => {
        const merged = mergeDependencies(base, current, other, 'manual', undefined, imports);
        expect(merged.packageDependencies).to.deep.equal({ lodash: '4.17.21' });
      });
    });
    describe('a package that each side stopped importing from a different file', () => {
      // both sides still import it, but not the merged files
      const base = snapshot({ pkgs: { lodash: '4.17.20' } });
      const merged = mergeDependencies(base, base, base, 'manual', undefined, importsOf({}, ['lodash']));
      it('should be removed', () => {
        expect(merged.packageDependencies).to.deep.equal({});
      });
    });
    describe('a component dependency that the merged files import from dev files only', () => {
      const base = snapshot({ comps: ['my-scope/b@0.0.1'] });
      const merged = mergeDependencies(base, base, base, 'manual', undefined, importsOf({ '@my-scope/b': 'dev' }, []));
      it('should be a dev dependency', () => {
        expect(idsOf(merged.dependencies)).to.deep.equal([]);
        expect(idsOf(merged.devDependencies)).to.deep.equal(['my-scope/b@0.0.1']);
      });
    });
    describe('a component dependency that the merged files import, and only base has', () => {
      const base = snapshot({ comps: ['my-scope/b@0.0.1'] });
      const current = snapshot({});
      const merged = mergeDependencies(
        base,
        current,
        current,
        'manual',
        undefined,
        importsOf({ '@my-scope/b': 'runtime' }, [])
      );
      it('should be taken from base', () => {
        expect(idsOf(merged.dependencies)).to.deep.equal(['my-scope/b@0.0.1']);
      });
    });
    describe('a peer package that the merged files import', () => {
      const base = snapshot({ peerPkgs: { react: '^18.0.0' } });
      const merged = mergeDependencies(
        base,
        base,
        base,
        'manual',
        undefined,
        importsOf({ react: 'runtime' }, ['react'])
      );
      it('should stay a peer', () => {
        expect(merged.peerPackageDependencies).to.deep.equal({ react: '^18.0.0' });
        expect(merged.packageDependencies).to.deep.equal({});
      });
    });
    describe('a package that no side imports', () => {
      // e.g. added by a policy
      const base = snapshot({ pkgs: { 'core-js': '3.0.0' } });
      const merged = mergeDependencies(base, base, base, 'manual', undefined, importsOf({}, []));
      it('should keep the 3-way result', () => {
        expect(merged.packageDependencies).to.deep.equal({ 'core-js': '3.0.0' });
      });
    });
    describe('a types package', () => {
      const base = snapshot({ pkgs: { '@scope/foo': '1.0.0' }, devPkgs: { '@types/scope__foo': '1.0.0' } });
      const current = snapshot({});
      it('should be removed with the package it types', () => {
        const merged = mergeDependencies(base, base, base, 'manual', undefined, importsOf({}, ['@scope/foo']));
        expect(merged.devPackageDependencies).to.deep.equal({});
      });
      it('should be kept with the package it types', () => {
        const imports = importsOf({ '@scope/foo': 'runtime' }, ['@scope/foo']);
        const merged = mergeDependencies(base, current, base, 'manual', undefined, imports);
        expect(merged.packageDependencies).to.deep.equal({ '@scope/foo': '1.0.0' });
        expect(merged.devPackageDependencies).to.deep.equal({ '@types/scope__foo': '1.0.0' });
      });
    });
  });
});

describe('getImportedPackagesWithoutVersion', () => {
  const side = (input: SnapshotInput, ignoredPackages: string[] = []): SideOfMerge => ({
    dependencies: snapshot(input),
    ignoredPackages: new Set(ignoredPackages),
  });
  it('should return a package that a side ignored and the merge does not, when no side has it', () => {
    // the lane imports lodash while it's ignored, main removes the "-"
    const result = getImportedPackagesWithoutVersion(side({}, ['lodash']), side({}, ['lodash']), side({}), ['lodash']);
    expect(result).to.deep.equal(['lodash']);
  });
  it('should not return a package that the merge still ignores', () => {
    const ignoring = side({}, ['lodash']);
    expect(getImportedPackagesWithoutVersion(ignoring, ignoring, ignoring, ['lodash'])).to.deep.equal([]);
  });
  it('should not return a package that a side has as a dependency', () => {
    const result = getImportedPackagesWithoutVersion(
      side({}, ['lodash']),
      side({}, ['lodash']),
      side({ pkgs: { lodash: '4.17.21' } }),
      ['lodash']
    );
    expect(result).to.deep.equal([]);
  });
  it('should not return a package that no side ignored', () => {
    // e.g. a core aspect, which is never a dependency
    expect(getImportedPackagesWithoutVersion(side({}), side({}), side({}), ['@scope/core'])).to.deep.equal([]);
  });
});
