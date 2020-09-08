import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { List } from '@teambit/documenter.ui.list';

export const abstract = 'An enviornment for React components';

export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <Paragraph>
            The React aspect (environment) composes together a number of aspects relating to the lifecycle of a React
            component. It spares you the overhead of setting up your own environment and creates a standardized
            environment for your team.
          </Paragraph>
          <Paragraph>
            The React enviornment can be customized and extended by using it in a new environment composition.
          </Paragraph>
          <Paragraph>React uses the following:</Paragraph>
          <List>
            {[
              `Jest (testing)`,
              `TypeScript (compiling)`,
              `Webpack (bundling)  - set to support JSX/TSX, SASS/CSS (incl. CSS modules)`,
              `A documentation template tailored for React components`,
              `React as a default dependency for all components`,
            ]}
          </List>
        </Section>
      </>
    </ThemeContext>
  );
};
