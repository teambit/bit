import { BitError } from '@teambit/bit-error';
import { IssuesAspect } from './issues.aspect';

export class NonExistIssueError extends BitError {
  constructor(issueToIgnore: string) {
    super(`fatal: a non-existing component-issue "${issueToIgnore}" was configured for ${IssuesAspect.id} aspect.
to get the list of component-issues, please run "bit component-issues"`);
  }
}
