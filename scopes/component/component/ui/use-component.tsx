import { useRouteMatch } from 'react-router-dom';
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

type ComponentRoute = {
  componentId?: string;
};

export function useComponent(host: string, id?: ComponentID): Component {
  const {
    params: { componentId },
  } = useRouteMatch<ComponentRoute>();
  const query = useQuery();
  const version = query.get('version') || undefined;
  const lanesContext = useLanesContext();
  const targetId = id?.toString({ ignoreVersion: true }) || componentId;
  if (!targetId) throw new TypeError('useComponent received no component id');
  const currentLane = lanesContext?.currentLane;
  // when on a lane, always fetch all the logs starting from the 'head' version
  const logHead = lanesContext?.currentLane?.components.find((component) => component.model.id.fullName === targetId)
    ?.model.id.version;
  const logFilters = currentLane
    ? {
        log: {
          logHead,
        },
      }
    : undefined;

  return useComponentQuery(withVersion(targetId, version), host, logFilters);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
