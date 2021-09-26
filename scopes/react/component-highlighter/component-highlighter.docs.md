---
description: Highlights Bit Components and links to their Bit scope
labels: ['component', 'highlight', 'react']
---

<!-- scopes/react/component-highlighter/ -->

import { HighlightedElement } from './element-highlighter/element-highlighter.compositions'

Highlights React components in web pages, and add links to their Bit scope and component page.

<HighlightedElement />

<!-- <img style={{border: '1px solid rgb(212, 212, 212', borderRadius: 6, maxWidth: 800}} src="https://storage.googleapis.com/docs-images/component_highlighter.png"></img> -->

## How to use?

Simplest way to use the component is by wrapping your code with HoverHighlighter.  
It will automatically detect components from DOM elements, just by hovering on them.

```tsx
import { HoverHighlighter } from '@teambit/react.ui.component-highlighter';

function App() {
  return (
    <HoverHighlighter>
      <Header />
      <Feed />
    </HoverHighlighter>
  );
}
```

You can also use it manually, to have finer control:

```tsx
import { ElementHighlighter } from '@teambit/react.ui.component-highlighter';

function App() {
  const [element, setElement] = useState(null);
  useEffect(() => { setElement(document.getElementById("target"))}, []);

  const target = element ? {} : undefined;

  return (
	  <ElementHighlighter target={target}/>
	  <div id="target">highlight this</div>
  );
}
```

## Customize

Use these CSS Variables to customize:
```css
--bit-highlighter-color: #eebcc9;
--bit-highlighter-color-light: #f6dae2;
--bit-highlighter-color-active: #e79db1;
```
