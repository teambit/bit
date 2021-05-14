/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Box, render, Text, Newline } from 'ink';
import React from 'react';
import { CommandList } from '../cli.main.runtime';
import { getCommandId } from '../get-command-id';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Help(Renderer = DefaultHelpRender) {
  return function getHelpProps(commands: CommandList, groups: { [k: string]: string }) {
    const help: HelpProps = commands
      .filter((command) => !command.private && (command.shortDescription || command.description))
      .reduce(function (partialHelp, command) {
        partialHelp[command.group!] = partialHelp[command.group!] || {
          commands: {},
          description: groups[command.group!] || command.group,
        };
        const cmdId = getCommandId(command.name);
        partialHelp[command.group!].commands[cmdId] = command.shortDescription || command.description;
        return partialHelp;
      }, {});
    return render(<Renderer {...help} />);
  };
}

export type HelpProps = {
  [groupName: string]: {
    commands: { [cmdName: string]: string };
    description: string;
  };
};

function DefaultHelpRender(props: HelpProps) {
  const element = (
    <Box key="help" flexDirection="column">
      <HelpHeader />
      <Newline />
      {Object.entries(props).map(([groupName, group]) => {
        return (
          <Box key={groupName} flexDirection="column" marginBottom={1}>
            <Text bold underline color="blue" key={`group_${groupName}`}>
              {group.description}
            </Text>
            <Box flexDirection="column">
              {Object.entries(group.commands).map(([commandName, description]) => {
                return (
                  <Text key={commandName}>
                    {'  '}
                    <Text color="green">{alignCommandName(commandName)}</Text>
                    {description}
                  </Text>
                );
              })}
            </Box>
          </Box>
        );
      })}
      <HelpFooter />
    </Box>
  );
  return element;
}

function HelpHeader() {
  return (
    <Box key="HelpHeader" flexDirection="column">
      <Text bold>{`usage: bit [--version] [--help] <command> [<args>]`} </Text>
      <Newline />
      <Text color="yellow"> bit documentation: https://harmony-docs.bit.dev</Text>
    </Box>
  );
}

function HelpFooter() {
  const footer = `please use 'bit <command> --help' for more information and guides on specific commands.
`;
  return (
    <Box>
      <Text color="yellow">{footer}</Text>
    </Box>
  );
}
function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign - name.length).join(' ')}`;
}
