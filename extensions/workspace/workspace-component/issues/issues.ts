import { Issue } from './issue';

export type LegacyIssues = {}[];

export class Issues {
  constructor(public issues: Issue[]) {}

  get count() {
    return this.issues.length;
  }

  static fromLegacy(legacyIssues: LegacyIssues) {
    const issues = Object.entries(legacyIssues).map(([issueName]) => {
      return new Issue(issueName);
    });
    return new Issues(issues);
  }
}
