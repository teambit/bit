import { camelCase } from '../../../utils';

/**
 * formats a string as identifier.
 */
export function toIdentifier(str: string) {
  return camelCase(str.replace('/', '$'));
}
