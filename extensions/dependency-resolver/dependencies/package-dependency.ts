import { Dependency } from './dependency';

export class PackageDependency extends Dependency {
  constructor(readonly packageName: string, version: string) {
    super(version);
  }
}
