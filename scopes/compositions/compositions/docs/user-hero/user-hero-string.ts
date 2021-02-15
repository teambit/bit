export const userHeroString = `
// user-hero.compositions.jsx

import { Hero } from './user-hero';

const profileImage = 'https://storage.googleapis.com/docs-images/jessica.jpg';

const UserHero = () => {
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

`;
