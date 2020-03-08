import { ComponentFactory } from '../component';
import Isolator from '../isolator/isolator';

type ComponentDeps = [Isolator];
type ComponentConfig = {};

export default async function componentProvider([isolate]: ComponentDeps) {
  return new ComponentFactory(isolate);
}
