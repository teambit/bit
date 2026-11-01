import { getConsumerComponent } from './get-consumer-component';
import { getScopeComponent } from './get-scope-component';
import { loader } from '@teambit/legacy.loader';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { DependenciesInfo } from '@teambit/legacy.dependency-graph';

const BEFORE_SHOW_REMOTE = 'showing a component...';

type ShowComponentResult = {
  component: ConsumerComponent | ConsumerComponent[];
  componentModel?: ConsumerComponent;
  dependentsInfo?: DependenciesInfo[];
  dependenciesInfo?: DependenciesInfo[];
};

export async function show({
  id,
  json,
  remote,
  compare,
}: {
  id: string;
  json?: boolean;
  remote: boolean;
  compare: boolean;
}) {
  return getComponent().then(({ component, componentModel, dependentsInfo, dependenciesInfo }) => ({
    component,
    componentModel,
    dependentsInfo,
    dependenciesInfo,
    json,
  }));

  function getComponent(): Promise<ShowComponentResult> {
    const params = {
      id,
    };
    if (remote) {
      loader.start(BEFORE_SHOW_REMOTE);
      return getScopeComponent(params);
    }
    return getConsumerComponent({ ...params, compare });
  }
}
