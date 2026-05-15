import { Aspect } from '../../harmony/harmony/aspect';

export const SchemaAspect = Aspect.create({
  id: 'teambit.semantics/schema',
  runtimes: { main: () => import('./schema.main.runtime') },
});
