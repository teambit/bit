export class ArtifactDefinitionError extends Error {
  constructor() {
    super(`must include glob or directories`);
  }
}
