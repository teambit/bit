import React from 'react';
import { InfoCard } from './info-card';

export const BasicInfoCard = () => (
  <InfoCard level="info" title="Info message">
    Content to be rendered
  </InfoCard>
);

export const WarnInfoCard = () => (
  <InfoCard level="warning" title="Warning message">
    Content to be rendered
  </InfoCard>
);

export const ErrorInfoCard = () => (
  <InfoCard level="error" title="Error message">
    Content to be rendered
  </InfoCard>
);

export const SuccessInfoCard = () => (
  <InfoCard level="success" title="Success message">
    Content to be rendered
  </InfoCard>
);
