export class CacheNotFoundError extends Error {
  get message() {
    return 'Cache error - cannot find node_modules or is not writeable';
  }
}
