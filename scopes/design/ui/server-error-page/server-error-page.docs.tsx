import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { ServerErrorPage } from './server-error-page';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>A page component that displays a 500 error message.</Section>
        <Separator />
      </>
    </ThemeContext>
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
