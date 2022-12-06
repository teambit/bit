import { Command } from '@teambit/legacy/dist/cli/command';
import { CommandOptions } from '@teambit/legacy/dist/cli/legacy-command';
import { pick } from 'lodash';
import { getCommandId } from './get-command-id';

export type GenerateOpts = {
  metadata?: Record<string, string>;
};

type CommandObject = ReturnType<typeof oneCommandToObject> & { commands?: any };

export class GenerateCommandsDoc {
  constructor(private commands: Command[], private options: GenerateOpts) {}

  generate(): string {
    const commands = this.getAllPublicCommandsSorted();
    let output = `${this.getFrontmatter()}
# CLI Reference

Commands that are marked as workspace only must be executed inside a workspace. Commands that are marked as not workspace only, can be executed from anywhere and will run on a remote server.
`;
    output += commands.map((cmd) => this.generateCommand(cmd)).join('\n');

    return output;
  }

  generateJson() {
    return this.commandsToObjects();
  }

  private commandsToObjects(commands: Command[] = this.commands): CommandObject[] {
    return commands.map((command) => {
      const cmdObject: CommandObject = oneCommandToObject(command);
      if (command.commands?.length) {
        cmdObject.commands = this.commandsToObjects(command.commands);
      }
      return cmdObject;
    });
  }

  private getFrontmatter() {
    const metadata = this.options.metadata;
    if (!metadata) {
      return '';
    }
    const metadataStr = Object.keys(metadata)
      .map((key) => `${key}: ${metadata[key]}`)
      .join('\n');

    return `---
    ${metadataStr}
    ---
`;
  }

  private getAllPublicCommandsSorted() {
    const publicCommands = this.commands.filter((cmd) => !cmd.private);
    return publicCommands.sort((a, b) => a.name.localeCompare(b.name));
  }

  private generateCommand(cmd: Command) {
    const commandName = getCommandId(cmd.name);
    let result = `## ${commandName}  \n\n`;
    if (cmd.alias && cmd.alias.length > 0) {
      result += `**Alias**: \`${cmd.alias}\`  \n`;
    }
    result += `**Workspace only**: ${cmd.skipWorkspace ? 'no' : 'yes'}  \n`;
    result += `**Description**: ${this.formatDescription(cmd)}`;
    result += `\`bit ${cmd.name}\`  \n\n`;

    if (cmd.commands && cmd.commands.length > 0) {
      result += this.generateSubCommands(cmd.commands, cmd);
    }
    result += this.generateOptions(cmd.options);
    result += `---  \n`;

    return result;
  }

  private generateSubCommands(subCommands: Command[], command: Command) {
    let ret = '';
    subCommands.forEach((subCommand) => {
      const commandName = getCommandId(command.name);
      const subcommandName = getCommandId(subCommand.name);
      const usage = `${commandName} ${subCommand.name}`;
      ret += `### ${commandName} ${subcommandName} \n`;
      ret += `**Usage**: \`${usage}\`  \n\n`;
      ret += `**Description**: ${this.formatDescription(subCommand)}`;

      ret += '\n';
      ret += this.generateOptions(subCommand.options);
    });
    return ret;
  }

  private generateOptions(options: CommandOptions): string {
    if (!options || options.length <= 0) return '';
    let output = `| **Option** | **Option alias** | **Description**|  \n`;
    output += `|---|:-----:|---|\n`;
    options.forEach((opt) => {
      const [alias, flag, description] = opt;
      const aliasFormatted = alias ? `\`-${alias}\`` : '   ';
      const flagFormatted = `--${flag}`;
      output += `|\`${flagFormatted}\`|${aliasFormatted}|${description.replaceAll('\n', ' ')}|\n`;
    });
    output += `\n`;
    return output;
  }

  private formatStringToMD(str: string): string {
    return str.split('\n').join('  \n');
  }

  private formatDescription(command: Command): string {
    const extendedDescription = command.extendedDescription
      ? `  \n${this.formatStringToMD(command.extendedDescription)}`
      : '';
    const description = this.formatStringToMD(command.description as string);
    return `${description}${extendedDescription}  \n\n`;
  }
}

function oneCommandToObject(command: Command) {
  return pick(command, [
    'name',
    'alias',
    'options',
    'description',
    'extendedDescription',
    'group',
    'private',
    'internal',
    'remoteOp',
    'skipWorkspace',
    'arguments',
    'examples',
  ]);
}
