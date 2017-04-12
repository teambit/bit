// @flow
import R from 'ramda';
import { ComponentObject } from './component/component-types';
import Component from './component';

export type componentDependencies = {
  component: ComponentObject;
  dependencies: ComponentObject[];
};

function modelComponent({ component, dependencies }, targetModuleDir) {
  const allComponents = R.concat([component], dependencies);
  const parsedComponents = allComponents.map(Component.fromObject);
  return Promise.all(parsedComponents.map(c => c.write(targetModuleDir)));
}

export default (componentDependenciesArr: componentDependencies[], targetComponentDir: string):
Promise<void[]> =>
Promise.all(componentDependenciesArr.map(cd => modelComponent(cd, targetComponentDir)));
