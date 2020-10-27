import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  warnings: any[];
  verbose: boolean;
};

export const WebpackWarnings = ({ warnings, verbose }) => {
  return warnings.map((warning, index) => (
    <>
      <Text key={index} color="orange">
        {verbose ? warning.stack : warning.message}
      </Text>
      <Newline />
    </>
  ));
};
