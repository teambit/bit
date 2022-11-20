import { EnvContext, EnvHandler } from "@teambit/envs";
import { WorkspaceTemplate } from "./workspace-template";

export type StarterListOptions = {
  name?: string;
};

export class StarterList {
  constructor(
    readonly name: string,
    private starters: EnvHandler<WorkspaceTemplate>[],
    private context: EnvContext
  ) {}

  compute(): WorkspaceTemplate[] {
    return this.starters.map((starter) => starter(this.context))
  }

  static from(starters: EnvHandler<WorkspaceTemplate>[], options: StarterListOptions = {}) {
    return (context: EnvContext) => {
      const name = options.name || 'starter-list';
      return new StarterList(name, starters, context);
    };
  }
}
