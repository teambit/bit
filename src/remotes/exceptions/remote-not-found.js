export default class RemoteNotFound extends Error {
  constructor(name) {
    super();
    this.name = name;
  }
}
