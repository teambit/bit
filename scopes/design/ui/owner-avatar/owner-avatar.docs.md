---
labels: ['react', 'typescript', 'avatar', 'owner', 'ui']
description: 'An owner avatar component'
---

import { OwnerAvatar } from './owner-avatar';

An owner avatar component that envelops the UserAvatar component, and adds a border to indicate that the user is an owner of a scope.

```js live
() => {
  const userAccount = {
    name: 'defaultAccount',
    type: 'user',
    profileImage: 'https://static.bit.dev/harmony/github.svg',
  };

  return <OwnerAvatar size={32} account={userAccount} />;
};
```
