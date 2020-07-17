import { BIT_VERSION } from '../constants';

module.exports = function buildCommandMessage(payload, context, compress = true) {
  return {
    payload,
    headers: {
      version: BIT_VERSION,
      compressed: compress,
      context,
    },
  };
};
