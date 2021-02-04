import chalk from 'chalk';
import R from 'ramda';

import { fetch } from '../../../api/consumer';
import { ImportDetails } from '../../../consumer/component-ops/import-components';
import { ComponentWithDependencies } from '../../../scope';
import { formatPlainComponentItemWithVersions } from '../../chalk-box';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Fetch implements LegacyCommand {
  name = 'fetch [ids...]';
  description = `fetch remote objects and store locally`;
  alias = '';
  private = true;
  opts = [
    ['l', 'lanes', 'EXPERIMENTAL. fetch lanes'],
    ['c', 'components', 'fetch components'],
    ['j', 'json', 'return the output as JSON'],
    [
      '',
      'from-original-scopes',
      'fetch indirect dependencies from their original scope as opposed to from their dependents',
    ],
  ] as CommandOptions;
  loader = true;

  action(
    [ids]: [string[]],
    {
      lanes = false,
      components = false,
      json = false,
      fromOriginalScope = false,
    }: {
      lanes?: boolean;
      components?: boolean;
      json?: boolean;
      fromOriginalScope?: boolean;
    }
  ): Promise<{}> {
    return fetch(ids, lanes, components, fromOriginalScope).then((results) => ({ ...results, json }));
  }

  report({
    dependencies,
    importDetails,
    json,
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
      const componentDependencies = components.map((component) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const details = importDetails.find((c) => c.id === component.id.toStringWithoutVersion());
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
