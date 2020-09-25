import React from 'react';
import { Newline, Text } from 'ink';

export const WebpackWarnings = ({warnings}) => (
  <Text>
    {
      warnings.map(warning =>(
        <>
          <Newline />
          <Text color="yellow">
            {warning}
          </Text>
          <Newline />
        </>
      ))
    }
  </Text>
);
