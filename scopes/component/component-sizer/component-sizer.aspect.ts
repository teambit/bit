import { Aspect } from '../../harmony/harmony/aspect';

export const ComponentSizerAspect = Aspect.create({
  id: 'teambit.component/component-sizer',
  runtimes: { main: () => import('./component-sizer.main.runtime') },
});

export default ComponentSizerAspect;
