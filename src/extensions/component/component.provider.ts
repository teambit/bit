import { ComponentFactory } from '../component';
import Isolator from '../isolator/isolator';

type ComponentDeps = [Isolator];
type ComponentConfig = {};

export default async function componentProvider(config: ComponentConfig, [isolate]: ComponentDeps) {
  return new ComponentFactory(isolate);
}
