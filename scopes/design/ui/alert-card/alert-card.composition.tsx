import React from 'react';
import { AlertCard } from './alert-card';

export const InfoAlertCard = () => (
  <AlertCard level="info" title="Info title">
    Content to be rendered
  </AlertCard>
);

export const WarningAlertCard = () => (
  <AlertCard level="warning" title="Warning title">
    Content to be rendered
  </AlertCard>
);

export const ErrorAlertCard = () => (
  <AlertCard level="error" title="Error title">
    Content to be rendered
  </AlertCard>
);

export const SuccessAlertCard = () => (
  <AlertCard level="success" title="Success title">
    Content to be rendered
  </AlertCard>
);
