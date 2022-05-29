import { ComponentID } from '@teambit/component-id';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import { useComponentQuery } from './use-component-query';

export type Component = {
  component?: ComponentModel;
  error?: ComponentError;
  componentDescriptor?: ComponentDescriptor;
};

export function useComponent(host: string, id?: string | ComponentID): Component {
  const query = useQuery();
  const version = query.get('version') || undefined;
  const lanesContext = useLanesContext();

  const targetId =
    (typeof id === 'string' && id) || (typeof id !== 'undefined' && id.toString({ ignoreVersion: true }));
  if (!targetId) throw new TypeError('useComponent received no component id');
  const currentLane = lanesContext?.viewedLane;
  // when on a lane, always fetch all the logs starting from the 'head' version
  const laneComponentId = lanesContext?.viewedLane?.components.find(
    (component) => component.id.fullName === targetId
  )?.id;

  const componentIdStr = laneComponentId ? laneComponentId?.toString() : withVersion(targetId, version);

  const logFilters = currentLane
    ? {
        log: {
          logHead: laneComponentId?.version,
        },
      }
    : undefined;

  return useComponentQuery(componentIdStr, host, logFilters);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
