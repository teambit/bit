import { Aspect } from '../../harmony/harmony/aspect';

export const ComponentAspect = Aspect.create({
  id: 'teambit.component/component',
  runtimes: { main: () => import('./component.main.runtime') },
  commands: () => import('./component.commands').then((m) => [m.showCommand, m.catCommand]),
});

export default ComponentAspect;
