import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { NotFoundPage } from './not-found-page';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>This component is shown when a page does not exist.</Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'A component that shows a 404 error page.';

Overview.labels = ['react', 'typescript', '404', 'error'];

Overview.examples = [
  {
    scope: {
      NotFoundPage,
    },
    title: 'Error Component Status',
    description: 'Using the component with error status property',
    jsx: <NotFoundPage />,
  },
];
