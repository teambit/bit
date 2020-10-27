import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const PreviewRuntime = new RuntimeDefinition('preview');

export const PreviewAspect = Aspect.create({
  id: 'teambit.preview/preview',
  dependencies: [],
  defaultConfig: {},
  declareRuntime: PreviewRuntime,
});

export default PreviewAspect;
