import React from 'react';
import { Text, Newline } from 'ink';
import { EnvDefinition } from '../../env-definition';

export type EnvOverviewProps = {
  envDef: EnvDefinition;
};

/**
 * renders an env overview in the terminal.
 */
export function EnvOverview({ envDef }: EnvOverviewProps) {
  return (
    <Text>
      <Text bold underline>
        Environment: {envDef.id}
      </Text>
      <Newline />
    </Text>
  );
}
