export type DependencyType = 'dev' | 'peer' | 'runtime';

export class Dependency {
  readonly type: DependencyType;
  constructor(type: DependencyType) {
    this.type = type;
  }
  stringify(): string {
    return this.type;
  }
}
