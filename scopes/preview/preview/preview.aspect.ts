import { RuntimeDefinition } from '@teambit/harmony';
import { Aspect } from '../../harmony/harmony/aspect';

export const PreviewRuntime = new RuntimeDefinition('preview');

export const PreviewAspect = Aspect.create({
  id: 'teambit.preview/preview',
  runtimes: { main: () => import('./preview.main.runtime') },
});

export default PreviewAspect;
