export class PubSubNoParentError extends Error {
  constructor() {
    super('could not connect to parent window');
    this.name = 'PubSubNoParentError';
  }
}
