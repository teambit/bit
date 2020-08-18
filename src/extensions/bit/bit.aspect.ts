import { Aspect } from '@teambit/harmony';
import { manifestsMap } from './manifests';
import { WorkspaceAspect } from '../workspace';

export { manifestsMap };
export { default as BitExt, registerCoreExtensions } from './bit.main.runtime';

export const BitAspect = Aspect.create({
  id: '@teambit/bit',
  // dependencies: Object.values(manifestsMap),
  dependencies: [WorkspaceAspect],
});

export default BitAspect;
