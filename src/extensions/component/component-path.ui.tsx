import { ComponentID } from './id';

export function componentToUrl(id: ComponentID | string) {
  if (typeof id === 'string') {
    return `/${id}`;
  }

  return `/${id.fullName}`;
}
