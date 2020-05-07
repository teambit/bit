import ComponentFactory from './component-factory';
import { Isolator } from '../isolator';

type ComponentDeps = [Isolator];
type ComponentConfig = {};

export default async function componentProvider([isolate]: ComponentDeps) {
  return new ComponentFactory(isolate);
}
