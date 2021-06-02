import React from 'react';
import { StatusMessageCard } from './status-message-card';

export const PassingMessageCard = () => (
  <StatusMessageCard status="SUCCESS" title="success card">
    this might take a minute
  </StatusMessageCard>
);
export const FailingMessageCard = () => (
  <StatusMessageCard status="FAILURE" title="failure card">
    this might take a minute
  </StatusMessageCard>
);
export const PendingMessageCard = () => (
  <StatusMessageCard status="PENDING" title="pending card">
    this might take a minute
  </StatusMessageCard>
);
export const ProcessingMessageCard = () => (
  <StatusMessageCard status="PROCESSING" title="processing card">
    this might take a minute
  </StatusMessageCard>
);
export const SkippedMessageCard = () => (
  <StatusMessageCard status="SKIPPED" title="skipped card">
    this might take a minute
  </StatusMessageCard>
);
export const UnknownMessageCard = () => (
  <StatusMessageCard status="UNKNOWN" title="unknown card">
    this might take a minute
  </StatusMessageCard>
);
