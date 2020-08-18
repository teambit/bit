import { Aspect } from '../aspect';

export const GraphQLAspect = Aspect.create({
  id: '@teambit/graphql',
  defaultConfig: {},
  files: [require.resolve('./graphql.extension'), require.resolve('./graphql.ui')],
});

export default GraphQLAspect;
