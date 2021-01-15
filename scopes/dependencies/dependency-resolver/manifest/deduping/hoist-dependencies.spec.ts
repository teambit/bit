import { expect } from 'chai';

import {
  DEV_DEP_LIFECYCLE_TYPE,
  KEY_NAME_BY_LIFECYCLE_TYPE,
  PEER_DEP_LIFECYCLE_TYPE,
  RUNTIME_DEP_LIFECYCLE_TYPE,
} from '../../dependencies/constants';
import { DependencyLifecycleType, SemverVersion } from '../../dependencies';
import { DedupedDependencies } from './dedupe-dependencies';
import { hoistDependencies } from './hoist-dependencies';
import { PackageNameIndex, PackageNameIndexComponentItem, PackageNameIndexItemMetadata } from './index-by-dep-id';

const DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX = 'dependent-component';

const generateItemsFromArrays = (
  dependentComponentNamePrefix = 'dependent-component',
  ranges: SemverVersion | SemverVersion[],
  lifecycleTypes: DependencyLifecycleType | DependencyLifecycleType[]
): PackageNameIndexComponentItem[] => {
  let size = 1;
  if (Array.isArray(ranges)) {
    size = ranges.length;
  } else if (Array.isArray(lifecycleTypes)) {
    size = lifecycleTypes.length;
  }
  const items: PackageNameIndexComponentItem[] = [];
  for (let i = 0; i <= size - 1; i += 1) {
    const item: PackageNameIndexComponentItem = {
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
): PackageNameIndexComponentItem[] => {
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

describe('hoistDependencies', () => {
  let index: PackageNameIndex;
  const dependentComponentName = 'dependent-component';
  let dedupedDependencies: DedupedDependencies;
  describe('preserved dependency', () => {
    describe('some component versions are intersect and some not', () => {
      const dependencyName = 'package-dependency';
      const preservedVersion = '^4.0.0';
      const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[RUNTIME_DEP_LIFECYCLE_TYPE];
      beforeEach(() => {
        index = new Map();
        const metadata: PackageNameIndexItemMetadata = {
          preservedLifecycleType: RUNTIME_DEP_LIFECYCLE_TYPE,
          preservedVersion,
        };
        const items = generateItemsFromArrays(undefined, ['4.0.1', '5.0.0'], RUNTIME_DEP_LIFECYCLE_TYPE);
        index.set(dependencyName, { metadata, componentItems: items });
        dedupedDependencies = hoistDependencies(index);
      });
      it('the root manifest should have the preserved version', () => {
        expectRootToHave(dedupedDependencies, depKeyName, dependencyName, preservedVersion);
      });

      it('the component dependencies which intersects with the preserved should be empty', () => {
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`, dedupedDependencies);
      });
      it('the component dependencies which not intersects with the preserved to have a proper version', () => {
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
      });
    });
  });

  describe('dependency that appears only once', () => {
    describe('item is exact version', () => {
      const dependencyName = 'package-dependency';
      const dependencyVersion = '1.0.0';
      beforeEach(() => {
        index = new Map();
        const item: PackageNameIndexComponentItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: RUNTIME_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, { metadata: {}, componentItems: [item] });
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
      const dependencyName = 'package-dependency';
      const dependencyVersion = '^1.0.0';
      beforeEach(() => {
        index = new Map();
        const item: PackageNameIndexComponentItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: RUNTIME_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, { metadata: {}, componentItems: [item] });
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
    describe('item is peer dependency with one version only', () => {
      const dependencyName = 'package-dependency';
      const dependencyVersion = '1.0.0';
      const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[PEER_DEP_LIFECYCLE_TYPE];

      beforeEach(() => {
        index = new Map();
        const item: PackageNameIndexComponentItem = {
          range: dependencyVersion,
          origin: dependentComponentName,
          lifecycleType: PEER_DEP_LIFECYCLE_TYPE,
        };
        index.set(dependencyName, { metadata: {}, componentItems: [item] });
        dedupedDependencies = hoistDependencies(index);
      });
      it('the component dependencies should be empty', () => {
        expectAllComponentsDependenciesMapToBeEmpty(dedupedDependencies);
      });
      it('should not hoist the dependency to the root', () => {
        // Behavior was changed to hoist peers as well in case they are appear only with one version
        // expectRootToNotHaveDependency(dedupedDependencies, dependencyName);
        expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '1.0.0');
      });
    });
  });

  describe('dependency that appears only as peer (in many components)', () => {
    const dependencyName = 'package-dependency';
    describe('when there are no conflicts between versions', () => {
      beforeEach(() => {
        index = new Map();
        const items = generateItems(3, undefined, undefined, PEER_DEP_LIFECYCLE_TYPE);
        index.set(dependencyName, { metadata: {}, componentItems: items });
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
      const dependencyName1 = 'package-dependency-1';
      const dependencyName2 = 'package-dependency-2';

      beforeEach(() => {
        index = new Map();
        const items1 = generateItemsFromArrays(undefined, ['4.0.0', '5.0.0'], PEER_DEP_LIFECYCLE_TYPE);
        const items2 = generateItemsFromArrays(undefined, ['^4.0.0', '^5.0.0'], PEER_DEP_LIFECYCLE_TYPE);
        index.set(dependencyName1, { metadata: {}, componentItems: items1 });
        index.set(dependencyName2, { metadata: {}, componentItems: items2 });
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
    const dependencyName = 'package-dependency';
    const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[DEV_DEP_LIFECYCLE_TYPE];
    beforeEach(() => {
      index = new Map();
      const items = generateItemsFromArrays(
        undefined,
        ['4.0.0', '5.0.0', '4.0.0', '5.0.0', '4.0.1', '4.0.0'],
        DEV_DEP_LIFECYCLE_TYPE
      );
      index.set(dependencyName, { metadata: {}, componentItems: items });
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
      expectComponentDependenciesMapToHave(
        dedupedDependencies,
        `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-3`,
        depKeyName,
        dependencyName,
        '5.0.0'
      );
    });
  });

  describe('dependency that appears only with ranges', () => {
    const dependencyName = 'package-dependency';
    const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[DEV_DEP_LIFECYCLE_TYPE];
    beforeEach(() => {
      index = new Map();
      const items = generateItemsFromArrays(
        undefined,
        ['^4.0.0', '^5.0.0', '^4.0.0', '^5.0.0', '^5.0.1', '^4.0.1', '^4.0.4'],
        DEV_DEP_LIFECYCLE_TYPE
      );
      index.set(dependencyName, { metadata: {}, componentItems: items });
      dedupedDependencies = hoistDependencies(index);
    });
    it('should hoist the best range to the root', () => {
      expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '^4.0.4');
    });
    it('should not put the dependency in components that matches the best range', () => {
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`, dedupedDependencies);
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-2`, dedupedDependencies);
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-5`, dedupedDependencies);
      expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-6`, dedupedDependencies);
    });
    it('should put other ranges in the components', () => {
      expectComponentDependenciesMapToHave(
        dedupedDependencies,
        `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`,
        depKeyName,
        dependencyName,
        '^5.0.0'
      );
      expectComponentDependenciesMapToHave(
        dedupedDependencies,
        `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-3`,
        depKeyName,
        dependencyName,
        '^5.0.0'
      );
      expectComponentDependenciesMapToHave(
        dedupedDependencies,
        `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-4`,
        depKeyName,
        dependencyName,
        '^5.0.1'
      );
    });
  });

  describe('dependency that appears with both ranges and exact versions', () => {
    const dependencyName = 'package-dependency';
    const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[DEV_DEP_LIFECYCLE_TYPE];
    describe('when there is a version which satisfy more components than the best range', () => {
      beforeEach(() => {
        index = new Map();
        const items = generateItemsFromArrays(
          undefined,
          ['^4.0.0', '5.0.0', '5.0.0', '5.0.0', '^4.0.4'],
          DEV_DEP_LIFECYCLE_TYPE
        );
        index.set(dependencyName, { metadata: {}, componentItems: items });
        dedupedDependencies = hoistDependencies(index);
      });
      it('should hoist the best version to the root', () => {
        expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '5.0.0');
      });
      it('should not put the dependency in components that matches the best version', () => {
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-2`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-3`, dedupedDependencies);
      });
      it('should put other ranges in the components', () => {
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`,
          depKeyName,
          dependencyName,
          '^4.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-4`,
          depKeyName,
          dependencyName,
          '^4.0.4'
        );
      });
    });
    describe('when there is a best range which satisfy more components than the most common version', () => {
      beforeEach(() => {
        index = new Map();
        const items = generateItemsFromArrays(
          undefined,
          ['^4.0.0', '^4.0.2', '5.0.0', '5.0.0', '^4.0.4'],
          DEV_DEP_LIFECYCLE_TYPE
        );
        index.set(dependencyName, { metadata: {}, componentItems: items });
        dedupedDependencies = hoistDependencies(index);
      });
      it('should hoist the best range to the root', () => {
        expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '^4.0.4');
      });
      it('should not put the dependency in components that matches the best range', () => {
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-4`, dedupedDependencies);
      });
      it('should put other ranges in the components', () => {
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-2`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-3`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
      });
    });
    describe('when there is a best range which is not the best alone but combine with version its the best', () => {
      // there is best version which matches 4 components (5.0.0)
      // there is best range which intersect 4 ranges (^4.0.5)
      // there is range that intersects 2 components and version that match 3 components (should return this version -
      // that practically matches 5 components. (^6.0.2(3) + 6.0.4(2))
      beforeEach(() => {
        index = new Map();
        const items = generateItemsFromArrays(
          undefined,
          [
            '^4.0.0',
            '^4.0.2',
            '5.0.0',
            '5.0.0',
            '^4.0.4',
            '^4.0.5',
            '5.0.0',
            '5.0.0',
            '^6.0.0',
            '^6.0.1',
            '^6.0.2',
            '6.0.4',
            '6.0.4',
          ],
          DEV_DEP_LIFECYCLE_TYPE
        );
        index.set(dependencyName, { metadata: {}, componentItems: items });
        dedupedDependencies = hoistDependencies(index);
      });
      it('should hoist the best range to the root', () => {
        expectRootToHave(dedupedDependencies, depKeyName, dependencyName, '6.0.4');
      });
      it('should not put the dependency in components that matches the best range or the combined version', () => {
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-8`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-9`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-10`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-11`, dedupedDependencies);
        expectComponentDependenciesMapToBeEmpty(`${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-12`, dedupedDependencies);
      });
      it('should put other ranges in the components', () => {
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-0`,
          depKeyName,
          dependencyName,
          '^4.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-1`,
          depKeyName,
          dependencyName,
          '^4.0.2'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-2`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-3`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-4`,
          depKeyName,
          dependencyName,
          '^4.0.4'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-5`,
          depKeyName,
          dependencyName,
          '^4.0.5'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-6`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
        expectComponentDependenciesMapToHave(
          dedupedDependencies,
          `${DEFAULT_DEPENDENT_COMPONENT_NAME_PREFIX}-7`,
          depKeyName,
          dependencyName,
          '5.0.0'
        );
      });
    });
  });
});
