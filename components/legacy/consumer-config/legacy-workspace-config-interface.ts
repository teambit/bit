// This file meant to bridge the new workspace config and the legacy one
// when loading the workspace config we actually loading the new one, and it return something that implement this interface

import type { PathOsBasedAbsolute } from '@teambit/toolbox.path.path';
import type { AbstractVinyl } from '@teambit/component.sources';

// to make sure all the legacy code can work without need to change
export type PackageManagerClients = 'npm' | undefined;

interface DependencyResolverExtensionProps {
  packageManager: PackageManagerClients;
  strictPeerDependencies?: boolean;
  extraArgs?: string[];
  packageManagerProcessOptions?: any;
}

export interface ILegacyWorkspaceConfig {
  lang: string;
  defaultScope: string;
  dependencyResolver?: DependencyResolverExtensionProps;
  packageManager?: PackageManagerClients;
  componentsDefaultDirectory?: string;
  path: string;
  isLegacy: boolean;
  extensions: { [extensionId: string]: any };
  write: (options: { workspaceDir: PathOsBasedAbsolute }) => Promise<void>;
  toVinyl: (workspaceDir: PathOsBasedAbsolute) => Promise<AbstractVinyl[] | undefined>;
  ignoredFiles?: string[];
  _legacyPlainObject: () => { [prop: string]: any } | undefined;
}
