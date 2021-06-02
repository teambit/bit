import React from 'react';
import { MessageCard, MessageCardProps } from '@teambit/design.ui.surfaces.message-card';
import colorStyles from './status-message-card.module.scss';

export type StatusMessageCardProps = {
  /**
   * The icon and color to show in the card
   */
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'PROCESSING' | 'SKIPPED' | 'UNKNOWN';
} & MessageCardProps;

/**
 * A card to display status information to the user
 */
export function StatusMessageCard({ status, ...rest }: StatusMessageCardProps) {
  const lowerCaseStatus = status.toLowerCase();
  const iconProps = getStatusIcon(lowerCaseStatus);
  return <MessageCard {...iconProps} {...rest} />;
}

function getStatusIcon(status: string) {
  const iconPrefix = 'Ripple';
  if (!status) return;
  switch (status) {
    case 'success':
      return {
        icon: `${iconPrefix}-${status}`,
        iconClass: colorStyles[status],
      };
    case 'failure':
      return {
        icon: `${iconPrefix}-failed`,
        iconClass: colorStyles[status],
      };
    case 'pending':
      return {
        icon: `${iconPrefix}-${status}`,
        iconClass: colorStyles[status],
      };
    case 'processing':
      return {
        icon: `${iconPrefix}-${status}`,
        iconClass: colorStyles[status],
      };
    case 'skipped':
      return {
        icon: `${iconPrefix}-${status}`,
        iconClass: colorStyles[status],
      };
  }
}
