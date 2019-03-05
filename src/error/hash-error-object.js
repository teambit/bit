// @flow

import hash from 'object-hash';
import yn from 'yn';
import { getSync } from '../api/consumer/lib/global-config';
import { CFG_ANALYTICS_ANONYMOUS_KEY } from '../constants';
import cloneErrorObject, { systemFields } from './clone-error-object';

export default function hashErrorIfNeeded(error: Error) {
  const clonedError = cloneErrorObject(error);
  const shouldHash = yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
  if (!shouldHash) return clonedError;
  const fields = Object.getOwnPropertyNames(clonedError);
  const fieldToHash = fields.filter(field => !systemFields.includes(field) && field !== 'message');
  if (!fieldToHash.length) return clonedError;
  fieldToHash.forEach((field) => {
    // $FlowFixMe
    clonedError[field] = hashValue(clonedError[field]);
  });
  return clonedError;
}

function hashValue(value: any): string {
  if (!value) return value;
  const type = typeof value;
  switch (type) {
    case 'undefined':
    case 'number':
    case 'boolean':
      return value;
    case 'object':
      if (Array.isArray(value)) return value.map(v => hash(v));
      return hash(value);
    default:
      return hash(value);
  }
}
