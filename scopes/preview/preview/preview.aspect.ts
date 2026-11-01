import { Aspect } from '@teambit/harmony';
import { PreviewRuntime } from '@teambit/harmony.modules.runtimes';

export { PreviewRuntime };

export const PreviewAspect = Aspect.create({
  id: 'teambit.preview/preview',
  dependencies: [],
  defaultConfig: {},
  declareRuntime: PreviewRuntime,
});

export default PreviewAspect;
