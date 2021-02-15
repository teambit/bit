import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Status, JobStatus } from './status';

export const StatusFailExample = ({ ...rest }) => (
  <ThemeCompositions>
    <Status status={JobStatus.fail} {...rest} />
  </ThemeCompositions>
);

export const StatusPassExample = ({ ...rest }) => (
  <ThemeCompositions>
    <Status status={JobStatus.pass} {...rest} />
  </ThemeCompositions>
);

export const StatusRunningExample = ({ ...rest }) => (
  <ThemeCompositions>
    <Status status={JobStatus.running} {...rest} />
  </ThemeCompositions>
);

export const StatusPendingExample = ({ ...rest }) => (
  <ThemeCompositions>
    <Status status={JobStatus.pending} {...rest} />
  </ThemeCompositions>
);
