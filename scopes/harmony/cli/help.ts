import chalk from 'chalk';
import rightpad from 'pad-right';
import { capitalize } from 'lodash';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { CommandList } from './cli.main.runtime';
import { getCommandId } from './get-command-id';

const SPACE = ' ';
const TITLE_LEFT_SPACES_NUMBER = 2;
const COMMAND_LEFT_SPACES_NUMBER = 4;
const NAME_WITH_SPACES_LENGTH = 15;

type HelpProps = {
  [groupName: string]: GroupContent;
};

type GroupContent = {
  commands: { [cmdName: string]: string };
  description: string;
};

export function formatHelp(commands: CommandList, groups: GroupsType, docsDomain: string, showPrivateCommands = false) {
  const helpProps = groupCommands(commands, groups, showPrivateCommands);
  const commandsStr = formatCommandsHelp(helpProps);

  return `${getHeader(docsDomain)}

${commandsStr}

${getFooter()}`;
}

function groupCommands(commands: CommandList, groups: GroupsType, showPrivateCommands = false): HelpProps {
  const help: HelpProps = commands
    .filter((command) => (showPrivateCommands ? true : !command.private && command.description))
    .reduce(function (partialHelp, command) {
      const groupName = command.group as string; // at this stage, it must be set
      partialHelp[groupName] = partialHelp[groupName] || {
        commands: {},
        description: groups[groupName] || capitalize(command.group),
      };
      const cmdId = getCommandId(command.name);
      partialHelp[groupName].commands[cmdId] = command.description;
      return partialHelp;
    }, {});
  return help;
}

function formatCommandsHelp(helpProps: HelpProps): string {
  return Object.keys(helpProps)
    .map((groupName) => commandsSectionTemplate(helpProps[groupName]))
    .join('\n\n');
}

function commandsSectionTemplate(section: GroupContent): string {
  const titleSpace = SPACE.repeat(TITLE_LEFT_SPACES_NUMBER);
  const title = `${titleSpace}${chalk.underline.bold.blue(section.description)}`;
  const commands = Object.keys(section.commands)
    .map((cmdName) => commandTemplate(cmdName, section.commands[cmdName]))
    .join('\n');
  const res = `${title}\n${commands}`;
  return res;
}

function commandTemplate(name: string, description: string): string {
  const nameSpace = SPACE.repeat(COMMAND_LEFT_SPACES_NUMBER);
  const nameWithRightSpace = rightpad(name, NAME_WITH_SPACES_LENGTH, SPACE);
  const res = `${nameSpace}${chalk.green(nameWithRightSpace)}${description}`;
  return res;
}

function getHeader(docsDomain: string): string {
  return `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

${chalk.yellow(`bit documentation: https://${docsDomain}`)}`;
}

function getFooter(): string {
  return `${chalk.yellow("please use 'bit <command> --help' for more information and guides on specific commands.")}`;
}
