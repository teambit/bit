import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { StandaloneNotFoundPage } from './index';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          A standalone page component that displays a 404 error message and independently contains the required fonts
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'A 404 error page with fonts.';

Overview.labels = ['react', 'typescript', '404', 'error', 'page', 'fonts'];

Overview.examples = [
  {
    scope: {
      StandaloneNotFoundPage,
    },
    title: '404 page with fonts included',
    description: '404 error message with fonts',
    jsx: <StandaloneNotFoundPage />,
  },
];
