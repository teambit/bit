import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { IssuesClasses, IssuesList } from '@teambit/component-issues';
import { ComponentIssuesCmd } from './issues-cmd';
import { IssuesAspect } from './issues.aspect';

export class IssuesMain {
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
  static async provider([cli]: [CLIMain]) {
    const issuesMain = new IssuesMain();
    cli.register(new ComponentIssuesCmd(issuesMain));
    return issuesMain;
  }
}

IssuesAspect.addRuntime(IssuesMain);
