import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  warnings: any[];
  verbose: boolean;
};

export const WebpackWarnings = ({ warnings, verbose }) => {
  return warnings.map((warning, index) => (
    <Text key={index} color="yellow">
      {verbose ? warning.stack : warning.message}
      <Newline />
    </Text>
  ));
};
