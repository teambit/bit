import { Aspect } from '../harmony/aspect';

export const GraphqlAspect = Aspect.create({
  id: 'teambit.harmony/graphql',
  runtimes: { main: () => import('./graphql.main.runtime') },
});

export default GraphqlAspect;
