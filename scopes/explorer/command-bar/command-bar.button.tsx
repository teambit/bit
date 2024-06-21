import React from 'react';
import { ActionButton } from '@teambit/design.buttons.action-button';

export type CommandBarButtonProps = {
  onClick: () => void;
};

export function CommandBarButton({ onClick }: CommandBarButtonProps) {
  return <ActionButton onClick={onClick} icon="magnifying-cli" displayName="Go to..." />;
}
