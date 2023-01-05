export class Identifier {
  constructor(readonly id: string, readonly filePath: string, readonly aliasId?: string) {}

  isEqual(identifier: Identifier): boolean {
    if (this.filePath !== identifier.filePath) return false;
    if (Identifier.isDefault(identifier) && Identifier.isDefault(this)) {
      return true;
    }
    if (Identifier.isDefault(identifier) || Identifier.isDefault(this)) {
      return false;
    }
    return this.id === identifier.id;
  }

  static isDefault(identifier: Identifier) {
    return identifier.id === 'default';
  }
}
