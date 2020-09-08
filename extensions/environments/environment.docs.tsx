import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';

import { variantsSnippet, configSnippet } from './code-snippets';

export const abstract =
  'Enviornments composes together a set of aspects, each of which relates to some part of a component lifecycle.';

export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <Paragraph>The Enviornments aspect serves as a base for concrete implementations of environments.</Paragraph>
          <Paragraph>
            These implementations compose together a set of aspects, each of which relates to some part of a component
            lifecycle.
          </Paragraph>
          <Paragraph>
            In a nutshell, an environment allows us to focus on building components without having to deal with setting
            up frameworks, testing libraries, CI pipelines, etc. - it is all pre-configured and standardized.
          </Paragraph>
          <Paragraph>
            A single workspace can have multiple environments to support components of different types.
          </Paragraph>
        </Section>
      </>
    </ThemeContext>
  );
};
