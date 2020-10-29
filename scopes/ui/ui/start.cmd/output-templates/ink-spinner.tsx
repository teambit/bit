import React from 'react';
import { Text } from 'ink';
import Spinner from 'ink-spinner';

export const InkSpinner = () => (
  <Text color="green">
    <Spinner type="dots" />{' '}
  </Text>
);
