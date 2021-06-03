import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { StatusMessageCard } from './status-message-card';

export const PassingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="SUCCESS" title="success card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const FailingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="FAILURE" title="failure card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const PendingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="PENDING" title="pending card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const ProcessingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="PROCESSING" title="processing card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const SkippedMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="SKIPPED" title="skipped card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const UnknownMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard status="UNKNOWN" title="unknown card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
