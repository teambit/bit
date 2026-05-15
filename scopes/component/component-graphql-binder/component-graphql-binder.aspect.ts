import { Aspect } from '@teambit/core';

export const ComponentGraphqlBinderAspect = Aspect.create({
  id: 'teambit.component/component-graphql-binder',
  runtimes: { main: () => import('./component-graphql-binder.main.runtime') },
});

export default ComponentGraphqlBinderAspect;
