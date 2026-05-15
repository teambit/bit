import { Aspect } from '@teambit/core';

export const SchemaAspect = Aspect.create({
  id: 'teambit.semantics/schema',
  runtimes: { main: () => import('./schema.main.runtime') },
});
