import React from 'react';
import { Text, Newline } from 'ink';

export enum ErrorLevel {
  WARNING = 'warning',
  ERROR = 'error',
}

export type ErrorProps = {
  errors: any[];
  level: ErrorLevel;
};

export function Error({ errors, level }: ErrorProps) {
  return (
    <>
      {errors.map((warning, index) => (
        <Text key={index} color={level === ErrorLevel.WARNING ? 'yellow' : 'red'}>
          {warning.message}
          <Newline />
          {warning.stack}
        </Text>
      ))}
    </>
  );
}
