import type { BabelCLI } from './babel.cli';
import { Aspect } from '../../../aspect';

export type { BabelCLI };

export const BabelAspect = Aspect.create({
  id: '@teambit/babel',
  dependencies: [],
  files: [
    require.resolve('./babel.cli')
  ]
});

export default BabelAspect;
