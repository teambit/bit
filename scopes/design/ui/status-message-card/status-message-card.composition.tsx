import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { StatusMessageCard } from './status-message-card';

export const PassingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="SUCCESS" title="success card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const FailingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="FAILURE" title="failure card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const PendingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="PENDING" title="pending card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const ProcessingMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="PROCESSING" title="processing card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const SkippedMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="SKIPPED" title="skipped card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
export const UnknownMessageCard = () => (
  <ThemeCompositions>
    <StatusMessageCard style={{ margin: '20px' }} status="UNKNOWN" title="unknown card">
      this might take a minute
    </StatusMessageCard>
  </ThemeCompositions>
);
