/** @flow */
import R from 'ramda';
import Command from '../../command';
import { getConsumerComponent, getScopeComponent } from '../../../api/consumer';
import paintComponent from '../../templates/component-template';
import ConsumerComponent from '../../../consumer/component';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { BEFORE_SHOW_REMOTE } from '../../../cli/loader/loader-messages';
import loader from '../../../cli/loader';

export default class Show extends Command {
  name = 'show <id>';
  description = `show component overview.\n https://${BASE_DOCS_DOMAIN}/docs/cli-show.html`;
  alias = '';
  opts = [
    ['j', 'json', 'return a json version of the component'],
    ['r', 'remote', 'show a remote component'],
    ['v', 'versions', 'return a json of all the versions of the component'],
    ['o', 'outdated', 'show latest version from the remote scope (if exists)'],
    ['c', 'compare [boolean]', 'compare current file system component to latest tagged component [default=latest]'],
    ['d', 'detailed', 'show more details']
  ];
  loader = true;
  migration = true;

  action(
    [id]: [string],
    {
      json,
      versions,
      remote = false,
      outdated = false,
      compare = false,
      detailed = false
    }: {
      json?: boolean,
      versions: ?boolean,
      remote: boolean,
      outdated?: boolean,
      compare?: boolean,
      detailed?: boolean
    }
  ): Promise<*> {
    function getBitComponent(allVersions: ?boolean) {
      if (remote) {
        loader.start(BEFORE_SHOW_REMOTE);
        return getScopeComponent({ id, allVersions, showRemoteVersions: outdated }).then(component => ({ component }));
      }
      return getConsumerComponent({ id, compare, allVersions, showRemoteVersions: outdated });
    }

    if (versions && (compare || outdated)) {
      throw new GeneralError('the [--compare] or [--outdated] flag cannot be used along with --versions');
    }

    if (versions) {
      return getBitComponent(versions).then(components => ({
        components,
        versions
      }));
    }
    if (compare && outdated) {
      throw new GeneralError('please make sure to use either [--compare] or [--outdated], alone');
    }
    return getBitComponent().then(({ component, componentModel }) => ({
      component,
      componentModel,
      json,
      outdated,
      detailed
    }));
  }

  report({
    component,
    componentModel,
    json,
    versions,
    components,
    outdated,
    detailed
  }: {
    component: ?ConsumerComponent,
    componentModel?: ConsumerComponent,
    json: ?boolean,
    versions: ?boolean,
    components: ?(ConsumerComponent[]),
    outdated: boolean,
    detailed: boolean
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
      const makeEnvFilesReadable = (env) => {
        if (!env) return undefined;
        if (env.files && env.files.length) {
          const readableFiles = env.files.map(file => file.toReadableString());
          return readableFiles;
        }
        return [];
      };

      const makeComponentReadable = (comp: ConsumerComponent) => {
        if (!comp) return comp;
        const componentObj = comp.toObject();
        componentObj.files = comp.files.map(file => file.toReadableString());
        componentObj.dists = componentObj.dists.getAsReadable();
        if (comp.compiler) {
          componentObj.compiler.files = makeEnvFilesReadable(comp.compiler);
        }
        if (comp.tester) {
          componentObj.tester.files = makeEnvFilesReadable(comp.tester);
        }
        return componentObj;
      };
      const componentFromFileSystem = makeComponentReadable(component);
      const componentFromModel = makeComponentReadable(componentModel);
      const jsonObject = componentFromModel ? { componentFromFileSystem, componentFromModel } : componentFromFileSystem;
      return JSON.stringify(jsonObject, null, '  ');
    }
    return paintComponent(component, componentModel, outdated, detailed);
  }
}
