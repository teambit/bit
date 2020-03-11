type DependencyTypes = 'dev' | 'peer' | 'runtime';

export class Dependency {
  readonly type: DependencyTypes;
  constructor(type: DependencyTypes) {
    this.type = type;
  }
  toString(): string {
    return this.type;
  }
}
