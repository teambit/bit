import { ComponentID } from '@teambit/component';
import { LinkDetail } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { BitId } from '@teambit/legacy-bit-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import path from 'path';

import { Capsule } from './capsule';
import CapsuleList from './capsule-list';

export async function symlinkDependenciesToCapsules(
  capsules: Capsule[],
  capsuleList: CapsuleList,
  logger: Logger
): Promise<Record<string, Record<string, string>>> {
  logger.debug(`symlinkDependenciesToCapsules, ${capsules.length} capsules`);
  return Object.fromEntries(
    await Promise.all(
      capsules.map((capsule) => {
        return symlinkComponent(capsule.component.state._consumer, capsuleList, logger);
      })
    )
  );
}

export async function symlinkOnCapsuleRoot(
  capsuleList: CapsuleList,
  logger: Logger,
  capsuleRoot: string
): Promise<LinkDetail[]> {
  const modulesPath = path.join(capsuleRoot, 'node_modules');
  return capsuleList.map((capsule) => {
    const packageName = componentIdToPackageName(capsule.component.state._consumer);
    const dest = path.join(modulesPath, packageName);
    return {
      from: capsule.path,
      to: dest,
      packageName,
    };
  });
}

async function symlinkComponent(
  component: ConsumerComponent,
  capsuleList: CapsuleList,
  logger: Logger
): Promise<[string, Record<string, string>]> {
  const componentCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(new ComponentID(component.id));
  if (!componentCapsule) throw new Error(`unable to find the capsule for ${component.id.toString()}`);
  const allDeps = component.getAllDependenciesIds();
  const linkResults = allDeps.reduce((acc, depId: BitId) => {
    // TODO: this is dangerous - we might have 2 capsules for the same component with different version, then we might link to the wrong place
    const devCapsule = capsuleList.getCapsuleIgnoreScopeAndVersion(new ComponentID(depId));
    if (!devCapsule) {
      // happens when a dependency is not in the workspace. (it gets installed via the package manager)
      logger.debug(
        `symlinkComponentToCapsule: unable to find the capsule for ${depId.toStringWithoutVersion()}. skipping`
      );
      return acc;
    }
    const packageName = componentIdToPackageName(devCapsule.component.state._consumer);
    const devCapsulePath = devCapsule.path;
    acc[packageName] = `link:${devCapsulePath}`;
    return acc;
  }, {});

  return [componentCapsule.path, linkResults];
}
