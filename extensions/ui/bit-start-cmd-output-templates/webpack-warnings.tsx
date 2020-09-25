import React from 'react';
import { Newline, Text } from 'ink';

export const WebpackWarnings = ({warnings} : any) => (
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
