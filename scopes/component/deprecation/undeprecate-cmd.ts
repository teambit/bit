import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint, formatSection, formatItem, joinSections } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DeprecationMain } from './deprecation.main.runtime';

export class UndeprecateCmd implements Command {
  name = 'undeprecate <component-pattern>';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  group = 'collaborate';
  description = 'remove the deprecation status from components';
  extendedDescription = `reverses the deprecation of components, removing warnings and allowing normal use again.
the pattern can match multiple components, so several can be undeprecated at once.`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;
  examples = [
    {
      cmd: 'undeprecate "$deprecated"',
      description: 'undeprecate all currently-deprecated components',
    },
  ];

  constructor(private deprecation: DeprecationMain) {}

  async report([pattern]: [string]): Promise<string> {
    const { undeprecated, notDeprecated } = await this.deprecation.unDeprecateByPattern(pattern);

    // preserve the familiar single-line message when only one component is affected
    if (undeprecated.length === 1 && !notDeprecated.length) {
      return formatSuccessSummary(`the component "${undeprecated[0].toString()}" has been undeprecated successfully`);
    }
    if (!undeprecated.length) {
      return formatHint(
        `none of the ${notDeprecated.length} component(s) matching "${pattern}" are currently deprecated. no changes have been made`
      );
    }

    const sections = [
      formatSuccessSummary(`${undeprecated.length} component(s) have been undeprecated successfully`),
      formatSection(
        'undeprecated',
        '',
        undeprecated.map((id) => formatItem(id.toString()))
      ),
      formatSection(
        'not deprecated',
        'no changes were made to these',
        notDeprecated.map((id) => formatItem(id.toString()))
      ),
    ];
    return joinSections(sections);
  }
}
