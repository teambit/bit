import { Aspect } from '@teambit/core';

export const GraphqlAspect = Aspect.create({
  id: 'teambit.harmony/graphql',
  runtimes: { main: () => import('./graphql.main.runtime') },
});

export default GraphqlAspect;
