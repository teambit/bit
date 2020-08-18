import { Aspect } from '../aspect';
import { manifestsMap } from './manifests';

export { manifestsMap };
export { default as BitExt, registerCoreExtensions } from './bit.manifest';

export const BitAspect = Aspect.create({
  id: '@teambit/bit',
  dependencies: Object.values(manifestsMap),
});

export default BitAspect;
