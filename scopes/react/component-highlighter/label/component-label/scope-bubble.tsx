import React from 'react';

import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { ScopeUrl } from '@teambit/component-url';

export interface ScopeBubbleProps extends LinkProps {
  componentId: ComponentID;
}

export function ScopeBubble({ componentId, className, href, ...rest }: ScopeBubbleProps) {
  const scope = componentId.scope;
  const scopeUrl = href || ScopeUrl.toUrl(componentId.scope);

  return (
    <NativeLink href={scopeUrl} external className={className} {...rest}>
      {scope}
    </NativeLink>
  );
}
