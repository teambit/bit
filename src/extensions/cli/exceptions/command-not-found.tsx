import React from 'react';
import { Color, Text, Box } from 'ink';
import { PaperError } from './paper-error';

export class CommandNotFound extends PaperError {
  commandName: string;
  suggestion?: string;
  constructor(commandName: string, suggestion?: string) {
    super(`command ${commandName} was not found`);
    this.commandName = commandName;
    this.suggestion = suggestion;
  }
  render() {
    return (
      <Box flexDirection="column">
        <Box>
          <Color yellow>
            warning: <Text bold>{this.commandName}</Text> is not a valid command
          </Color>
        </Box>
        <Box>
          <Color yellow>see &apos;bit --help&apos; for additional information</Color>
        </Box>
        {this.renderSuggestion()}
      </Box>
    );
  }

  renderSuggestion() {
    if (!this.suggestion) return <Box></Box>;
    return (
      <Box flexDirection="column">
        <Box>
          <Color red>
            Did you mean: <Text bold>{this.suggestion}</Text>?
          </Color>
        </Box>
      </Box>
    );
  }
}
