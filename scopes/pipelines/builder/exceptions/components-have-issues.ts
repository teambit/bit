import { BitError } from '@teambit/bit-error';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import chalk from 'chalk';

export class ComponentsHaveIssues extends BitError {
  constructor(components: ConsumerComponent[]) {
    components.forEach((component) => {
      component.issues = component.issues.filterNonTagBlocking();
    });
    const issuesColored = componentIssuesTemplate(components);
    super(`error: issues found with the following components
${issuesColored}

to get the list of component-issues names and suggestions how to resolve them, run "bit component-issues".
`);
  }
}

function formatIssues(compWithIssues: ConsumerComponent) {
  return `       ${compWithIssues.issues?.outputForCLI()}\n`;
}

function componentIssuesTemplate(components: ConsumerComponent[]) {
  function format(component: ConsumerComponent) {
    return `${chalk.underline(chalk.cyan(component.id.toString()))}\n${formatIssues(component)}`;
  }

  const result = `\n${components.map(format).join('\n')}`;
  return result;
}
