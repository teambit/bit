import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { fetch } from '../../../api/consumer';
import { ComponentWithDependencies } from '../../../scope';
import { ImportDetails } from '../../../consumer/component-ops/import-components';
import { formatPlainComponentItemWithVersions } from '../../chalk-box';

export default class Fetch extends Command {
  name = 'fetch [ids...]';
  description = `fetch remote objects and store locally`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['l', 'lanes', 'fetch lanes'],
    ['c', 'components', 'fetch components'],
    ['j', 'json', 'return the output as JSON']
  ];
  loader = true;

  action(
    [ids]: [string[]],
    {
      lanes = false,
      components = false,
      json = false
    }: {
      lanes?: boolean;
      components?: boolean;
      json?: boolean;
    }
  ): Promise<{}> {
    return fetch(ids, lanes, components).then(results => ({ ...results, json }));
  }

  report({
    dependencies,
    importDetails,
    json
  }: {
    dependencies?: ComponentWithDependencies[];
    importDetails: ImportDetails[];
    json: boolean;
  }): string {
    if (json) {
      return JSON.stringify({ importDetails }, null, 4);
    }
    if (dependencies && !R.isEmpty(dependencies)) {
      const components = dependencies.map(R.prop('component'));
      const title =
        components.length === 1
          ? 'successfully fetched one component'
          : `successfully fetched ${components.length} components`;
      const componentDependencies = components.map(component => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const details = importDetails.find(c => c.id === component.id.toStringWithoutVersion());
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (!details) throw new Error(`missing details of component ${component.id.toString()}`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return formatPlainComponentItemWithVersions(component, details);
      });
      const componentDependenciesOutput = [chalk.green(title)].concat(componentDependencies).join('\n');

      return componentDependenciesOutput;
    }
    return chalk.yellow('nothing to import');
  }
}
