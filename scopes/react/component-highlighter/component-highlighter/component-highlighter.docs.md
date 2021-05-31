---
description: Highlights Bit Components and links to their Bit scope
labels: ['component', 'highlight', 'react']
---

import {ComponentHighlighter} from './component-highlighter'
import {useEffect} from 'react';

Highlights React components in web pages and add links to their Bit scope and component page.

<img style={{border: '1px solid rgb(212, 212, 212', borderRadius: 6, maxWidth: 800}} src="https://storage.googleapis.com/docs-images/component_highlighter.png"></img>

## How to use?

Invoke the `ComponentHighlighter()` to start highlighting components.

```ts
import { ComponentHighlighter } from '@teambit/react.ui.component-highlighter';

// 'options' are optional.
ComponentHighlighter({ borderColor: 'red' });
ReactDOM.render(App);
```
