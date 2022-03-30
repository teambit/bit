import { BitError } from '@teambit/bit-error';
import IssuesAspect from '@teambit/issues';
import { formatIssues } from '@teambit/legacy/dist/cli/templates/component-issues-template';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import chalk from 'chalk';
import { uniq } from 'lodash';

export class ComponentsHaveIssues extends BitError {
  constructor(components: ConsumerComponent[]) {
    components.forEach((component) => {
      component.issues = component.issues.filterNonTagBlocking();
    });
    const allIssueNames = uniq(components.map((comp) => comp.issues.getAllIssueNames()).flat());
    const issuesColored = componentIssuesTemplate(components);
    super(`error: issues found with the following components
${issuesColored}

to get the list of component-issues names and suggestions how to resolve them, run "bit component-issues".

while highly not recommended, it's possible to ignore issues in two ways:
1) temporarily ignore for this tag/snap command by entering "--ignore-issues" flag, e.g. \`bit tag --ignore-issues "${allIssueNames.join(
      ', '
    )}" \`
2) ignore the issue completely by configuring it in the workspace.jsonc file. e.g:
"${IssuesAspect.id}": {
  "ignoreIssues": [${allIssueNames.map((issue) => `"${issue}"`).join(', ')}]
}
`);
  }
}

function componentIssuesTemplate(components: ConsumerComponent[]) {
  function format(component: ConsumerComponent) {
    return `${chalk.underline(chalk.cyan(component.id.toString()))}\n${formatIssues(component)}`;
  }

  const result = `\n${components.map(format).join('\n')}`;
  return result;
}
