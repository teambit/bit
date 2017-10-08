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
    ['c', 'compare [string]', 'compare current component to version [default=latest]']
  ];
  loader = true;

  action(
    [id]: [string],
    { json, versions, compare = true }: { json: ?boolean, versions: ?boolean, compare?: string }
  ): Promise<*> {
    function getBitComponent(allVersions: ?boolean) {
      const bitId = BitId.parse(id);
      if (bitId.isLocal()) return getConsumerComponent({ id, compare });
      return getScopeComponent({ id, allVersions });
    }

    if (versions) {
      return getBitComponent(versions).then(components => ({
        components,
        versions
      }));
    }

    return getBitComponent().then(({ component, modelComponent }) => ({
      component,
      modelComponent,
      json
    }));
  }

  report({
    component,
    modelComponent,
    json,
    versions,
    components
  }: {
    component: ?ConsumerComponent,
    modelComponent?: ConsumerComponent,
    json: ?boolean,
    versions: ?boolean,
    components: ?(ConsumerComponent[])
  }): string {
    if (versions) {
      if (R.isNil(components) || R.isEmpty(components)) {
        return 'could not find the requested component';
      }
      // $FlowFixMe
      return JSON.stringify(components.map(c => c.toObject()));
    }

    if (!component) return 'could not find the requested component';
    return json ? component.toString() : paintComponent(component, modelComponent);
  }
}
