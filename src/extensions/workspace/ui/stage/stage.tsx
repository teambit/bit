import React, { ReactNode } from 'react';

export type StageProps = {
  children: ReactNode;
};

export function Stage({ children }: StageProps) {
  return <>{children}</>;
}
