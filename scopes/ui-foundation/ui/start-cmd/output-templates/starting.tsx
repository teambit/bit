import React from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';

export type StartingProps = {
  sumOfComponentServers: number;
};

export const Starting = ({ sumOfComponentServers }: StartingProps) =>
  !sumOfComponentServers ? null : (
    <Box paddingTop={1}>
      <Text>
        <Text color="green">
          <Spinner type="dots" />
        </Text>{' '}
        Starting the main UI server...
      </Text>
    </Box>
  );
