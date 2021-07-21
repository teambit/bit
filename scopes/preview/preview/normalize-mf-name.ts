import { camelCase } from 'lodash';

export function normalizeMfName(componentId: string): string {
  return camelCase(componentId);
}
