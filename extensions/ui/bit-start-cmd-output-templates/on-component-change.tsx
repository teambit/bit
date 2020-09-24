import React from 'react';
import { Newline, Text } from 'ink';

export type props = {
  events: any[];
};

export const OnComponentChange = ({ events }: props) => {
  return (
    <Text>
      <Newline />

      {events.map((event, index) => (
        <Text key={index}>
          <Text>
            Compilation of <Text color="rgb(45, 164, 157)">{event.idStr}</Text> is done.
          </Text>
          <Newline />
          <Text color="yellow">Waiting for component changes... ({event.timestamp})</Text>
          <Newline />
          <Newline />
        </Text>
      ))}
    </Text>
  );
};
