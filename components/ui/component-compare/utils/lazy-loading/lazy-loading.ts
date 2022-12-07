import { isFunction } from 'lodash';

export type MaybeLazyLoaded<T> = T | (() => T);
export function extractLazyLoadedData<T>(data?: MaybeLazyLoaded<T>): T | undefined {
  if (isFunction(data)) return data();
  return data;
}
