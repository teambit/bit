import { Aspect } from '../../harmony/harmony/aspect';

export const WebpackAspect = Aspect.create({
  id: 'teambit.webpack/webpack',
  runtimes: { main: () => import('./webpack.main.runtime') },
});
