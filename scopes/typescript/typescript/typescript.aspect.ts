import { Aspect } from '../../harmony/harmony/aspect';

export const TypescriptAspect = Aspect.create({
  id: 'teambit.typescript/typescript',
  runtimes: { main: () => import('./typescript.main.runtime') },
});
