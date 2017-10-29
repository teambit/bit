/** @flow */
import R from 'ramda';
import Command from '../../command';
import { getConsumerComponent, getScopeComponent } from '../../../api/consumer';
import paintComponent from '../../templates/component-template';
import ConsumerComponent from '../../../consumer/component';
import { BitId } from '../../../bit-id';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show component overview.';
  alias = '';
  opts = [
    ['j', 'json', 'return a json version of the component'],
    ['v', 'versions', 'return a json of all the versions of the component'],
    ['o', 'outdated', 'show latest version from the remote scope (if exists)'],
    ['c', 'compare [boolean]', 'compare current file system component to latest tagged component [default=latest]']
  ];
  loader = true;

  action(
    [id]: [string],
    {
      json,
      versions,
      outdated,
      compare = false
    }: { json: ?boolean, versions: ?boolean, outdated: ?boolean, compare?: boolean }
  ): Promise<*> {
    function getBitComponent(allVersions: ?boolean) {
      const bitId = BitId.parse(id);
      if (bitId.isLocal()) return getConsumerComponent({ id, compare, showRemoteVersions: outdated });
      return getScopeComponent({ id, allVersions, showRemoteVersions: outdated });
    }

    if (versions) {
      return getBitComponent(versions).then(components => ({
        components,
        versions
      }));
    }

    return getBitComponent().then(({ component, componentModel }) => ({
      component,
      componentModel,
      json,
      outdated
    }));
  }

  report({
    component,
    componentModel,
    json,
    versions,
    components,
    outdated
  }: {
    component: ?ConsumerComponent,
    modelComponent?: ConsumerComponent,
    json: ?boolean,
    versions: ?boolean,
    components: ?(ConsumerComponent[]),
    outdated: ?boolean
  }): string {
    if (versions) {
      if (R.isNil(components) || R.isEmpty(components)) {
        return 'could not find the requested component';
      }
      // $FlowFixMe
      return JSON.stringify(components.map(c => c.toObject()));
    }

    if (!component) return 'could not find the requested component';
    return json ? component.toString() : paintComponent(component, componentModel, outdated);
  }
}
