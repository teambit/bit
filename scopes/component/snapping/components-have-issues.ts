import { BitError } from '@teambit/bit-error';
import IssuesAspect from '@teambit/issues';
import componentIssuesTemplate from '@teambit/legacy/dist/cli/templates/component-issues-template';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';

export class ComponentsHaveIssues extends BitError {
  constructor(components: ConsumerComponent[]) {
    const issuesColored = componentIssuesTemplate(components);
    super(`error: issues found with the following components
${issuesColored}

to get the list of component-issues names and suggestions how to resolve them, run "bit component-issues".

while highly not recommended, it's possible to ignore issues in two ways:
1) temporarily ignore for this tag/snap command by entering "--ignore-issues" flag, e.g. \`bit tag --ignore-issues "MultipleEnvs, ImportNonMainFiles" \`
2) ignore the issue completely by configuring it in the workspace.jsonc file. e.g:
"${IssuesAspect.id}": {
  "ignoreIssues": ["ParseErrors", "MissingPackagesDependenciesOnFs"]
}
`);
  }
}
