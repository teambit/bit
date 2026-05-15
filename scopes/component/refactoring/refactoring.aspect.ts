import { Aspect } from '../../harmony/harmony/aspect';

export const RefactoringAspect = Aspect.create({
  id: 'teambit.component/refactoring',
  runtimes: { main: () => import('./refactoring.main.runtime') },
});
