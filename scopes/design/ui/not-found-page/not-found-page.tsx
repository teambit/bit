import React from 'react';
import { ErrorPage, ContactIcons } from '@teambit/design.ui.error-page';

export type NotFoundPageProps = React.HTMLAttributes<HTMLDivElement>;

export function NotFoundPage({ ...rest }: NotFoundPageProps) {
  return (
    <ErrorPage {...rest} code={404} title="Page not found">
      <ContactIcons />
    </ErrorPage>
  );
}
