import type { Command } from './command';
import { completionCommand } from './cli.commands';

export class CompletionCmd implements Command {
  name = completionCommand.name;
  description = completionCommand.description;
  alias = completionCommand.alias;
  group = completionCommand.group;
  options = completionCommand.options;
  private = completionCommand.private;
}
