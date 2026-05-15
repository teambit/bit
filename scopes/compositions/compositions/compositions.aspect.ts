import { Aspect } from '../../harmony/harmony/aspect';

export const CompositionsAspect = Aspect.create({
  id: 'teambit.compositions/compositions',
  runtimes: { main: () => import('./compositions.main.runtime') },
});

export default CompositionsAspect;
