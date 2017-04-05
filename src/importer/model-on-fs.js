// @flow
import path from 'path';
import R from 'ramda';
import { ComponentObject } from './component/component-types';
import { MODULE_NAME, MODULES_DIR } from '../constants';
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

export default (componentDependenciesArr: componentDependencies[], consumerPath: string):
Promise<void[]> => {
  const targetModuleDir = path.join(consumerPath, MODULES_DIR, MODULE_NAME);

  return Promise.all(componentDependenciesArr.map(cd => modelComponent(cd, targetModuleDir)));
};
