import { BabelAspect } from '../babel/babel.aspect';
import { Aspect } from '../../../aspect';
import { Slot } from '../../../slots';
import { RuntimeDefinition } from '../../../runtimes';
import { UIAspect } from '../ui/ui.aspect';

export type Config = {};

export const CLIRuntime = RuntimeDefinition.create({ name: 'cli' })

export const ReactAspect = Aspect.create({
  id: '@teambit/react',
  dependencies: [UIAspect],
  defaultConfig: {},
  declareRuntime: CLIRuntime,
  files: [
    require.resolve('./react.cli'),
    require.resolve('./react.ui')
  ]
});

export default ReactAspect;
