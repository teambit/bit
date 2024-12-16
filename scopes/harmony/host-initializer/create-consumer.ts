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
  workspaceExtensionProps?: WorkspaceExtensionProps,
  generator?: string
): Promise<Consumer> {
  const resolvedScopePath = Consumer._getScopePath(projectPath, standAlone);
  // avoid using the default scope-name `path.basename(process.cwd())` when generated from the workspace.
  // otherwise, components with the same scope-name will get ComponentNotFound on import
  const scopeName = `${path.basename(process.cwd())}-local-${generateRandomStr()}`;
  const scope = await Scope.ensure(resolvedScopePath, scopeName);
  const workspaceConfigProps = workspaceExtensionProps
    ? ({
        'teambit.workspace/workspace': pickBy(workspaceExtensionProps), // remove empty values
        'teambit.dependencies/dependency-resolver': {},
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
    consumer.setPackageJsonWithTypeModule();
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
