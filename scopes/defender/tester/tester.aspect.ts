import { Aspect } from '../../harmony/harmony/aspect';

export const TesterAspect = Aspect.create({
  id: 'teambit.defender/tester',
  runtimes: { main: () => import('./tester.main.runtime') },
  commands: () => import('./tester.commands').then((m) => [m.testCommand]),
});

export default TesterAspect;
