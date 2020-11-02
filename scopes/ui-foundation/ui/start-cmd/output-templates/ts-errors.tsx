import React from 'react';
import { Text } from 'ink';

export type props = {
  latestError: any;
  verbose: boolean;
};

export const TSErrors = ({ latestError, verbose }: props) => {
  if (latestError) {
    if (verbose) {
      return <Text>{latestError.stack}</Text>;
    }
    return <Text>{latestError.message}</Text>;
  }
  return null;
};
