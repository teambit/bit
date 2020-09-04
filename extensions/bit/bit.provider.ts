import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { manifestsMap } from './manifests';


export type BitDeps = [];

export type BitConfig = {};

export async function provideBit() {
  const allCoreAspectsIds = Object.keys(manifestsMap);
  const coreAspectsPackagesAndIds = {};
  allCoreAspectsIds.forEach(id => {
    const packageName = getCoreAspectPackageName(id);
    coreAspectsPackagesAndIds[packageName] = id;
  });
  DependencyResolver.getCoreAspectsPackagesAndIds = () => coreAspectsPackagesAndIds;
  return {
    manifestsMap,
  };
}
