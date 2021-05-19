---
description: Returns the React component of a given DOM element.
labels: ['react', 'dom', 'node', 'element']
---

import { domToReact } from './dom-to-react'
import { useEffect, useState } from 'react'

This function returns the React component of a given DOM element.  
We use it to get the (Bit) Component ID from the react component.
(which can be used to navigate directly to the component page on a remote scope).

In addition, this component exports the following helper methods:

- `domToFiber(element): FiberNode`: gets the React FiberNode representing this element.
- `toRootFiber(fiberNode): FiberNode`: bubbles up from a FiberNode to root FiberNode of the same component
- `fiberToPrototype(fiber): Component`: finds the React Component that made a FiberNode
- `toRootElement(element): element `: bubbles up from a DOM element to find the root element of the same component.

All methods may return `null` when result is unavailable.

#### How to use?

```ts
import { domToReact } from '@teambit/react.modules.dom-to-react';

const anElement = document.getElementById('anElement');

const reactComponent = domToReact(anElement);
```

#### React versions support

domToReact() assumes React is using the Fiber virtual dom, which is only included in React 16 and 17.  
It is possible to support React 15, but node traversal has not been implemented for it yet.

#### Live demonstration

```jsx live=true
() => {
  const [reactComponentStr, setReactComponentStr] = useState('');

  useEffect(() => {
    const domElement = document.getElementById('dummy');
    const reactComponent = domToReact(domElement);
    setReactComponentStr(String(reactComponent));
  }, []);

  function TargetComponent() {
    return (
      <>
        <p id="dummy">a dummy element</p>
        <br />
        <p>The element's corresponding React component:</p>
        <br />
        <pre style={{ backgroundColor: '#f7f3b0' }}>{reactComponentStr}</pre>
      </>
    );
  }

  return <TargetComponent />;
};
```
