import R from 'ramda';
import { ComponentID } from '@teambit/component-id';
import { IssuesList } from '@teambit/component-issues';
import { Dependency } from '..';
import Consumer from '../../../../consumer/consumer';
import ComponentMap from '../../../bit-map/component-map';
import Component from '../../../component/consumer-component';
import { DependenciesTree } from '../files-dependency-builder/types/dependency-tree-type';
import OverridesDependencies from './overrides-dependencies';
import { DependenciesData } from './dependencies-data';
import { ExtensionDataList } from '../../../config';
import { SourceFile } from '../../sources';
import { DependenciesOverridesData } from '../../../config/component-overrides';
import { DependencyDetector } from '../files-dependency-builder/detector-hook';

export type AllDependencies = {
  dependencies: Dependency[];
  devDependencies: Dependency[];
};

export type AllPackagesDependencies = {
  packageDependencies: Record<string, string>;
  devPackageDependencies: Record<string, string>;
  peerPackageDependencies: Record<string, string>;
};

export type FileType = {
  isTestFile: boolean;
};

export type DebugDependencies = {
  components: DebugComponentsDependency[];
  unidentifiedPackages?: string[];
};

export type DebugComponentsDependency = {
  id: ComponentID;
  importSource?: string;
  dependencyPackageJsonPath?: string;
  dependentPackageJsonPath?: string;
  // can be resolved here or can be any one of the strategies in dependencies-version-resolver
  versionResolvedFrom?: 'DependencyPkgJson' | 'DependentPkgJson' | 'BitMap' | 'Model' | 'MergeConfig' | string;
  version?: string;
  componentIdResolvedFrom?: 'DependencyPkgJson' | 'DependencyPath';
  packageName?: string;
};

type WorkspacePolicyGetter = () => {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type EnvPolicyForComponent = {
  dependencies: { [name: string]: string };
  devDependencies: { [name: string]: string };
  peerDependencies: { [name: string]: string };
};

type HarmonyEnvPeersPolicyForEnvItselfGetter = (
  componentId: ComponentID,
  files: SourceFile[]
) => Promise<{ [name: string]: string } | undefined>;

type OnComponentAutoDetectOverrides = (
  configuredExtensions: ExtensionDataList,
  componentId: ComponentID,
  files: SourceFile[]
) => Promise<DependenciesOverridesData>;

type OnComponentAutoDetectConfigMerge = (componentId: ComponentID) => DependenciesOverridesData | undefined;

type GetEnvDetectors = (extensions: ExtensionDataList) => Promise<DependencyDetector[] | null>;

export default class DependencyResolver {
  component: Component;
  consumer: Consumer;
  componentId: ComponentID;
  componentMap: ComponentMap;
  componentFromModel: Component;
  tree: DependenciesTree;
  allDependencies: AllDependencies;
  allPackagesDependencies: AllPackagesDependencies;
  /**
   * This will store a copy of the package deps before removal
   * in order to apply auto detected rules that are running after the removal
   */
  originAllPackagesDependencies: AllPackagesDependencies;
  issues: IssuesList;
  coreAspects: string[] = [];
  processedFiles: string[];
  overridesDependencies: OverridesDependencies;
  debugDependenciesData: DebugDependencies;
  autoDetectOverrides: Record<string, any>;
  autoDetectConfigMerge: Record<string, any>;

  static getWorkspacePolicy: WorkspacePolicyGetter;
  static registerWorkspacePolicyGetter(func: WorkspacePolicyGetter) {
    this.getWorkspacePolicy = func;
  }

  static envDetectorsGetter: GetEnvDetectors;
  static registerEnvDetectorGetter(getter: GetEnvDetectors) {
    this.envDetectorsGetter = getter;
  }

  static getOnComponentAutoDetectOverrides: OnComponentAutoDetectOverrides;
  static registerOnComponentAutoDetectOverridesGetter(func: OnComponentAutoDetectOverrides) {
    this.getOnComponentAutoDetectOverrides = func;
  }

  static getOnComponentAutoDetectConfigMerge: OnComponentAutoDetectConfigMerge;
  static registerOnComponentAutoDetectConfigMergeGetter(func: OnComponentAutoDetectConfigMerge) {
    this.getOnComponentAutoDetectConfigMerge = func;
  }

  /**
   * This will get the peers policy provided by the env of the component
   */
  static getHarmonyEnvPeersPolicyForEnvItself: HarmonyEnvPeersPolicyForEnvItselfGetter;
  static registerHarmonyEnvPeersPolicyForEnvItselfGetter(func: HarmonyEnvPeersPolicyForEnvItselfGetter) {
    this.getHarmonyEnvPeersPolicyForEnvItself = func;
  }

  static getDepResolverAspectName: () => string;
  static getCoreAspectsPackagesAndIds: () => Record<string, string>;
  static getDevFiles: (component: Component) => Promise<string[]>;

  constructor(component: Component, consumer: Consumer) {
    this.component = component;
    this.consumer = consumer;
    this.componentId = component.componentId;
    // the consumerComponent is coming from the workspace, so it must have the componentMap prop
    this.componentMap = this.component.componentMap as ComponentMap;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
    this.allDependencies = {
      dependencies: [],
      devDependencies: [],
    };
    this.allPackagesDependencies = {
      packageDependencies: {},
      devPackageDependencies: {},
      peerPackageDependencies: {},
    };
    this.processedFiles = [];
    this.issues = component.issues;
    this.overridesDependencies = new OverridesDependencies(component);
    this.debugDependenciesData = { components: [] };
  }

  /**
   * Resolve components and packages dependencies for a component.
   * This method should NOT have any side-effect on the component. the DependenciesLoader class is
   * responsible for saving this data on the component object.
   *
   * The process is as follows:
   * 1) Use the language driver to parse the component files and find for each file its dependencies.
   * 2) The results we get from the driver per file tells us what are the files and packages that depend on our file.
   * and also whether there are missing packages and files.
   * 3) Using the information from the driver, we go over each one of the dependencies files and find its counterpart
   * component. The way how we find it, is by using the bit.map file which has a mapping between the component name and
   * the file paths.
   * 4) If we find a component to the file dependency, we add it to component.dependencies. Otherwise, it's added to
   * component.issues.untrackedDependencies
   * 5) Similarly, when we find the packages dependencies, they are added to component.packageDependencies. Otherwise,
   * they're added to component.issues.missingPackagesDependenciesOnFs
   * 6) In case the driver found a file dependency that is not on the file-system, we add that file to
   * component.issues.missingDependenciesOnFs
   */
  async getDependenciesData(): Promise<DependenciesData> {
    await this.populateDependencies();
    return new DependenciesData(this.allDependencies, this.allPackagesDependencies, this.issues, this.coreAspects, {
      manuallyRemovedDependencies: this.overridesDependencies.manuallyRemovedDependencies,
      manuallyAddedDependencies: this.overridesDependencies.manuallyAddedDependencies,
      missingPackageDependencies: this.overridesDependencies.missingPackageDependencies,
    });
  }

  async getEnvDetectors(): Promise<DependencyDetector[] | null> {
    return DependencyResolver.envDetectorsGetter(this.component.extensions);
  }

  /**
   * Given the tree of file dependencies from the driver, find the components of these files.
   * Each dependency file has a path, use bit.map to search for the component name by that path.
   * If the component is found, add it to "this.allDependencies.dependencies". Otherwise, add it to "this.issues.untrackedDependencies".
   *
   * For the found components, add their sourceRelativePath and destinationRelativePath, they are being used for
   * generating links upon import:
   * sourceRelativePath - location of the link file.
   * destinationRelativePath - destination written inside the link file.
   *
   * When a dependency is found in a regular (implementation) file, it goes to `dependencies`. If
   * it found on a test file, it goes to `devDependencies`.
   * Similarly, when a package is found in a regular file, it goes to `packageDependencies`. When
   * if found in a test file, it goes to `devPackageDependencies`.
   * An exception for the above is when a package is required in a regular or test file but is also
   * mentioned in the `package.json` file as a peerDependency, in that case, the package is added
   * to `peerPackageDependencies` and removed from other places. Unless this package is overridden
   * and marked as ignored in the consumer or component config file.
   */
  private async populateDependencies() {
    this.coreAspects = R.uniq(this.coreAspects);
  }
}
