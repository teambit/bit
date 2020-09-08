import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { Separator } from '@teambit/documenter.ui.separator';
import { List } from '@teambit/documenter.ui.list';

import { variantsSnippet, configSnippet, mkdirSnippet, reactEnvTsSnippet } from './code-snippets';

export const abstract = 'A base for concrete implementations of environments.';

export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <Paragraph>The Enviornment aspect serves as a base for concrete implementations of environments.</Paragraph>
          <Paragraph>
            These implementations group and orchestrate a set of aspects that support a component’s entire life-cycle.
          </Paragraph>
          <Paragraph>
            In a nutshell, an implemented environment enable us to dive right into the code, without having to think
            about frameworks, testing libraries, CI pipelines, etc. - it is all pre-configured and standardized.
          </Paragraph>
        </Section>
        <Section>
          <LinkedHeading link="workspace-config">
            Workspace Configuration (using an implemented environment)
          </LinkedHeading>
          <Paragraph>
            Use the ‘variants’ field to select a group of components by their common directory, and set an environment
            for them (use the ‘*’ sign, instead, to select all components in the workspace).
          </Paragraph>
          <Paragraph>For example:</Paragraph>
          <CodeSnippet>{variantsSnippet}</CodeSnippet>
          <Paragraph>
            Some environments may expose an API for configurations. For example, the environment below accpets either
            ‘babel’ or ‘typescipt’ as a compiler.
          </Paragraph>
          <CodeSnippet>{configSnippet}</CodeSnippet>
        </Section>
        <Separator />
        <Section>
          <LinkedHeading link="implement-env">Implementing an Environment</LinkedHeading>
          <Paragraph>
            An implemented environment is, in essence, a composition of different aspects, each relating to some part of
            the lifecycle of a component
          </Paragraph>
          <Paragraph>
            For example, an environment for React components, may compose together the Tester aspect to use Jest, the
            Bundler to use Webpack, the Docs aspect to use a certain template, and so on. All these aspects will be part
            of a single standardized unit, the “React environment”.
          </Paragraph>
          <Paragraph>As a demonstration we’ll go ahead and create our own environment for React components.</Paragraph>
          <Paragraph>We’ll start by creating the structure for our new aspect:</Paragraph>
          <CodeSnippet>{mkdirSnippet}</CodeSnippet>
          <Paragraph>Inside our new directory, we'll create the following files:</Paragraph>
          <List spacing="lg">
            {[
              <>
                <HighlightedText>index.ts</HighlightedText>
                {` is a barrel file for our aspect. Bit requires a barrel file for every component - aspects are no exception.`}
              </>,
              <>
                <HighlightedText>react.aspect.ts</HighlightedText>
                {` will have an “aspect registration object” to be used to register our environment aspect.`}
              </>,
              <>
                <HighlightedText>react.graphql.ts</HighlightedText>
                {` will register a scheme to be used by this enviorment documentation template`}
              </>,
              <>
                <HighlightedText>mount.tsx</HighlightedText>
                {` will have a simple ReactDOM.render function that will take a component ‘composition’  and render it on the page.`}
              </>,
              <>
                <HighlightedText>react.env.ts</HighlightedText>
                {` will set each of the relevant Bit core aspects (like, Tester) to use the selected corresponding aspects (like, Jest). This is where the actual composition of aspects take place.`}
              </>,
              <>
                <HighlightedText>docs, jest, typescript, webpack</HighlightedText>
                {` are all directories with configuration files that are used to configure their corresponding aspects.`}
              </>,
              <>
                <HighlightedText>react.main.runtime.ts</HighlightedText>
                {` will “wrap” our environment to give it what it needs to become a Bit aspect, It will also register it as an aspect.`}
              </>,
            ]}
          </List>
          <LinkedHeading link="react-env" size="sm">
            react.env.ts
          </LinkedHeading>
          <Paragraph>We'll start by building the core of our enviorment aspect.</Paragraph>
          <CodeSnippet>{reactEnvTsSnippet}</CodeSnippet>
          <Paragraph>OK. There's much to unpack here. A few things to notice or look for in the above class:</Paragraph>
          <Paragraph>
            <HighlightedText>Dependency injection</HighlightedText>
          </Paragraph>
          <Paragraph>
            The class "expects" to be instantiated with all its dependencies "injected" into it. These dependencies are
            the "component lifecycle" aspects to be grouped, configured and orchestrated.,
          </Paragraph>
          <Paragraph>
            <HighlightedText>
              A passive configuration of Bit core aspects ('component lifecycle aspects')
            </HighlightedText>
          </Paragraph>
          <Paragraph>
            The class provides Bit core aspects with a ‘get[Something]’ method to use. For example, the ‘getTester’ will
            be used by the Tester aspect.
            <br />
            When these methods are used they determine the way an aspect behaves. For example the ‘getTester’ returns an
            instance of the Jest aspect. This will set the Tester aspect to use Jest as a test runner.
            <br />
            Not all ‘get[Something]’ methods return an aspect. Some of them return plain configurations. For example,
            the ‘getDependencies’ method returns an object that specifies the dependencies to be used by each component.
          </Paragraph>
        </Section>
        <Separator />
        <Section>
          <LinkedHeading link="slots">Slots</LinkedHeading>
        </Section>
      </>
    </ThemeContext>
  );
};
