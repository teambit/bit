export class Identifier {
  constructor(readonly id: string, readonly filePath: string) {}

  isEqual(identifier: Identifier): boolean {
    return this.id === identifier.id && this.filePath === identifier.filePath;
  }
}
