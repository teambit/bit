import type { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { Extensions } from '@teambit/legacy.constants';

/**
 * whether the given id is the env of the component, according to the data the envs aspect calculated on load.
 * returns undefined when this data is missing.
 */
export function isEnvOfComponent(component: Component, id: ComponentID): boolean | undefined {
  const envId: string | undefined = component.state.aspects.get(Extensions.envs)?.data?.id;
  if (!envId) return undefined;
  return ComponentID.fromString(envId).isEqualWithoutVersion(id);
}
