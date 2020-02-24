export class Dependency {
  type: 'dev' | 'peer' | 'regular';
  constructor(type) {
    this.type = type;
  }
  toString(): string {
    return this.type;
  }
}
