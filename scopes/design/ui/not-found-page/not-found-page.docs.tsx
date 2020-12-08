import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { NotFoundPage } from './not-found-page';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>A page component that displays a 404 error message.</Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'A 404 error page.';

Overview.labels = ['react', 'typescript', '404', 'error', 'page'];

Overview.examples = [
  {
    scope: {
      NotFoundPage,
    },
    title: '404 page',
    description: '404 error message',
    jsx: <NotFoundPage />,
  },
];
