import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { IssuesClasses, IssuesList } from '@teambit/component-issues';
import { Slot, SlotRegistry } from '@teambit/harmony';
import pMapSeries from 'p-map-series';
import { ComponentIssuesCmd } from './issues-cmd';
import { IssuesAspect } from './issues.aspect';
import { NonExistIssueError } from './non-exist-issue-error';

export type IssuesConfig = {
  ignoreIssues: string[];
};

export type AddComponentsIssues = (components: Component[], issuesToIgnore: string[]) => Promise<void>;

export type AddComponentsIssuesSlot = SlotRegistry<AddComponentsIssues>;

export class IssuesMain {
  constructor(private config: IssuesConfig, private addComponentsIssuesSlot: AddComponentsIssuesSlot) {}

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

  removeIgnoredIssuesFromComponents(components: Component[], extraIssuesToIgnore: string[] = []) {
    const issuesToIgnoreGlobally = this.getIssuesToIgnoreGlobally();
    components.forEach((component) => {
      const issuesToIgnoreForThisComp = this.getIssuesToIgnorePerComponent(component);
      const issuesToIgnore = [...issuesToIgnoreGlobally, ...issuesToIgnoreForThisComp, ...extraIssuesToIgnore];
      issuesToIgnore.forEach((issueToIgnore) => {
        component.state.issues.delete(IssuesClasses[issueToIgnore]);
      });
    });
  }

  /**
   * register to this slot in order to add a component-issue in bit-status and bit-snap/tag.
   * your function gets all components in one param and the issuesToIgnore as a second param, you don't need to check
   * for issuesToIgnore. if the issue you added is configured to be ignored, it'll be ignored later in the process.
   * this is useful for optimization, if you don't want to calculate the component issue when it's ignored.
   */
  registerAddComponentsIssues(addComponentsIssues: AddComponentsIssues) {
    this.addComponentsIssuesSlot.register(addComponentsIssues);
  }

  async triggerAddComponentIssues(components: Component[], issuesToIgnore: string[]) {
    const allFunctions = this.addComponentsIssuesSlot.values();
    await pMapSeries(allFunctions, (func) => func(components, issuesToIgnore));
  }

  static slots = [Slot.withType<AddComponentsIssues>()];
  static dependencies = [CLIAspect];
  static defaultConfig = {
    ignoreIssues: [],
  };
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain], config: IssuesConfig, [addComponentsIssuesSlot]: [AddComponentsIssuesSlot]) {
    const issuesMain = new IssuesMain(config, addComponentsIssuesSlot);
    cli.register(new ComponentIssuesCmd(issuesMain));
    return issuesMain;
  }
}

IssuesAspect.addRuntime(IssuesMain);
