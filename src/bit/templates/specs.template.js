/** @flow */
import type { BitProps } from '../bit';
import loadTranspiler from '../environment/load-transpiler';

const createSpec = ({ name, tester }: BitProps): string => {
  return loadTranspiler(tester).then(testerModule => testerModule.getTemplate(name));
};

export default createSpec;
