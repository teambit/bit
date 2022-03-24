import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';

export class ComponentIssuesCmd implements Command {
  name = 'component-issues';
  description = 'list available component-issues';
  alias = '';
  options = [] as CommandOptions;
  loader = true;

  constructor(docsDomain: string, private snapping: SnappingMain) {
    this.description = `record component changes.
https://${docsDomain}/components/snaps
${WILDCARD_HELP('snap')}`;
  }

  async report() {
    const;
  }
}
