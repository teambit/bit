import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { AlertCard } from './alert-card';

export const InfoAlertCard = () => (
  <ThemeCompositions>
    <AlertCard level="info" title="Info title">
      Content to be rendered
    </AlertCard>
  </ThemeCompositions>
);

export const WarningAlertCard = () => (
  <ThemeCompositions>
    <AlertCard level="warning" title="Warning title">
      Content to be rendered
    </AlertCard>
  </ThemeCompositions>
);

export const ErrorAlertCard = () => (
  <ThemeCompositions>
    <AlertCard level="error" title="Error title">
      Content to be rendered
    </AlertCard>
  </ThemeCompositions>
);

export const SuccessAlertCard = () => (
  <ThemeCompositions>
    <AlertCard level="success" title="Success title">
      Content to be rendered
    </AlertCard>
  </ThemeCompositions>
);
