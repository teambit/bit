import React, { useEffect, useState } from 'react';
import { UserHero } from './user-hero';
import { ScopeList } from './scope-list/scopes-list';
import { CompositionCard } from '@teambit/ui.composition-card';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { DotsLoader } from '@teambit/base-ui.elements.dots-loader';

const UserProfile = () => {
  return (
    <>
      <UserHero />
      <ScopeList list={scopesData} />
    </>
  );
};

const UserProfileWithLoader = () => {
  const [isLoading, setIsLoading] = useState(true);
  const toggleWaitTimes = () => {
    return isLoading ? 6000 : 800;
  };
  useEffect(() => {
    setTimeout(() => setIsLoading((prev) => !prev), toggleWaitTimes());
  }, [isLoading]);

  return <div style={{ height: 600 }}>{isLoading ? <UserProfile /> : <DotsLoader />}</div>;
};

export const UserProfileExample = () => {
  return (
    <div
      style={{
        display: 'grid',
        gridGap: '20px',
        gridTemplateColumns: 'repeat(auto-fill, 600px)',
      }}
    >
      <CodeSnippet>{UserProfileString}</CodeSnippet>
      <CompositionCard Composition={() => <UserProfileWithLoader />} name="User profile with scopes" />
    </div>
  );
};

const scopesData = [
  {
    id: 'teambit.base-ui',
    description: 'A collection of minimal, bare, and well-crafted UI elements.',
    componentCount: '68',
    visibility: 'Public',
  },
  {
    id: 'teambit.base-ui',
    description: 'A collection of minimal, bare, and well-crafted UI elements.',
    componentCount: '68',
    visibility: 'Public',
  },
  {
    id: 'teambit.evangelist',
    description: 'Reusable UI components for marketing projects.',
    componentCount: '54',
    visibility: 'Public',
  },
  {
    id: 'teambit.evangelist',
    description: 'Reusable UI components for marketing projects.',
    componentCount: '54',
    visibility: 'Public',
  },
];

const UserProfileString = `
// user-hero.compositions.jsx

import { Hero } from './hero';

import React, { useEffect } from 'react';
import { DotsLoader } from '@teambit/base-ui.elements.dots-loader';
import { Error } from '@teambit/base-ui.input.error';
import { ScopeList } from '@harmony-mfe/scopes.ui.scopes.scopes-list';
import { useUser } from '@harmony-mfe/people.ui.hooks.use-user';
import styles from './user-profile.module.scss';

export const UserProfileWithScopes = () => {
  const [getUser, scopes, user, isLoading, error] = useUser();

  useEffect(() => {
    const interval = setInterval(() => {
        getUser();
    }, 6000);
    return () => clearInterval(interval);   
  }, []);

  if (isLoading) return <LoaderRibbon active={isLoading} />;
  return (
    <div className={styles.userProfile} >
      <Hero
        title={user.title}
        description={user.description}
        profileImage={user.image}
      />
      {error !== '' ? <Error>{error}</Error> : <ScopeList list={scopes} />}
    </div>
  );
}

  
`;
