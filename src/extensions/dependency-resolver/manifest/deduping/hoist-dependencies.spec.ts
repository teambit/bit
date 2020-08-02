import { expect } from 'chai';
import { hoistDependencies } from './hoist-dependencies';
import { PackageNameIndex, PackageNameIndexItem } from './index-by-dep-id';
import {
  RUNTIME_DEP_LIFECYCLE_TYPE,
  DEV_DEP_LIFECYCLE_TYPE,
  PEER_DEP_LIFECYCLE_TYPE,
  KEY_NAME_BY_LIFECYCLE_TYPE,
} from '../../constants';
import { DedupedDependencies } from './dedupe-dependencies';
import { dependencies } from '@stencil/core/compiler';
import { SemverVersion, DepObjectKeyName, DependencyLifecycleType } from '../../types';

const DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX = 'dependent-component';

describe('hoistDependencies', () => {
  let index: PackageNameIndex;
  let dependentComponentName = 'dependent-component';
  let dedupedDependencies: DedupedDependencies;
  describe('dependency that appears only once', () => {
    describe('item is exact version', () => {
      let dependencyName = 'package-dependency';
      let dependencyVersion = '1.0.0';
      before(() => {
        index = new Map();
        const item: PackageNameIndexItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: RUNTIME_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, [item]);
        dedupedDependencies = hoistDependencies(index);
      });
      it('the component dependencies should be empty', () => {
        expectAllComponentsDependenciesMapToBeEmpty(dedupedDependencies);
      });
      it('should hoist the dependency to the root', () => {
        expectRootToHave(
          dedupedDependencies,
          KEY_NAME_BY_LIFECYCLE_TYPE[RUNTIME_DEP_LIFECYCLE_TYPE],
          dependencyName,
          dependencyVersion
        );
      });
    });
    describe('item is range', () => {
      let dependencyName = 'package-dependency';
      let dependencyVersion = '^1.0.0';
      before(() => {
        index = new Map();
        const item: PackageNameIndexItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: RUNTIME_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, [item]);
        dedupedDependencies = hoistDependencies(index);
      });
      it('the component dependencies should be empty', () => {
        expectAllComponentsDependenciesMapToBeEmpty(dedupedDependencies);
      });
      it('should hoist the dependency to the root', () => {
        expectRootToHave(
          dedupedDependencies,
          KEY_NAME_BY_LIFECYCLE_TYPE[RUNTIME_DEP_LIFECYCLE_TYPE],
          dependencyName,
          dependencyVersion
        );
      });
    });
    describe('item is peer dependency', () => {
      let dependencyName = 'package-dependency';
      let dependencyVersion = '1.0.0';
      before(() => {
        index = new Map();
        const item: PackageNameIndexItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: PEER_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, [item]);
        dedupedDependencies = hoistDependencies(index);
      });
      it('the component dependencies should be empty', () => {
        expectAllComponentsDependenciesMapToBeEmpty(dedupedDependencies);
      });
      it('should not hoist the dependency to the root', () => {
        expectRootToNotHaveDependency(dedupedDependencies, dependencyName);
      });
    });
  });

  describe('dependency that appears only as peer (in many components)', () => {
    let dependencyName = 'package-dependency';
    describe('when there are no conflicts between versions', () => {
      before(() => {
        index = new Map();
        const items = generateItems(3, undefined, undefined, PEER_DEP_LIFECYCLE_TYPE);
        index.set(dependencyName, items);
        dedupedDependencies = hoistDependencies(index);
      });
      it('should have the peers in each component', () => {
        expect(dedupedDependencies.componentDependenciesMap.size).to.equal(3);
      });
      it('should not hoist the dependency to the root', () => {
        expectRootToNotHaveDependency(dedupedDependencies, dependencyName);
      });
      it('should not report about peer conflicts', () => {
        expectPeerIssuesToBeEmpty(dedupedDependencies);
      });
    });
    describe('when there conflicts between versions for few dependencies', () => {
      let dependencyName1 = 'package-dependency-1';
      let dependencyName2 = 'package-dependency-2';

      before(() => {
        index = new Map();
        const items1 = generateItemsFromArrays(undefined, ['4.0.0', '5.0.0'], PEER_DEP_LIFECYCLE_TYPE);
        const items2 = generateItemsFromArrays(undefined, ['^4.0.0', '^5.0.0'], PEER_DEP_LIFECYCLE_TYPE);
        index.set(dependencyName1, items1);
        index.set(dependencyName2, items2);
        dedupedDependencies = hoistDependencies(index);
      });
      it('should have the peers in each component', () => {
        expect(dedupedDependencies.componentDependenciesMap.size).to.equal(2);
      });
      it('should not hoist the dependency to the root', () => {
        expectRootToNotHaveDependency(dedupedDependencies, dependencyName);
      });
      it('should report about peer conflicts', () => {
        expect(dedupedDependencies.issus?.peerConflicts).to.have.lengthOf(2);
        expect(dedupedDependencies.issus?.peerConflicts[0].packageName).to.equal(dependencyName1);
        expect(dedupedDependencies.issus?.peerConflicts[0].conflictedComponents).to.have.lengthOf(2);
        expect(dedupedDependencies.issus?.peerConflicts[1].packageName).to.equal(dependencyName2);
        expect(dedupedDependencies.issus?.peerConflicts[1].conflictedComponents).to.have.lengthOf(2);
      });
    });
  });

  describe('dependency that appears only with exact versions', () => {
    let dependencyName = 'package-dependency';
    let depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[DEV_DEP_LIFECYCLE_TYPE];
    before(() => {
      index = new Map();
      const items = generateItemsFromArrays(
        undefined,
        ['4.0.0', '5.0.0', '4.0.0', '5.0.0', '4.0.1', '4.0.0'],
        DEV_DEP_LIFECYCLE_TYPE
      );
      index.set(dependencyName, items);
      dedupedDependencies = hoistDependencies(index);
    });
    it('should hoist the most common version to the root', () => {
      expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '4.0.0');
    });
    it('should not put the most common version in the components that has it', () => {
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`, dedupedDependencies);
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-2`, dedupedDependencies);
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-5`, dedupedDependencies);
    });
    it('should put other versions in the components', () => {
      expectComponentDependenciesMapToHave(
        dedupedDependencies,
        `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`,
        depKeyName,
        dependencyName,
        '5.0.0'
      );
    });
  });

  describe('dependency that appears only with ranges', () => {});

  describe('dependency that appears with both ranges and exact versions', () => {});
});

const generateItemsFromArrays = (
  dependentComponentNamePrefix = 'dependent-component',
  ranges: SemverVersion | SemverVersion[],
  lifecycleTypes: DependencyLifecycleType | DependencyLifecycleType[]
): PackageNameIndexItem[] => {
  let size = 1;
  if (Array.isArray(ranges)) {
    size = ranges.length;
  } else if (Array.isArray(lifecycleTypes)) {
    size = lifecycleTypes.length;
  }
  const items: PackageNameIndexItem[] = [];
  for (let i = 0; i <= size - 1; i += 1) {
    const item: PackageNameIndexItem = {
      range: Array.isArray(ranges) ? ranges[i] : ranges,
      origin: `${dependentComponentNamePrefix}-${i}`,
      lifecycleType: Array.isArray(lifecycleTypes) ? lifecycleTypes[i] : lifecycleTypes,
    };
    items.push(item);
  }
  return items;
};

const generateItems = (
  numOfItems = 3,
  dependentComponentNamePrefix = DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX,
  range: SemverVersion = '1.0.0',
  lifecycleType: DependencyLifecycleType = RUNTIME_DEP_LIFECYCLE_TYPE
): PackageNameIndexItem[] => {
  const ranges = Array(numOfItems).fill(range);
  const lifecycleTypes = Array(numOfItems).fill(lifecycleType);
  return generateItemsFromArrays(dependentComponentNamePrefix, ranges, lifecycleTypes);
};

const expectAllComponentsDependenciesMapToBeEmpty = (dedupedDependencies: DedupedDependencies) => {
  expect(dedupedDependencies.componentDependenciesMap).to.be.empty;
};

const expectComponentDependenciesMapToBeEmpty = (dependentName: string, dedupedDependencies: DedupedDependencies) => {
  expect(dedupedDependencies.componentDependenciesMap.get(dependentName)).to.be.undefined;
};

const expectComponentDependenciesMapToHave = (
  dedupedDependencies: DedupedDependencies,
  dependentName: string,
  dependecyKeyName: string,
  dependencyName: string,
  dependencyVersion: SemverVersion
) => {
  const comp = dedupedDependencies.componentDependenciesMap.get(dependentName);
  if (!comp) {
    throw new Error(`component ${dependentName} does not found on dedupedDependencies components map`);
  }
  expect(comp[dependecyKeyName]).to.have.property(dependencyName, dependencyVersion);
};

const expectRootToHave = (
  dedupedDependencies: DedupedDependencies,
  dependecyKeyName: string,
  dependencyName: string,
  dependencyVersion: SemverVersion
) => {
  expect(dedupedDependencies.rootDependencies[dependecyKeyName]).to.have.property(dependencyName, dependencyVersion);
};

const expectRootToNotHaveDependency = (dedupedDependencies: DedupedDependencies, dependencyName: string) => {
  expect(dedupedDependencies.rootDependencies.dependencies).to.not.have.property(dependencyName);
  expect(dedupedDependencies.rootDependencies.devDependencies).to.not.have.property(dependencyName);
  expect(dedupedDependencies.rootDependencies.peerDependencies).to.not.have.property(dependencyName);
};

const expectPeerIssuesToBeEmpty = (dedupedDependencies: DedupedDependencies) => {
  expect(dedupedDependencies.issus?.peerConflicts).to.be.empty;
};
