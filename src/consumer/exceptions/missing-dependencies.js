/** @flow */
export default class MissingDependencies extends Error {
  components: Object;

  constructor(components) {
    super();
    this.components = components;
  }
}
