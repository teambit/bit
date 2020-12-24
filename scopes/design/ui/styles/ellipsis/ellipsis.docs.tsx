import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { Ellipsis } from './index';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          An Ellipsis div, which dislays cut off text with an ellipsis (...) if it doesnt fit into the element's width
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'An ellipsis-enabled div element';

Overview.labels = ['react', 'typescript', 'ellipsis', 'text'];

Overview.examples = [
  {
    scope: {
      Ellipsis,
    },
    title: 'long string',
    description: 'long string with ellipsis displayed',
    jsx: <Ellipsis style={{ width: 100 }}>Looooooooooooooong string</Ellipsis>,
  },
];
