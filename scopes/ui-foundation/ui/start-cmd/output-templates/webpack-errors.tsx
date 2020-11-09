import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  errs: any[];
  verbose: boolean;
};

// TODO: Do not work with more the 3K charts???
export const WebpackErrors = ({ errs, verbose }) => {
  return errs.map((err, index) => (
    <Text key={index} color="red">
      {verbose ? err.stack.substring(0, 2500) : err.message.substring(0, 2500)}
      <Newline />
    </Text>
  ));
};
