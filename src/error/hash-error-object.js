// @flow

import hash from 'object-hash';
import yn from 'yn';
import { getSync } from '../api/consumer/lib/global-config';
import { CFG_ANALYTICS_ANONYMOUS_KEY } from '../constants';
import AbstractError, { systemFields } from './abstract-error';

export default function hashErrorIfNeeded(error: AbstractError) {
  const clonedError = error.clone();
  const shouldHash = yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
  if (!shouldHash) return clonedError;
  const fields = Object.getOwnPropertyNames(clonedError);
  const fieldToHash = fields.filter(field => !systemFields.includes(field));
  if (!fieldToHash.length) return clonedError;
  fieldToHash.forEach((field) => {
    clonedError[field] = hashValue(clonedError[field]);
  });
  return clonedError;
}

function hashValue(value: any): string {
  if (!value) return value;
  const type = typeof value;
  switch (type) {
    case 'object':
      if (Array.isArray(value)) return value.map(v => hash(v));
      return hash(value);
    default:
      return hash(value);
  }
}
