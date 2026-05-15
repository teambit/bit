import { Aspect } from '@teambit/core';

export const RefactoringAspect = Aspect.create({
  id: 'teambit.component/refactoring',
  runtimes: { main: () => import('./refactoring.main.runtime') },
});
