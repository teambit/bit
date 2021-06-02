import React from 'react';
import { MessageCard } from './message-card';

export const BasicMessageCard = () => <MessageCard title="message card" />;

export const MessageCardWithIcon = () => (
  <MessageCard data-testid="card-with-icon" title="message card with icon" icon="Ripple-pending" />
);

export const OverflowingCardWithIcon = () => (
  <div style={{ width: '200px' }}>
    <MessageCard title="message card with iconAndLongText" icon="Ripple-pending" />
  </div>
);
