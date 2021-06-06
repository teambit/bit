import { Command } from '@teambit/legacy/dist/cli/command';

export class CompletionCmd implements Command {
  name = 'completion';
  description = 'enable bash/zsh-completion shortcuts for commands and options';
  alias = '';
  group = 'general';
  options = [];
}
