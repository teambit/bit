export class HostNotFound extends Error {
  constructor(
    /**
     * name of the host.
     */
    private hostName: string
  ) {
    super();
  }

  toString() {
    return `[component] error: host '${this.hostName}' was not found`;
  }
}
