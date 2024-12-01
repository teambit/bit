import { getConsumerComponent } from './get-consumer-component';
import { getScopeComponent } from './get-scope-component';
import { loader } from '@teambit/legacy.loader';

const BEFORE_SHOW_REMOTE = 'showing a component...';

export async function show({
  id,
  json,
  remote,
  compare,
}: {
  id: string;
  json: boolean;
  remote: boolean;
  compare: boolean;
}) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getComponent().then(({ component, componentModel, dependentsInfo, dependenciesInfo }) => ({
    component,
    componentModel,
    dependentsInfo,
    dependenciesInfo,
    json,
  }));

  function getComponent(allVersions: boolean | null | undefined) {
    const params = {
      id,
      allVersions,
    };
    if (remote) {
      loader.start(BEFORE_SHOW_REMOTE);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return getScopeComponent(params);
    }
    return getConsumerComponent({ ...params, compare });
  }
}
