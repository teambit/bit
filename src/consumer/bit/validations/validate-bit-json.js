/** @flow */
import Bit from '../bit';

export default (bit: Bit) => {
  return bit.bitJson.validate();
};
