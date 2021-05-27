import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { ServerErrorPage } from './server-error-page';

export default function Overview() {
  return (
    <ThemeCompositions>
      <>
        <Section>A page component that displays a 500 error message.</Section>
        <Separator />
      </>
    </ThemeCompositions>
  );
}

Overview.abstract = 'A 500 error page.';

Overview.labels = ['react', 'typescript', '500', 'error', 'page'];

Overview.examples = [
  {
    scope: {
      ServerErrorPage,
    },
    title: '500 page',
    description: '500 error message',
    jsx: <ServerErrorPage />,
  },
];
