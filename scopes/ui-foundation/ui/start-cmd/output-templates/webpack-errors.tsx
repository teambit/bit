import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  errs: any[];
  verbose: boolean;
};

// TODO: Do not work with more the 1K charts???
export const WebpackErrors = ({ errs, verbose }) => {
  return errs.map((err, index) => (
    <Text key={index} color="red">
      {verbose ? err.stack.substring(0, 1000) : err.message.substring(0, 1000)}
      <Newline />
    </Text>
  ));
};
