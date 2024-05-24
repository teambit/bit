import path from 'path';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { WorkspaceConfigProps } from '@teambit/legacy/dist/consumer/config/workspace-config';
import { Scope } from '@teambit/legacy/dist/scope';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import BitMap from '@teambit/legacy/dist/consumer/bit-map';
import { ConfigMain, WorkspaceConfig } from '@teambit/config';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';

export async function createConsumer(
  projectPath: PathOsBasedAbsolute,
  standAlone = false, // no git
  noPackageJson = false,
  workspaceConfigProps?: WorkspaceConfigProps
): Promise<Consumer> {
  const resolvedScopePath = Consumer._getScopePath(projectPath, standAlone);
  let existingGitHooks;
  // avoid using the default scope-name `path.basename(process.cwd())` when generated from the workspace.
  // otherwise, components with the same scope-name will get ComponentNotFound on import
  const scopeName = `${path.basename(process.cwd())}-local-${generateRandomStr()}`;
  const scope = await Scope.ensure(resolvedScopePath, scopeName);
  const config = await ConfigMain.workspaceEnsureLegacy(projectPath, scope.path, standAlone, workspaceConfigProps);
  const consumer = new Consumer({
    projectPath,
    created: true,
    scope,
    config,
    existingGitHooks,
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
  await ConfigMain.workspaceEnsureLegacy(projectPath, resolvedScopePath);
  await PackageJsonFile.reset(projectPath);
}
