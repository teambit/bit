import { Aspect } from '../harmony/aspect.js';

export const CLIAspect = Aspect.create({
  id: 'teambit.harmony/cli',
  dependencies: [],
  runtimes: {
    main: () => import('./cli.main.runtime.js'),
  },
});

export default CLIAspect;
