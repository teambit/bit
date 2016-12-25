/** @flow */
import BitJson from '../../bit-json';
import loadPlugin from '../environment/load-plugin';

const createSpec = (bitJson: BitJson): string => {
  return loadPlugin(bitJson.getTesterName())
  .then(testerModule => testerModule.getTemplate(bitJson.name));
};

export default createSpec;
