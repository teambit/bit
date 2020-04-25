import path from 'path';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import Symlink from '../../links/symlink';

export async function symlinkDependenciesToCapsules(capsules: Capsule[], capsuleList: CapsuleList) {
  await Promise.all(
    capsules.map(capsule => {
      // @ts-ignore
      return symlinkComponent(capsule.component, capsuleList);
    })
  );
}

async function symlinkComponent(component: ConsumerComponent, capsuleList: CapsuleList) {
  const componentCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(component.id);
  if (!componentCapsule) throw new Error(`unable to find the capsule for ${component.id.toString()}`);
  const allDeps = component.getAllDependenciesIds();
  const symlinks = allDeps.map((depId: BitId) => {
    const packageName = componentIdToPackageName(depId, component.bindingPrefix, component.defaultScope);
    const devCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(depId);
    if (!devCapsule) throw new Error(`unable to find the capsule for ${depId.toStringWithoutVersion()}`);
    const devCapsulePath = devCapsule.wrkDir;
    // @todo: this is a hack, the capsule should be the one responsible to symlink, this works only for FS capsules.
    const dest = path.join(componentCapsule.wrkDir, 'node_modules', packageName);
    return new Symlink(devCapsulePath, dest, component.id);
  });
  await Promise.all(symlinks.map(symlink => symlink.write()));
}
