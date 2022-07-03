// import 'reset-css'; // do not include resets, we want compositions with native behavior
import React, { PropsWithChildren } from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { IconFont } from '@teambit/design.theme.icons-font';

export type DocsAppProps = {
  Provider?: React.ComponentType;
  children: React.ReactChild
};

export function DocsApp({
  Provider = Noop,
  children
}: DocsAppProps) {
  return (
    <Provider>
      <ThemeContext>
        <IconFont query="q76y7n" />
        {children}
      </ThemeContext>
    </Provider>
  );
}

function Noop({ children }: PropsWithChildren<{}>) {
  return <>{children}</>;
}
