import React from 'react';
import { Hero } from '@harmony-mfe/people.ui.user-profile.hero';
import { CompositionCard } from '@teambit/ui.composition-card';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';

const img = 'https://storage.googleapis.com/docs-images/jessica.jpg';

export const UserHero = () => {
  return (
    <Hero
      title="Jessica Pegula"
      description="Frontend developer and designer."
      profileImage={img}
      data-testid="test-hero"
      userName="jessica"
    />
  );
};

const UserHeroString = `
// user-hero.compositions.jsx
const UserHeroWithDescription = () => {
  return (
    <Hero
      title="Jessica Pegula"
      description="Frontend developer and designer."
      profileImage={img}
      data-testid="test-hero"
      userName="jessica"
    />
  );
};

`;

export const UserHeroExample = () => {
  return (
    <div
      style={{
        display: 'grid',
        gridGap: '20px',
        gridTemplateColumns: 'repeat(auto-fill, 600px)',
      }}
    >
      <CodeSnippet>{UserHeroString}</CodeSnippet>
      <CompositionCard Composition={() => <UserHero />} name="User hero with description" />
    </div>
  );
};
