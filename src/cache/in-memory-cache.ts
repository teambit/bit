export interface InMemoryCache<T> {
  set(key: string, value: T): void;
  get(key: string): T | undefined;
  delete(key: string): void;
  has(key: string): boolean;
  deleteAll(): void;
}
