import path from 'path';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { Consumer } from '@teambit/legacy.consumer';
import { Scope } from '@teambit/legacy.scope';
import { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { BitMap } from '@teambit/legacy.bit-map';
import { ConfigMain, WorkspaceConfig, WorkspaceExtensionProps, WorkspaceConfigFileProps } from '@teambit/config';
import { PackageJsonFile } from '@teambit/component.sources';
import { pickBy } from 'lodash';

export async function createConsumer(
  projectPath: PathOsBasedAbsolute,
  standAlone = false, // no git
  noPackageJson = false,
  workspaceExtensionProps?: WorkspaceExtensionProps & { externalPackageManager?: boolean },
  generator?: string
): Promise<Consumer> {
  const resolvedScopePath = Consumer._getScopePath(projectPath, standAlone);
  // avoid using the default scope-name `path.basename(process.cwd())` when generated from the workspace.
  // otherwise, components with the same scope-name will get ComponentNotFound on import
  const scopeName = `${path.basename(process.cwd())}-local-${generateRandomStr()}`;
  const scope = await Scope.ensure(resolvedScopePath, scopeName);
  const workspaceConfigProps = workspaceExtensionProps
    ? ({
        'teambit.workspace/workspace': pickBy({
          name: workspaceExtensionProps.name,
          defaultScope: workspaceExtensionProps.defaultScope,
          defaultDirectory: workspaceExtensionProps.defaultDirectory,
          components: workspaceExtensionProps.components,
        }), // remove empty values
        'teambit.dependencies/dependency-resolver': workspaceExtensionProps.externalPackageManager
          ? { externalPackageManager: workspaceExtensionProps.externalPackageManager }
          : {},
      } as WorkspaceConfigFileProps)
    : undefined;
  const config = await ConfigMain.ensureWorkspace(projectPath, scope.path, workspaceConfigProps, generator);
  const legacyConfig = (config.config as WorkspaceConfig).toLegacy();
  const consumer = new Consumer({
    projectPath,
    created: true,
    scope,
    config: legacyConfig,
  });
  await consumer.setBitMap();
  if (!noPackageJson) {
    if (workspaceConfigProps?.['teambit.dependencies/dependency-resolver']?.externalPackageManager) {
      // Handle package.json for external package manager mode
      const existingPackageJson = PackageJsonFile.loadSync(consumer.projectPath);
      if (existingPackageJson.fileExist) {
        // Merge with existing package.json
        const content = { ...existingPackageJson.packageJsonObject };
        content.type = 'module';
        content.scripts = content.scripts || {};
        content.scripts.postinstall = 'bit link && bit compile';

        const packageJson = PackageJsonFile.create(consumer.projectPath, undefined, content);
        consumer.setPackageJson(packageJson);
      } else {
        // Create new package.json with postInstall script
        const jsonContent = {
          type: 'module',
          scripts: {
            postinstall: 'bit link && bit compile',
          },
        };
        const packageJson = PackageJsonFile.create(consumer.projectPath, undefined, jsonContent);
        consumer.setPackageJson(packageJson);
      }
    } else {
      consumer.setPackageJsonWithTypeModule();
    }
  }
  return consumer;
}

/**
 * if resetHard, delete consumer-files: bitMap and workspace.jsonc and also the local scope (.bit dir).
 * otherwise, delete the consumer-files only when they are corrupted
 */
export async function resetConsumer(
  projectPath: PathOsBasedAbsolute,
  resetHard: boolean,
  noGit = false
): Promise<void> {
  const resolvedScopePath = Consumer._getScopePath(projectPath, noGit);
  BitMap.reset(projectPath, resetHard);
  await Scope.reset(resolvedScopePath, resetHard);
  await WorkspaceConfig.reset(projectPath, resetHard);
  await WorkspaceConfig.ensure(projectPath, resolvedScopePath);
  await PackageJsonFile.reset(projectPath);
}
