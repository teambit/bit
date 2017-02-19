/** @flow */
import R from 'ramda';
import Command from '../../command';
import { getInlineBit, getScopeBit } from '../../../api/consumer';
import paintComponent from '../../templates/component-template';
import ConsumerComponent from '../../../consumer/component';

export default class Show extends Command {
  name = 'show <id>';
  description = 'show a component';
  alias = '';
  opts = [
    ['i', 'inline', 'show inline component'],
    ['j', 'json', 'return a json version of the component'],
    ['ver', 'versions', 'return a json of all the versions of the component'],
  ];
  loader = true;

  action([id, ]: [string], { inline, json, versions }:
  { inline: ?bool, json: ?bool, versions: ?bool }): Promise<*> {
    
    function getBitComponent(allVersions: ?bool) {
      if (inline) return getInlineBit({ id });
      return getScopeBit({ id, allVersions });
    }
    
    if (versions) {
      return getBitComponent(versions)
      .then(components => ({
        components,
        versions,
      }));
    }

    return getBitComponent()
    .then(component => ({
      component,
      json,
    }));
  }

  report({ component, json, versions, components }: { 
    component: ?ConsumerComponent,
    json: ?bool,
    versions: ?bool,
    components: ?ConsumerComponent[]
  }): string {
    if (versions) {
      if (R.isNil(components) || R.isEmpty(components)) {
        return 'could not find the requested component';
      }
      // $FlowFixMe
      return JSON.stringify(components.map(c => c.toObject()));
    }

    if (!component) return 'could not find the requested component';
    return json ? component.toString() : paintComponent(component);
  }
}
