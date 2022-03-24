import { BitError } from '@teambit/bit-error';
import componentIssuesTemplate from '@teambit/legacy/dist/cli/templates/component-issues-template';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';

export class ComponentsHaveIssues extends BitError {
  constructor(components: ConsumerComponent[]) {
    const missingDepsColored = componentIssuesTemplate(components);
    super(`error: issues found with the following components\n${missingDepsColored}`);
  }
}
