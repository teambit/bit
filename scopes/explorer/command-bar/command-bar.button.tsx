import React from 'react';
import { ActionButton } from '@teambit/design.buttons.action-button';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';

export type CommandBarButtonProps = {
  onClick: () => void;
};

export function CommandBarButton({ onClick }: CommandBarButtonProps) {
  const { isMinimal } = useWorkspaceMode();
  if (isMinimal) return null;
  return <ActionButton onClick={onClick} icon="magnifying-cli" displayName="Go to..." />;
}
