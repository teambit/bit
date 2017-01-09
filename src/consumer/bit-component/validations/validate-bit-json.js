/** @flow */
import Bit from '../bit-component';

export default (bit: Bit) => {
  return bit.bitJson.validate();
};
