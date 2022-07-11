// This file meant to bridge the new workspace config and the legacy one
// when loading the workspace config we actually loading the new one, and it return something that implement this interface

import { BitId } from '../../bit-id';
import { PathOsBasedAbsolute } from '../../utils/path';
import { ResolveModulesConfig } from '../component/dependencies/files-dependency-builder/types/dependency-tree-type';
import { AbstractVinyl } from '../component/sources';
import ConsumerOverrides, { ConsumerOverridesOfComponent } from './consumer-overrides';

// to make sure all the legacy code can work without need to change
export type PackageManagerClients = 'npm' | 'yarn' | undefined;

interface DependencyResolverExtensionProps {
  packageManager: PackageManagerClients;
  strictPeerDependencies?: boolean;
  extraArgs?: string[];
  packageManagerProcessOptions?: any;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
}

export interface ILegacyWorkspaceConfig {
  lang: string;
  defaultScope?: string;
  _useWorkspaces?: boolean;
  dependencyResolver?: DependencyResolverExtensionProps;
  packageManager?: PackageManagerClients;
  _bindingPrefix?: string;
  _saveDependenciesAsComponents?: boolean;
  _dependenciesDirectory?: string;
  componentsDefaultDirectory?: string;
  _resolveModules?: ResolveModulesConfig;
  _manageWorkspaces?: boolean;
  defaultOwner?: string;
  path: string;
  isLegacy: boolean;
  extensions: { [extensionId: string]: any };
  write: (options: { workspaceDir: PathOsBasedAbsolute }) => Promise<void>;
  toVinyl: (workspaceDir: PathOsBasedAbsolute) => Promise<AbstractVinyl[] | undefined>;
  componentsConfig: ConsumerOverrides | undefined;
  getComponentConfig: (componentId: BitId) => ConsumerOverridesOfComponent | undefined;
  _legacyPlainObject: () => { [prop: string]: any } | undefined;
}
