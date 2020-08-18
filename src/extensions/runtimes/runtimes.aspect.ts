import { Aspect } from './aspect';
import type { RuntimesCLI } from './runtimes.cli';

const RuntimesAspect = Aspect.create({
  id: '@teambit/runtimes',
});

export { RuntimesCLI };
export default RuntimesAspect;
