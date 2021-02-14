export const userProfileString = `
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
    getUser();
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
‏‏‎ ‎
‏‏‎ ‎
‏‏‎ ‎
`;
