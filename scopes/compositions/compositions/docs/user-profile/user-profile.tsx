import React, { useEffect, useState } from 'react';
import { CompositionCard } from '@teambit/ui.composition-card';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { DotsLoader } from '@teambit/base-ui.elements.dots-loader';
import { UserHero } from '../user-hero';
import { ScopeList } from '../scope-list';
import { ExampleLayout } from '../example-layout';
import { scopeData } from './scope-data';
import { userProfileString } from './user-profile-string';

const UserProfile = () => {
  return (
    <>
      <UserHero />
      <ScopeList list={scopeData} />
    </>
  );
};

const UserProfileWithLoader = () => {
  const [isLoading, setIsLoading] = useState(true);
  const stopLoading = () => setIsLoading(false);

  useEffect(() => {
    setTimeout(stopLoading, 3000);
  }, []);

  return <div style={{ height: 600 }}>{isLoading ? <DotsLoader /> : <UserProfile />}</div>;
};

export const UserProfileExample = () => {
  return (
    <ExampleLayout>
      <CodeSnippet>{userProfileString}</CodeSnippet>
      <CompositionCard Composition={() => <UserProfileWithLoader />} name="User profile with scopes" />
    </ExampleLayout>
  );
};
