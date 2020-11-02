import { Policy } from './policy';

export interface DependenciesPolicy extends WorkspaceDependenciesPolicy {
  devDependencies?: DependenciesPolicyObject;
}

export class VariantPolicy {}
