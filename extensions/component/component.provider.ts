import { ComponentFactory } from '../component';
import { Isolator } from '@bit/bit.core.isolator';

type ComponentDeps = [Isolator];
type ComponentConfig = {};

export default async function componentProvider([isolate]: ComponentDeps) {
  return new ComponentFactory(isolate);
}
