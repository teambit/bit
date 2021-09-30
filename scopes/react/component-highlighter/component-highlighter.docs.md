---
description: Highlights Bit Components and links to their Bit scope
labels: ['component', 'highlight', 'react']
---

import { HighlightedElement } from './element-highlighter/element-highlighter.compositions';

The component highlighter allows you to visually inspect bit react components, and provides a link to its documentation page.  
It is mostly used for compositions debugging.

<HighlightedElement />

## How to use?

Simplest way to use the component is by wrapping your code with `HoverHighlighter`.  
It will automatically detect components from DOM elements, just by hovering on them.

```tsx
import { HoverHighlightbr } from '@teambit/react.ui.component-highlighter';

function App() {
  return (
    <HoverHighlighter>
      <Header />
      <Feed />
    </HoverHighlighter>
  );
}
```

You can also use it manually, to have more control:

```tsx
const [element, setElement] = useState<HTMLElement | undefined>(undefined);

useEffect(() => setElement(
    document.getElementById('to-highlight')
), [targetRef.current]);

const target = targetElement && {
  element: targetElement,
  id: 'teambit.design/ui/icon-button',

  // explicit overrides:
  link: 'https://bit.dev/teambit/design/ui/icon-button',
  scopeLink: 'https://bit.dev/teambit/design',
};

return (
  <div>
    <div id="to-highlight">highlight target</div>
    {target && <ElementHighlighter target={target} />}
  </div>
);
```

## How does it work?
The manual highlighter works by positioning elements (a frame and a label) to a target element. It uses [PopperJS](https://popper.js.org/) to correctly align them to the element.

The automatic highlighter then adds an event listener for hover events, which automatically tracks mouse movements and finds the most relevant React component using [DOM-to-react](https://bit.dev/teambit/react/modules/dom-to-react). It bubbles up the DOM until it finds a component with bit metadata.

Where does the metadata come from? The highlighter assumes the code has been transpiled by Bit's [custom babel plugin](https://bit.dev/teambit/react/babel/bit-react-transformer). The plugin looks for React components (i.e. functions or classes), and attaches a metadata object to them.
> The `Bit React Transformer` babel plugin is already running in the Preview during `bit start`.  
It only effects the browser bundle, and not the dists.

The result looks like this:

```tsx
var __bit_component = {
  id: 'teambit.base-ui/button@1.0.0',
  homepage: 'https://bit.dev/teambit/base-ui/input/button', 
  exported: true,
}

export function Button() {
  return <div>click me!</div>;
}

// attaches metadata:
Button.__bit_component = __bit_component;
```

## Customization

Use these CSS variables to edit the highlighter color
```css
--bit-highlighter-color: #eebcc9;
--bit-highlighter-color-hover: #f6dae2;
--bit-highlighter-color-active: #e79db1;
```

You can also pass these classes for complete control:

```tsx
const classes = {
  /** containing div */
  container?: string;
  /** border */
  frame?: string;
  /** component id links */
  label?: string;
};

<HoverHighlighter classes={classes}>
  ...
</HoverHighlighter>
```

You can control the size using regular `font-size`.  
Keep in mind that the label can be either two elements (when using component id), and a single element (for other texts)
