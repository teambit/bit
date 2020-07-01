import React, { StrictMode } from 'react';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import { GraphQlUI } from '../../graphql/graphql.ui';

export type ClientContextProps = {} & React.HTMLAttributes<HTMLDivElement>;

// @HACK @TODO use harmony to get provider
const gqlui = GraphQlUI.provider();

export function ClientContext({ children, ...rest }: ClientContextProps) {
  const GraphqlProvider = gqlui.getProvider;

  return (
    <StrictMode>
      <GraphqlProvider>
        <Theme {...rest}>
          <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
          {children}
        </Theme>
      </GraphqlProvider>
    </StrictMode>
  );
}
