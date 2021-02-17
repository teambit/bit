---
description: Returns the React component of a given DOM element.
labels: ['react', 'dom', 'node', 'element']
---

import { domToReact } from './dom-to-react'
import {useEffect, useState} from 'react'

This function returns the React component of a given DOM element.
It reveals, among other things, the [Bit] component ID of the React component responsible to mounting a given DOM element
(which can be used to navigate directly to the component page on a remote scope).

#### How to use?

```ts
import { domToReact } from '@teambit/modules.dom-to-react';

const anElement = document.getElementById('anElement');

domToReact(anElement);
```

<br />

#### Live demostration

```jsx live=true
() => {
  const [reactComponentStr, setReactComponentStr] = useState('');
  useEffect(() => {
    const domElement = document.getElementById('dummy');
    const reactComponent = domToReact(domElement);
    setReactComponentStr(String(reactComponent));
  }, []);

  return (
    <>
      <p id="dummy">a dummy element</p>
      <br />
      <p>The element's corresponding React component:</p>
      <pre style={{ backgroundColor: '#f7f3b0' }}> {reactComponentStr} </pre>
    </>
  );
};
```