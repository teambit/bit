import { Aspect } from '@teambit/core';

export const IssuesAspect = Aspect.create({
  id: 'teambit.component/issues',
  runtimes: { main: () => import('./issues.main.runtime') },
  commands: () => import('./issues.commands').then((m) => [m.componentIssuesCommand]),
});
