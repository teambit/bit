import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint, formatSection, formatItem, joinSections, successSymbol } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DeprecationMain } from './deprecation.main.runtime';

export class DeprecateCmd implements Command {
  name = 'deprecate <component-pattern>';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  description = 'mark components as deprecated to discourage their use';
  extendedDescription = `marks components as deprecated locally, then after snap/tag and export they become deprecated in the remote scope.
the pattern can match multiple components, so several can be deprecated at once.
optionally specify a replacement component (single component only) or deprecate only specific version ranges.
deprecated components remain available but display warnings when installed or imported.`;
  group = 'collaborate';
  skipWorkspace = true;
  alias = 'd';
  options = [
    [
      '',
      'new-id <string>',
      'if replaced by another component, enter the new component id. alternatively use "bit rename --deprecate" to do this automatically. only valid when the pattern matches a single component',
    ],
    [
      '',
      'range <string>',
      'enter a Semver range to deprecate specific versions. see https://www.npmjs.com/package/semver#ranges for the range syntax',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
  helpUrl = 'reference/components/removing-components';
  examples = [
    {
      cmd: 'deprecate "ui/**"',
      description: 'deprecate all components whose id starts with "ui/"',
    },
  ];

  constructor(private deprecation: DeprecationMain) {}

  async report([pattern]: [string], { newId, range }: { newId?: string; range?: string }): Promise<string> {
    const { deprecated, alreadyDeprecated } = await this.deprecation.deprecateByPattern(pattern, newId, range);

    // preserve the familiar single-line message when only one component is affected
    if (deprecated.length === 1 && !alreadyDeprecated.length) {
      return formatSuccessSummary(`the component "${deprecated[0].toString()}" has been deprecated successfully`);
    }
    if (!deprecated.length) {
      return formatHint(
        `all ${alreadyDeprecated.length} component(s) matching "${pattern}" are already deprecated. no changes have been made`
      );
    }

    const sections = [
      formatSuccessSummary(`${deprecated.length} component(s) have been deprecated successfully`),
      formatSection(
        'deprecated',
        '',
        deprecated.map((id) => formatItem(id.toString(), successSymbol()))
      ),
      formatSection(
        'already deprecated',
        'no changes were made to these',
        alreadyDeprecated.map((id) => formatItem(id.toString()))
      ),
    ];
    return joinSections(sections);
  }
}
