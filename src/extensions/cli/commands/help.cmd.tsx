/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Command } from '../../../cli/command';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Help(Renderer = DefaultHelpRender) {
  return function getHelpProps(commands: { [k: string]: Command }, groups: { [k: string]: string }) {
    const help: HelpProps = Object.entries(commands)
      // The ci-update condition is a workaround because we don't want to make it private for other reason (see the ci-update-cmd for more info)
      // TODO: remove this once the ci-update command has been removed soon
      .filter(
        ([_name, command]) =>
          !command.private &&
          (command.shortDescription || command.description) &&
          command.name !== 'ci-update <id> [scopePath]'
      )
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
  [name: string]: {
    commands: { [cmdName: string]: string };
    description: string;
  };
};

function DefaultHelpRender(props: HelpProps) {
  const element = (
    <Box key="help" flexDirection="column">
      <HelpHeader />
      {Object.entries(props).map(function([name, group]) {
        return (
          <Box key={name} flexDirection="column" marginBottom={1}>
            <Text bold underline key={`group_${name}`}>
              {group.description}
            </Text>
            <Box flexDirection="column">
              {Object.entries(group.commands).map(function([command, description]) {
                return (
                  <Text key={command}>
                    {'  '}
                    <Color blue>{alignCommandName(command)}</Color>
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
  const m = `please use 'bit <command> --help' for more information and guides on specific commands.`;
  return (
    <Box>
      <Color grey>{m}</Color>
    </Box>
  );
}
function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign - name.length).join(' ')}`;
}
