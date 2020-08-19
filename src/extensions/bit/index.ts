import { Aspect } from '@teambit/harmony';
import { manifestsMap } from './manifests';
// import { DummyAspect } from '../dummy';

export { manifestsMap };
export { registerCoreExtensions } from './bit.main.runtime';

export const BitAspect = Aspect.create({
  id: '@teambit/bit',
  dependencies: Object.values(manifestsMap),
  // dependencies: [DummyAspect],
});

export default BitAspect;
