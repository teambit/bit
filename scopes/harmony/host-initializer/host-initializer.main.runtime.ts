import fs from 'fs-extra';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { Consumer, getConsumerInfo } from '@teambit/legacy/dist/consumer';
import { Scope } from '@teambit/legacy/dist/scope';
import { Repository } from '@teambit/legacy/dist/scope/objects';
import { isDirEmpty } from '@teambit/legacy.utils';
import { WorkspaceExtensionProps } from '@teambit/config';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ObjectsWithoutConsumer } from './objects-without-consumer';
import { HostInitializerAspect } from './host-initializer.aspect';
import { InitCmd } from './init-cmd';
import { createConsumer, resetConsumer } from './create-consumer';

export class HostInitializerMain {
  static async init(
    absPath?: string,
    noGit = false,
    noPackageJson = false,
    reset = false,
    resetNew = false,
    resetLaneNew = false,
    resetHard = false,
    resetScope = false,
    force = false,
    workspaceConfigProps: WorkspaceExtensionProps = {},
    generator?: string
  ): Promise<Consumer> {
    const consumerInfo = await getConsumerInfo(absPath || process.cwd());
    // if "bit init" was running without any flags, the user is probably trying to init a new workspace but wasn't aware
    // that he's already in a workspace.
    if (
      !absPath &&
      consumerInfo?.path &&
      consumerInfo.path !== process.cwd() &&
      !reset &&
      !resetHard &&
      !resetScope &&
      !resetNew &&
      !resetLaneNew
    ) {
      throw new Error(
        `error: unable to init a new workspace in an inner directory of an existing workspace at "${consumerInfo.path}"`
      );
    }
    const consumerPath = consumerInfo?.path || absPath || process.cwd();

    if (reset || resetHard) {
      await resetConsumer(consumerPath, resetHard, noGit);
    }
    let consumer: Consumer | undefined;
    try {
      consumer = await createConsumer(consumerPath, noGit, noPackageJson, workspaceConfigProps, generator);
    } catch (err) {
      // it's possible that at this stage the consumer fails to load due to scope issues.
      // still we want to load it to include its instance of "scope.json", so then later when "consumer.write()", we
      // don't lose some scope metadata
    }
    if (resetScope) {
      const scopePath = findScopePath(consumerPath);
      if (!scopePath) throw new Error(`fatal: scope not found in the path: ${consumerPath}`);
      await Scope.reset(scopePath, true);
    }
    if (!consumer) consumer = await createConsumer(consumerPath, noGit, noPackageJson, workspaceConfigProps);
    if (!force && !resetScope) {
      await throwForOutOfSyncScope(consumer);
    }
    if (resetNew) {
      await consumer.resetNew();
    }
    if (resetLaneNew) {
      await consumer.resetLaneNew();
    }
    return consumer.write();
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    const hostInitializerMain = new HostInitializerMain();
    const initCmd = new InitCmd(hostInitializerMain);
    cli.register(initCmd);
    return hostInitializerMain;
  }
}

HostInitializerAspect.addRuntime(HostInitializerMain);

export default HostInitializerMain;

/**
 * throw an error when .bitmap is empty but a scope has objects.
 * a user may got into this state for reasons such as:
 * 1. deleting manually .bitmap hoping to re-start Bit from scratch. (probably unaware of `--reset-hard` flag).
 * 2. switching to a branch where Bit wasn't initialized
 * in which case, it's better to stop and show an error describing what needs to be done.
 * it can always be ignored by entering `--force` flag.
 */
async function throwForOutOfSyncScope(consumer: Consumer): Promise<void> {
  if (!consumer.bitMap.isEmpty()) return;
  const scopePath = consumer.scope.getPath();
  const objectsPath = Repository.getPathByScopePath(scopePath);
  const dirExist = await fs.pathExists(objectsPath);
  if (!dirExist) return;
  const hasObjects = !(await isDirEmpty(objectsPath));
  if (hasObjects) {
    throw new ObjectsWithoutConsumer(scopePath);
  }
}
