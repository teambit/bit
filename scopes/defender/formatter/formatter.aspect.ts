import { Aspect } from '../../harmony/harmony/aspect';

export const FormatterAspect = Aspect.create({
  id: 'teambit.defender/formatter',
  runtimes: { main: () => import('./formatter.main.runtime') },
  commands: () => import('./formatter.commands').then((m) => [m.formatCommand]),
});
