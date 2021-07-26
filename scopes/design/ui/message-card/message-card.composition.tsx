import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MessageCard } from './message-card';

export const BasicMessageCard = () => <MessageCard title="message card" />;

export const MessageCardWithIcon = () => (
  <ThemeCompositions>
    <MessageCard data-testid="card-with-icon" title="message card with icon" icon="Ripple-pending" />
  </ThemeCompositions>
);

export const OverflowingCardWithIcon = () => (
  <ThemeCompositions>
    <div style={{ width: '200px' }}>
      <MessageCard title="message card with iconAndLongText" icon="Ripple-pending" />
    </div>
  </ThemeCompositions>
);
