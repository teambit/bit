import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Command} from '../command';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Help(Renderer = DefaultHelpRender){
  return function getHelpProps(commands:{[k:string]:Command}, groups:{[k:string]:string}) {
    const help:HelpProps = Object.entries(commands)
      .filter(([_name, command]) => !command.private && !!command.shortDescription)
      .reduce(function(partialHelp, [id, command]) {
        partialHelp[command.group] = partialHelp[command.group] || {
          commands: {},
          description: groups[command.group] || ''
        };
        partialHelp[command.group].commands[id] = command.shortDescription;
        return partialHelp;
      }, {});
    return render(<Renderer {...help}/>);
  }

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
          <Box key={name} flexDirection="column">
            {[
              <Text bold underline key={`group_${name}`}>
                {group.description}
              </Text>,
              ...Object.entries(group.commands).map(function([command, description]) {
                return (
                  <Text key={command}>
                    <Color blue>{alignCommandName(command)}</Color>
                    {description}
                  </Text>
                );
              })
            ]}
          </Box>
        );
      })}
      <HelpFooter/>
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
  const m = `please use 'bit <command> --help' for more information and guides on specific commands.`
  return <Box>
    <Color grey>{m}</Color>
  </Box>
}
function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign - name.length).join(' ')}`;
}
