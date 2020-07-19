export class HostNotFound extends Error {
  toString() {
    return `[component] error: host not found`;
  }
}
