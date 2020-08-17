import path from 'path';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { BitId } from 'bit-bin/dist/bit-id';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import Symlink from 'bit-bin/dist/links/symlink';
import { ComponentID } from '@teambit/component';
import { Logger } from '@teambit/logger';

export async function symlinkDependenciesToCapsules(capsules: Capsule[], capsuleList: CapsuleList, logger: Logger) {
  logger.debug(`symlinkDependenciesToCapsules, ${capsules.length} capsules`);
  await Promise.all(
    capsules.map((capsule) => {
      return symlinkComponent(capsule.component.state._consumer, capsuleList, logger);
    })
  );
}

async function symlinkComponent(component: ConsumerComponent, capsuleList: CapsuleList, logger: Logger) {
  const componentCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(new ComponentID(component.id));
  if (!componentCapsule) throw new Error(`unable to find the capsule for ${component.id.toString()}`);
  const allDeps = component.getAllDependenciesIds();
  const symlinks = allDeps.map((depId: BitId) => {
    const devCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(new ComponentID(depId));
    if (!devCapsule) {
      // happens when a dependency is not in the workspace. (it gets installed via the package manager)
      logger.debug(
        `symlinkComponentToCapsule: unable to find the capsule for ${depId.toStringWithoutVersion()}. skipping`
      );
      return null;
    }
    const packageName = componentIdToPackageName(devCapsule.component.state._consumer);
    const devCapsulePath = devCapsule.wrkDir;
    // @todo: this is a hack, the capsule should be the one responsible to symlink, this works only for FS capsules.
    const dest = path.join(componentCapsule.wrkDir, 'node_modules', packageName);
    return new Symlink(devCapsulePath, dest, component.id);
  });
  await Promise.all(symlinks.map((symlink) => symlink && symlink.write()));
}
