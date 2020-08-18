import { Aspect } from '@teambit/harmony';
import { manifestsMap } from './manifests';
import { DummyAspect } from '../dummy';

export { manifestsMap };
export { default as BitExt, registerCoreExtensions } from './bit.manifest';

export const BitAspect = Aspect.create({
  id: '@teambit/bit',
  // dependencies: Object.values(manifestsMap),
  dependencies: [DummyAspect],
});

export default BitAspect;
