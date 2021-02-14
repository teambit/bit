import React from 'react';
import { CompositionCard } from '@teambit/ui.composition-card';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { Hero } from '../hero';
import { ExampleLayout } from '../example-layout';
import { userHeroString } from './user-hero-string';

const profileImage = 'https://storage.googleapis.com/docs-images/jessica.jpg';

export const UserHero = () => {
  return (
    <Hero
      title="Jessica Pegula"
      description="Frontend developer and designer."
      profileImage={profileImage}
      data-testid="test-hero"
      userName="jessica"
    />
  );
};

export const UserHeroExample = () => {
  return (
    <ExampleLayout>
      <CodeSnippet>{userHeroString}</CodeSnippet>
      <CompositionCard Composition={() => <UserHero />} name="User hero with description" />
    </ExampleLayout>
  );
};
