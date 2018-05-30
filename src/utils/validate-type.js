// @flow
import ValidationError from '../error/validation-error';

type Value = 'string' | 'number' | 'array' | 'object' | 'boolean' | 'undefined';

export default function validateType(message: string, value: any, fieldName: string, expectedType: Value) {
  let type = typeof value;
  if ((expectedType === 'array' || expectedType === 'object') && Array.isArray(value)) type = 'array';
  if (type !== expectedType) {
    throw new ValidationError(`${message}, expected ${fieldName} to be ${expectedType}, got ${type}`);
  }
}
