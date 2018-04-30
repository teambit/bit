/** @flow */
import R from 'ramda';
import Command from '../../command';
import { getConsumerComponent, getScopeComponent } from '../../../api/consumer';
import paintComponent from '../../templates/component-template';
import ConsumerComponent from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Show extends Command {
  name = 'show <id>';
  description = `show component overview.\n https://${BASE_DOCS_DOMAIN}/docs/cli-show.html`;
  alias = '';
  opts = [
    ['j', 'json', 'return a json version of the component'],
    ['v', 'versions', 'return a json of all the versions of the component'],
    ['o', 'outdated', 'show latest version from the remote scope (if exists)'],
    ['c', 'compare [boolean]', 'compare current file system component to latest tagged component [default=latest]']
  ];
  loader = true;
  migration = true;

  action(
    [id]: [string],
    {
      json,
      versions,
      outdated = false,
      compare = false
    }: { json?: boolean, versions: ?boolean, outdated?: boolean, compare?: boolean }
  ): Promise<*> {
    function getBitComponent(allVersions: ?boolean) {
      const bitId = BitId.parse(id);
      if (bitId.isLocal()) return getConsumerComponent({ id, compare, allVersions, showRemoteVersions: outdated });
      return getScopeComponent({ id, allVersions, showRemoteVersions: outdated });
    }

    if (versions && (compare || outdated)) {
      return Promise.reject('the [--compare] or [--outdated] flag cannot be used along with --versions');
    }

    if (versions) {
      return getBitComponent(versions).then(components => ({
        components,
        versions
      }));
    }
    if (compare && outdated) return Promise.reject('please make sure to use either [--compare] or [--outdated], alone');
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
    componentModel?: ConsumerComponent,
    json: ?boolean,
    versions: ?boolean,
    components: ?(ConsumerComponent[]),
    outdated: boolean
  }): string {
    if (versions) {
      if (R.isNil(components) || R.isEmpty(components)) {
        return 'could not find the requested component';
      }

      // $FlowFixMe
      return JSON.stringify(components.map(c => c.toObject()), null, '  ');
    }

    if (!component) return 'could not find the requested component';
    if (json) {
      const makeComponentReadable = (comp: ConsumerComponent) => {
        if (!comp) return comp;
        const componentObj = comp.toObject();
        componentObj.files = comp.files.map(file => file.toReadableString());
        componentObj.dists = componentObj.dists.getAsReadable();
        return componentObj;
      };
      const componentFromFileSystem = makeComponentReadable(component);
      const componentFromModel = makeComponentReadable(componentModel);
      const jsonObject = componentFromModel ? { componentFromFileSystem, componentFromModel } : componentFromFileSystem;
      return JSON.stringify(jsonObject, null, '  ');
    }
    return paintComponent(component, componentModel, outdated);
  }
}
