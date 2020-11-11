import React from 'react';
import type { LinkProps } from '@teambit/ui.routing.native-link';
import { useRouting } from '@teambit/ui.routing.provider';

export type { LinkProps };

export function Link(props: LinkProps) {
  const ActualLink = useRouting().Link;
  return <ActualLink {...props} />;
}
