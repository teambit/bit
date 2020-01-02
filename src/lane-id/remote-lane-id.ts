export default class RemoteLaneId {
  name: string;
  scope: string;
  constructor({ name, scope }: { name: string; scope: string }) {
    this.name = name;
    this.scope = scope;
  }
  hasSameName(id: RemoteLaneId): boolean {
    return this.name === id.name;
  }
  hasSameScope(id: RemoteLaneId): boolean {
    return this.scope === id.scope;
  }
  isEqual(laneId: RemoteLaneId) {
    return this.hasSameName(laneId) && this.hasSameScope(laneId);
  }
  toString(): string {
    const delimiter = ':';
    return this.scope + delimiter + this.name;
  }
  static from(scope: string, name: string): RemoteLaneId {
    return new RemoteLaneId({ scope, name });
  }
}
