import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { IssuesClasses, IssuesList } from '@teambit/component-issues';
import { ComponentIssuesCmd } from './issues-cmd';
import { IssuesAspect } from './issues.aspect';
import { NonExistIssueError } from './non-exist-issue-error';

export type IssuesConfig = {
  ignoreIssues: string[];
};

export class IssuesMain {
  constructor(private config: IssuesConfig) {}

  getIssuesToIgnoreGlobally(): string[] {
    const issuesToIgnore = this.config.ignoreIssues || [];
    this.validateIssueNames(issuesToIgnore);
    return issuesToIgnore;
  }

  getIssuesToIgnorePerComponent(component: Component): string[] {
    const issuesToIgnore = component.state.aspects.get(IssuesAspect.id)?.config.ignoreIssues;
    if (!issuesToIgnore) return [];
    this.validateIssueNames(issuesToIgnore);
    return issuesToIgnore;
  }

  private validateIssueNames(issues: string[]) {
    const allIssues = this.listIssues().map((issue) => issue.name);
    issues.forEach((issue) => {
      if (!allIssues.includes(issue)) {
        throw new NonExistIssueError(issue);
      }
    });
  }

  listIssues() {
    const instances = Object.keys(IssuesClasses).map((issueClass) => new IssuesClasses[issueClass]());
    const issuesList = new IssuesList(instances);
    const allIssues = issuesList.getAllIssues();
    return allIssues.map((issueInstance) => {
      return {
        name: issueInstance.constructor.name,
        description: issueInstance.description,
        solution: issueInstance.solution,
        isTagBlocker: issueInstance.isTagBlocker,
      };
    });
  }

  removeIgnoredIssuesFromComponents(components: Component[]) {
    const issuesToIgnoreGlobally = this.getIssuesToIgnoreGlobally();
    components.forEach((component) => {
      const issuesToIgnoreForThisComp = this.getIssuesToIgnorePerComponent(component);
      const issuesToIgnore = [...issuesToIgnoreGlobally, ...issuesToIgnoreForThisComp];
      issuesToIgnore.forEach((issueToIgnore) => {
        component.state.issues.delete(IssuesClasses[issueToIgnore]);
      });
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
