import { BIT_VERSION } from '../constants';

module.exports = function buildCommandMessage(payload) {
  return {
    payload,
    headers: {
      version: BIT_VERSION
    }
  };
};
