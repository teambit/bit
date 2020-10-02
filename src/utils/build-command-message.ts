import { BIT_VERSION } from '../constants';

export function buildCommandMessage(payload, context, compress = true, extraHeaders = {}) {
  return {
    payload,
    headers: {
      version: BIT_VERSION,
      compressed: compress,
      ...extraHeaders,
      context,
    },
  };
}
