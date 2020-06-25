/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Command } from '../../../cli/command';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Help(Renderer = DefaultHelpRender) {
  return function getHelpProps(commands: { [k: string]: Command }, groups: { [k: string]: string }) {
    const help: HelpProps = Object.entries(commands)
      .filter(([, command]) => !command.private && (command.shortDescription || command.description))
      .reduce(function(partialHelp, [id, command]) {
        partialHelp[command.group!] = partialHelp[command.group!] || {
          commands: {},
          description: groups[command.group!] || command.group
        };
        partialHelp[command.group!].commands[id] = command.shortDescription || command.description;
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
      {Object.entries(props).map(([groupName, group]) => {
        return (
          <Box key={groupName} flexDirection="column" marginBottom={1}>
            <Text bold underline key={`group_${groupName}`}>
              {group.description}
            </Text>
            <Box flexDirection="column">
              {Object.entries(group.commands).map(([commandName, description]) => {
                return (
                  <Text key={commandName}>
                    {'  '}
                    <Text bold>{alignCommandName(commandName)}</Text>
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
      <Color grey> bit documentation: https://docs.bit.dev</Color>
    </Box>
  );
}

function HelpFooter() {
  const footer = `please use 'bit <command> --help' for more information and guides on specific commands.`;
  return (
    <Box>
      <Color grey>{footer}</Color>
    </Box>
  );
}
function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign - name.length).join(' ')}`;
}
