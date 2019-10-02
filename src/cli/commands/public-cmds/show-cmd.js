/** @flow */
import Command from '../../command';
import { show } from '../../../api/consumer';
import paintComponent from '../../templates/component-template';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';
import type { DependenciesInfo } from '../../../scope/graph/scope-graph';

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
    ['d', 'detailed', 'show more details'],
    ['', 'dependents', 'EXPERIMENTAL. show all dependents recursively'],
    ['', 'dependencies', 'EXPERIMENTAL. show all dependencies recursively']
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
      detailed = false,
      dependents = false,
      dependencies = false
    }: {
      json?: boolean,
      versions: ?boolean,
      remote: boolean,
      outdated?: boolean,
      compare?: boolean,
      detailed?: boolean,
      dependents?: boolean,
      dependencies?: boolean
    }
  ): Promise<*> {
    if (versions && (compare || outdated)) {
      throw new GeneralError('the [--compare] or [--outdated] flag cannot be used along with --versions');
    }
    if (versions && remote) {
      throw new GeneralError('the [--versions] and [--remote] flags cannot be used together');
    }
    if (compare && outdated) {
      throw new GeneralError('please make sure to use either [--compare] or [--outdated], alone');
    }

    return show({
      id,
      json,
      versions,
      remote,
      outdated,
      compare,
      detailed,
      dependents,
      dependencies
    });
  }

  report({
    component,
    componentModel,
    dependenciesInfo,
    dependentsInfo,
    json,
    versions,
    components,
    outdated,
    detailed
  }: {
    component: ConsumerComponent,
    componentModel?: ConsumerComponent,
    dependenciesInfo: DependenciesInfo[],
    dependentsInfo: DependenciesInfo[],
    json: ?boolean,
    versions: ?boolean,
    components: ?(ConsumerComponent[]),
    outdated: boolean,
    detailed: boolean
  }): string {
    if (versions) {
      // $FlowFixMe
      return JSON.stringify(components.map(c => c.toObject()), null, '  ');
    }
    if (component.componentFromModel) {
      component.scopesList = component.componentFromModel.scopesList;
    }
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
      if (dependenciesInfo) {
        componentFromFileSystem.dependenciesInfo = dependenciesInfo;
      }
      if (dependentsInfo) {
        componentFromFileSystem.dependentsInfo = dependentsInfo;
      }
      if (component.scopesList) {
        componentFromFileSystem.scopesList = component.scopesList;
      }
      const componentFromModel = componentModel ? makeComponentReadable(componentModel) : undefined;
      const jsonObject = componentFromModel ? { componentFromFileSystem, componentFromModel } : componentFromFileSystem;
      return JSON.stringify(jsonObject, null, '  ');
    }
    return paintComponent(component, componentModel, outdated, detailed, dependenciesInfo, dependentsInfo);
  }
}
