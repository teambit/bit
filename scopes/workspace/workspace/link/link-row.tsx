import { Text, Box, Newline } from 'ink';
import React from 'react';

type LinkRowProps = {
  title: string;
  target: string;
  padding?: number;
};
export function LinkRow({ title, target, padding = 50 }: LinkRowProps) {
  return (
    <Text bold key={title}>
      {title.padEnd(padding)} {'>'} {target}
    </Text>
  );
}

type VerboseLinkRowProps = {
  from: string;
  to: string;
};
export function VerboseLinkRow({ from, to }: VerboseLinkRowProps) {
  return (
    <Box flexDirection="column">
      <Text bold>from: {from}</Text>
      <Text bold>to: {to} </Text>
      <Newline />
    </Box>
  );
}
