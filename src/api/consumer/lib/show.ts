// @flow
import loader from '../../../cli/loader/loader';
import { getScopeComponent, getConsumerComponent } from '..';
import { BEFORE_SHOW_REMOTE } from '../../../cli/loader/loader-messages';

export default (async function show({
  id,
  json,
  versions,
  remote,
  outdated,
  compare,
  detailed,
  dependents,
  dependencies
}: {
  id: string,
  json: boolean,
  versions: ?boolean,
  remote: boolean,
  outdated: boolean,
  compare: boolean,
  detailed: boolean,
  dependents: boolean,
  dependencies: boolean
}) {
  if (versions) {
    return getComponent(versions).then(components => ({
      components,
      versions
    }));
  }
  return getComponent().then(({ component, componentModel, dependentsInfo, dependenciesInfo }) => ({
    component,
    componentModel,
    dependentsInfo,
    dependenciesInfo,
    json,
    outdated,
    detailed
  }));

  function getComponent(allVersions: ?boolean) {
    const params = {
      id,
      allVersions,
      showRemoteVersions: outdated,
      showDependents: dependents,
      showDependencies: dependencies
    };
    if (remote) {
      loader.start(BEFORE_SHOW_REMOTE);
      return getScopeComponent(params);
    }
    return getConsumerComponent({ ...params, compare });
  }
});
