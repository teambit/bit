import { Policy, PolicyVersion } from './policy';

export interface WorkspaceDependenciesPolicy {
  // There is no dev dependencies here since to decide if a dependency is a dev dependency or runtime dependency
  // we calculate it based on the dev files pattern
  dependencies?: WorkspaceLifecyclePolicyObject;
  peerDependencies?: WorkspaceLifecyclePolicyObject;
}

type WorkspaceLifecyclePolicyObject = {
  [dependencyId: string]: WorkspacePolicyEntry;
};

type WorkspacePolicyEntryValue = {};

type WorkspacePolicyEntry = {
  version: PolicyVersion;
  preserve?: boolean;
};

export class WorkspacePolicy implements Policy {
  findInPolicy(policy: DependenciesPolicy, packageName: string): PolicyDep | undefined {
    let result;
    forEachObjIndexed((depObject, keyName: DepObjectKeyName) => {
      if (!result && depObject[packageName]) {
        result = {
          packageName,
          version: depObject[packageName],
          lifecycleType: LIFECYCLE_TYPE_BY_KEY_NAME[keyName],
        };
      }
    }, policy);
    return result;
  }

  static fromObject(): WorkspacePolicy {}
}
