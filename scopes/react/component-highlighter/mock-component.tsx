import React, { PropsWithChildren } from 'react';
import { componentMetaField } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

export function MockTarget({ children, ...rest }: PropsWithChildren<{}>) {
  return <div {...rest}>mocked {children}</div>;
}
MockTarget[componentMetaField] = {
  id: 'teambit.design/ui/icon-button@1.6.2',
};
