import React from 'react';
import { Text, Color } from 'ink';
import Spinner from 'ink-spinner';

export const ComponentPreviewServerStarted = ({ host, port, timestamp }) => (
  <Text>
    {` Component Preview Server Started on http://${host}:${port} `} <Color yellow>{timestamp}</Color>
  </Text>
);
