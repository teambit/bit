import { Aspect } from '../../harmony/harmony/aspect';

export const NewComponentHelperAspect = Aspect.create({
  id: 'teambit.component/new-component-helper',
  runtimes: { main: () => import('./new-component-helper.main.runtime') },
});
