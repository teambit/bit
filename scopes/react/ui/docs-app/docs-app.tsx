// import 'reset-css'; // do not include resets, we want compositions with native behavior
import React, { PropsWithChildren } from 'react';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { IconFont } from '@teambit/design.theme.icons-font';
import { RenderingContext } from '@teambit/preview';
import { Base } from './base';
// @TODO - delete this once using @teambit/documenter.theme.theme-context > v4.0.0
import tempStyles from './docs.headers.module.scss';

export type DocsAppProps = {
  Provider?: React.ComponentType;
  docs?: docsFile;
  componentId: string;
  compositions: [React.ComponentType];
  renderingContext: RenderingContext;
};

export function DocsApp({ Provider = Noop, docs, componentId, compositions, renderingContext }: DocsAppProps) {
  return (
    <Provider>
      <ThemeContext className={tempStyles.headingOverrides}>
        <IconFont query="jyyv17" />
        <Base docs={docs} componentId={componentId} compositions={compositions} renderingContext={renderingContext} />
      </ThemeContext>
    </Provider>
  );
}

function Noop({ children }: PropsWithChildren<{}>) {
  return <>{children}</>;
}
