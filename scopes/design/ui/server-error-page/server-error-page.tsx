import React from 'react';
import { ErrorPage, ContactIcons } from '@teambit/design.ui.error-page';

type ServerErrorPageProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function ServerErrorPage({ ...rest }: ServerErrorPageProps) {
  return (
    <ErrorPage {...rest} code={500} title="Internal server error">
      <ContactIcons />
    </ErrorPage>
  );
}
