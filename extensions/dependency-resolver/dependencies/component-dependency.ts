import { ComponentID } from "@teambit/component";

import { Dependency } from './dependency';

export class ComponentDependency extends Dependency {
  constructor(readonly id: ComponentID, version: string) {
    super(version);
  }
}
