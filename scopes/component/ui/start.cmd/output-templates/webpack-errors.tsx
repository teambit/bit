import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  errs: any[];
  verbose: boolean;
};

export const WebpackErrors = ({ errs, verbose }) => {
  return errs.map((err, index) => (
    <Text key={index} color="red">
      {verbose ? err.stack : err.message}
      <Newline />
    </Text>
  ));
};
