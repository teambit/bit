import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { IssuesClasses, IssuesList } from '@teambit/component-issues';
import { ComponentIssuesCmd } from './issues-cmd';
import { IssuesAspect } from './issues.aspect';

export type IssuesConfig = {
  ignoreIssues: string[];
};

export class IssuesMain {
  constructor(private config: IssuesConfig) {}

  getIssuesToIgnore(): string[] {
    const allIssues = this.listIssues().map((issue) => issue.name);
    const issuesToIgnore = this.config.ignoreIssues || [];
    issuesToIgnore.forEach((issueToIgnore) => {
      if (!allIssues.includes(issueToIgnore)) {
        throw new BitError(
          `fatal: a non-existing component-issue "${issueToIgnore}" was configured for ${IssuesAspect.id} aspect`
        );
      }
    });
    return issuesToIgnore;
  }

  listIssues() {
    const instances = Object.keys(IssuesClasses).map((issueClass) => new IssuesClasses[issueClass]());
    const issuesList = new IssuesList(instances);
    const nonLegacyIssues = issuesList.getHarmonyIssues();
    return nonLegacyIssues.map((issueInstance) => {
      return {
        name: issueInstance.constructor.name,
        description: issueInstance.description,
        solution: issueInstance.solution,
        isTagBlocker: issueInstance.isTagBlocker,
      };
    });
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static defaultConfig = {
    ignoreIssues: [],
  };
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain], config: IssuesConfig) {
    const issuesMain = new IssuesMain(config);
    cli.register(new ComponentIssuesCmd(issuesMain));
    return issuesMain;
  }
}

IssuesAspect.addRuntime(IssuesMain);
