import { Aspect } from '@teambit/core';

export const WebpackAspect = Aspect.create({
  id: 'teambit.webpack/webpack',
  runtimes: { main: () => import('./webpack.main.runtime') },
});
