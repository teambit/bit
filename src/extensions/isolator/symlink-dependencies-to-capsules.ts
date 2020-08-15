import path from 'path';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Symlink from '../../links/symlink';
import { ComponentID } from '../component';
import { Logger } from '../logger';

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
    // use relative symlink in capsules to make it really isolated from the machine fs
    const src = path.relative(path.resolve(dest, '..'), devCapsulePath);
    return new Symlink(src, dest, component.id);
  });

  // using native fs to write the symlink instead of using `symlink-or-copy` package.
  // because we want symlink src to be relative to symlink dest, and not relative to the cwd (which used by the symlink-or-copy)
  // from the symlink-or-copy package readme -
  // If you pass a relative srcPath, it will be resolved relative to process.cwd(), akin to a copy function.
  // Note that this is unlike fs.symlinkSync, whose srcPath is relative to destPath.
  await Promise.all(symlinks.map((symlink) => symlink && symlink.writeWithNativeFS()));
}
