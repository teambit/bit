import { BitError } from '@teambit/bit-error';
import { ValidationError } from '@teambit/legacy.cli.error';

type Value = 'string' | 'number' | 'array' | 'object' | 'boolean' | 'undefined';

export function validateType(message: string, value: any, fieldName: string, expectedType: Value) {
  validate(message, value, fieldName, expectedType, false);
}

export function validateUserInputType(message: string, value: any, fieldName: string, expectedType: Value) {
  validate(message, value, fieldName, expectedType, true);
}

function validate(message: string, value: any, fieldName: string, expectedType: Value, isUserInput: boolean) {
  let type = typeof value;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if ((expectedType === 'array' || expectedType === 'object') && Array.isArray(value)) type = 'array';
  if (type !== expectedType) {
    const errorMessage = `${message}, expected ${fieldName} to be ${expectedType}, got ${type}`;
    if (isUserInput) throw new BitError(errorMessage);
    throw new ValidationError(`${message}, expected ${fieldName} to be ${expectedType}, got ${type}`);
  }
}
