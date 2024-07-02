// This file meant to bridge the new workspace config and the legacy one
// when loading the workspace config we actually loading the new one, and it return something that implement this interface

import { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { AbstractVinyl } from '../component/sources';

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
  defaultScope: string;
  _useWorkspaces?: boolean;
  dependencyResolver?: DependencyResolverExtensionProps;
  packageManager?: PackageManagerClients;
  componentsDefaultDirectory?: string;
  _manageWorkspaces?: boolean;
  path: string;
  isLegacy: boolean;
  extensions: { [extensionId: string]: any };
  write: (options: { workspaceDir: PathOsBasedAbsolute }) => Promise<void>;
  toVinyl: (workspaceDir: PathOsBasedAbsolute) => Promise<AbstractVinyl[] | undefined>;
  _legacyPlainObject: () => { [prop: string]: any } | undefined;
}
