import { pickBy, isEmpty } from 'lodash';
import { DEFAULT_COMPONENTS_DIR_PATH } from '@teambit/legacy.constants';
import type { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy.utils';
import AbstractConfig from './abstract-config';
import { InvalidPackageJson } from './exceptions';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';

export type WorkspaceConfigIsExistFunction = (dirPath: string | PathOsBased) => Promise<boolean | undefined>;

export type WorkspaceConfigLoadFunction = (
  workspacePath: string | PathOsBased,
  scopePath: PathOsBasedAbsolute
) => Promise<ILegacyWorkspaceConfig | undefined>;

export type WorkspaceConfigProps = {
  lang?: string;
  componentsDefaultDirectory?: string;
  extensions?: ExtensionDataList;
  defaultScope?: string;
};

// stored on globalThis because in build capsules this module may be loaded twice (once from the
// capsule source and once from an installed dist). a static class field would then be set on one
// copy and read from the other, making the workspace config silently fail to load.
const workspaceConfigLoadingRegistryKey = '__bit_workspaceConfigLoadingRegistry';

export default class WorkspaceConfig extends AbstractConfig {
  componentsDefaultDirectory: string;
  packageJsonObject: Record<string, any> | null | undefined; // workspace package.json if exists (parsed)
  defaultScope: string | undefined; // default remote scope to export to

  static get workspaceConfigLoadingRegistry(): WorkspaceConfigLoadFunction | undefined {
    return (globalThis as any)[workspaceConfigLoadingRegistryKey];
  }
  static set workspaceConfigLoadingRegistry(func: WorkspaceConfigLoadFunction | undefined) {
    (globalThis as any)[workspaceConfigLoadingRegistryKey] = func;
  }
  static registerOnWorkspaceConfigLoading(func: WorkspaceConfigLoadFunction) {
    this.workspaceConfigLoadingRegistry = func;
  }

  constructor({
    lang,
    componentsDefaultDirectory = DEFAULT_COMPONENTS_DIR_PATH,
    extensions,
    defaultScope,
  }: WorkspaceConfigProps) {
    super({ lang, extensions });
    this.componentsDefaultDirectory = componentsDefaultDirectory;
    // Make sure we have the component name in the path. otherwise components will be imported to the same dir.
    if (!componentsDefaultDirectory.includes('{name}')) {
      this.componentsDefaultDirectory = `${this.componentsDefaultDirectory}/{name}`;
    }
    this.defaultScope = defaultScope;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const consumerObject = {
      ...superObject,
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      defaultScope: this.defaultScope,
    };

    const isPropDefault = (val, key) => {
      if (key === 'resolveModules') return !isEmpty(val);
      if (key === 'defaultScope') return Boolean(val);
      return true;
    };

    return pickBy(consumerObject, isPropDefault);
  }

  static create(workspaceConfigProps: WorkspaceConfigProps): WorkspaceConfig {
    return new WorkspaceConfig(workspaceConfigProps);
  }

  static async loadIfExist(
    dirPath: string | PathOsBased,
    scopePath: PathOsBasedAbsolute
  ): Promise<ILegacyWorkspaceConfig | undefined> {
    const loadFunc = this.workspaceConfigLoadingRegistry;
    if (loadFunc && typeof loadFunc === 'function') {
      return loadFunc(dirPath, scopePath);
    }
    return undefined;
  }

  static async _isExist(dirPath: string): Promise<boolean> {
    const packageJsonPath = AbstractConfig.composePackageJsonPath(dirPath);
    const packageJson = await this.loadPackageJson(packageJsonPath);
    if (packageJson && packageJson.bit) {
      return true;
    }
    return false;
  }

  static async loadPackageJson(packageJsonPath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await AbstractConfig.loadJsonFileIfExist(packageJsonPath);
      return file;
    } catch {
      throw new InvalidPackageJson(packageJsonPath);
    }
  }
}
