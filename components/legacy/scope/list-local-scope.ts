import type { ComponentID } from '@teambit/component-id';
import type { ModelComponent } from '@teambit/objects';
import { isBitIdMatchByWildcards } from '@teambit/legacy.utils';
import type Scope from './scope';

export type ListScopeResult = {
  id: ComponentID;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  removed?: boolean;
  laneReadmeOf?: string[];
};

/**
 * list the components of a local scope, the way a remote serves its list.
 */
export async function listLocalScope(
  scope: Scope,
  namespacesUsingWildcards?: string,
  includeRemoved = false
): Promise<ListScopeResult[]> {
  const components = await scope.listLocal();
  const componentsOnMain = components.filter((comp) => comp.head);
  const getNameSpaceIncludeScopeNameIfNeeded = () => {
    if (!namespacesUsingWildcards) return undefined;
    if (namespacesUsingWildcards.startsWith(`${scope.name}/`)) return namespacesUsingWildcards;
    return `${scope.name}/${namespacesUsingWildcards}`;
  };
  const nameSpaceIncludeScopeName = getNameSpaceIncludeScopeNameIfNeeded();
  const componentsFilteredByWildcards = nameSpaceIncludeScopeName
    ? componentsOnMain.filter((component) =>
        isBitIdMatchByWildcards(component.toComponentId(), nameSpaceIncludeScopeName)
      )
    : componentsOnMain;
  const componentsSorted = sortByName(componentsFilteredByWildcards);
  const results = await Promise.all(
    componentsSorted.map(async (component: ModelComponent) => {
      return {
        id: component.toComponentIdWithLatestVersion(),
        deprecated: Boolean(await component.isDeprecated(scope.objects)),
        removed: Boolean(await component.isRemoved(scope.objects)),
        laneReadmeOf: await component.isLaneReadmeOf(scope.objects),
      };
    })
  );
  if (includeRemoved) return results;
  return results.filter((result) => !result.removed);
}

function sortByName(components: ModelComponent[]): ModelComponent[] {
  const getName = (component: ModelComponent) => component.id().toUpperCase(); // ignore upper and lowercase
  return components.sort((a, b) => {
    const nameA = getName(a);
    const nameB = getName(b);
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}
