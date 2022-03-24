import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { IssuesClasses } from '@teambit/component-issues';
import { IssuesAspect } from './issues.aspect';

export class IssuesMain {
  listIssues() {
    console.log('IssuesClasses', IssuesClasses);
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static defaultConfig = {
    ignoreIssues: [],
  };
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    cli.register();
    return new IssuesMain();
  }
}

IssuesAspect.addRuntime(IssuesMain);
