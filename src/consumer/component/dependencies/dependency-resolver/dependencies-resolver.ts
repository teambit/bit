import { ComponentID } from '@teambit/component-id';
import { IssuesList } from '@teambit/component-issues';
import { Dependency } from '..';
import Consumer from '../../../../consumer/consumer';
import ComponentMap from '../../../bit-map/component-map';
import Component from '../../../component/consumer-component';
import { DependenciesTree } from '../files-dependency-builder/types/dependency-tree-type';
import OverridesDependencies from './overrides-dependencies';
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
}
