import { ComponentFactory } from '../component';
import Capsule from '../environment/capsule-builder';

type ComponentDeps = [Capsule];
type ComponentConfig = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function componentProvider(config: ComponentConfig, [capsule]: ComponentDeps) {
  return new ComponentFactory(capsule);
}
