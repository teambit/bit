import { BIT_VERSION } from '../constants';

module.exports = function buildCommandMessage(payload, context) {
  return {
    payload,
    headers: {
      version: BIT_VERSION,
      context
    }
  };
};
