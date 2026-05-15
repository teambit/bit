import { RuntimeDefinition } from '@teambit/harmony';
import { Aspect } from '@teambit/core';

export const PreviewRuntime = new RuntimeDefinition('preview');

export const PreviewAspect = Aspect.create({
  id: 'teambit.preview/preview',
  runtimes: { main: () => import('./preview.main.runtime') },
});

export default PreviewAspect;
