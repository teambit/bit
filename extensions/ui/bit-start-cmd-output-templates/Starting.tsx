import React from 'react';
import { render, Text, Color } from 'ink';
import Spinner from 'ink-spinner';

export const Starting = () => (
  <Text>
    <Color green>
      <Spinner type="dots" />
    </Color>
    {' Starting'}
  </Text>
);
