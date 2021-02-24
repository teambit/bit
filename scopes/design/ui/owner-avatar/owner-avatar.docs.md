---
labels: ['react', 'typescript', 'avatar', 'owner', 'ui']
description: 'An owner avatar component'
---

import { OwnerAvatar } from './owner-avatar';

An owner avatar component that envelope the Avatar component.

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
