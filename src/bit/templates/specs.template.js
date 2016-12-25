/** @flow */
import type { BitProps } from '../bit';
import loadCompiler from '../environment/load-compiler';

const createSpec = ({ name, tester }: BitProps): string => {
  return loadCompiler(tester).then(testerModule => testerModule.getTemplate(name));
};

export default createSpec;
