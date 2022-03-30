---
description: Highlights Bit Components and links to their Bit scope
labels: ['component', 'highlight', 'react']
---

import { HighlightedElement } from './element-highlighter/element-highlighter.compositions';

The component highlighter allows you to visually inspect bit react components, and provides a link to its documentation page.  
It is mostly used for compositions debugging.

<HighlightedElement />

## How to use?

Simplest way to use the component is by wrapping your code with `ComponentHighlighter`.  
It will automatically detect components from DOM elements, just by hovering on them.

```tsx
import { ComponentHighlighter } from '@teambit/react.ui.component-highlighter';

function App() {
  return (
    <ComponentHighlighter>
      <Header />
      <Feed />
    </ComponentHighlighter>
  );
}
```

You can also use it manually, to have more control:

```tsx
import { ElementHighlighter } from '@teambit/react.ui.component-highlighter';

function ManualHighlight() {
  const targetRef = createRef<HTMLElement | undefined>(null);

  return (
    <div>
      <div ref={targetRef}>highlight target</div>
      <ElementHighlighter targetRef={targetRef} components={['teambit.design/ui/icon-button']} />
    </div>
  );
}
```

## How does it work?

The manual highlighter works by positioning elements (a frame and a label) to a target element. It uses [PopperJS](https://popper.js.org/) to correctly align them to the element.

The automatic highlighter then adds an event listener for hover events, which automatically tracks mouse movements and finds the most relevant React component using [DOM-to-react](https://bit.dev/teambit/react/modules/dom-to-react). It bubbles up the DOM until it finds a component with bit metadata.

Where does the metadata come from? The highlighter assumes the code has been transpiled by Bit's [custom babel plugin](https://bit.dev/teambit/react/babel/bit-react-transformer). The plugin looks for React components (i.e. functions or classes), and attaches a metadata object to them.

> The `Bit React Transformer` babel plugin is already running in the Preview, during `bit start`.  
> It only effects the browser bundle, and not the dists.

The result looks like this:

```tsx
var __bit_component = {
  id: 'teambit.base-ui/button@1.0.0',
  homepage: 'https://bit.dev/teambit/base-ui/input/button',
  exported: true,
};

export function Button() {
  return <div>click me!</div>;
}

// attaches metadata:
Button.__bit_component = __bit_component;
```

### Modes

The Component Highlighter comes in a few different modes:

- `hover` - this will track your mouse movements, and show the highlighter for the element the user is currently hovering on.
- `allChildren` - this automatically detects all components nested inside the highlighter, and apply a highlighter to them. Currently, this detection only happens once on initial setup, so it does not detect changes.

In addition to changing the `mode` prop, you can also use convenience exports from the same package:

```tsx
import { ChildrenHighlighter, HoverHighlighter } from '@teambit/react.ui.component-highlighter';

function example() {
  return (
    <div>
      <HoverHighlighter>
        <App />
      </HoverHighlighter>

      <ChildrenHighlighter>
        <App />
      </ChildrenHighlighter>
    </div>
  );
}
```

### Debounce

Normally, moving quickly between elements could produce a jitter effect, where the highlighter "jumps" between elements, making interaction difficult.
A debounce mitigates this by batching re-targets and smooths out the experience.  
First time selection will always happen immediately, for a snappy experience.

You can control the debounce rate with the `debounceSelection` prop. (default - `80ms`)

## Exclusions Zones

To disabled highlighting in a specific area of the DOM, you can use the `<ExcludeHighlighter />` component:

```tsx
import { ExcludeHighlighter, excludeHighlighterAtt } from '@teambit/react.ui.component-highlighter';

// ...

return (
  <div>
    <ExcludeHighlighter>
      <Card>this component will not be highlighted</Card>
    </ExcludeHighlighter>

    {/* you can also add the exclude attribute without making a new div */}
    <Card {...excludeHighlighterAtt}>this component will also be skipped</Card>
  </div>
);
```

Another options would be use use the `rule` prop.  
Inspired by Webpack rules, it provides a query selector or function that the highlighter target will have to match.  
For example:

```tsx
<ComponentHighlighter rule="#include *">
  <Button>will not be highlighted</Button>
  <div id="include">
    <Button>this will be highlighted</Button>
  </div>
</ComponentHighlighter>
```

You can also filter by component id, using the `componentRule` prop:

```tsx
<ComponentHighlighter componentRule="teambit.design/ui/icon-button">
  <Paragraph>will not be highlighted</Paragraph>
  <Button>this will be highlighted</Button>
</ComponentHighlighter>
```

## Customization

Use these CSS variables to edit the highlighter color

```css
--bit-highlighter-color: #eebcc9;
--bit-highlighter-color-hover: #f6dae2;
--bit-highlighter-color-active: #e79db1;
--bit-highlighter-shadow: 0px 11px 29px 0px rgba(0, 0, 0, 0.23));
```

While it is preferred to use the css variables, you can also set them using react props:

```tsx
<ComponentHighlighter bgColor="#eebcc9" bgColorHover="#f6dae2" bgColorActive="#e79db1">
  ...
</ComponentHighlighter>
```

And for complete control, you can pass these classes:

```tsx
const classes = {
  /** containing div */
  container?: string;
  /** border */
  frame?: string;
  /** component id links */
  label?: string;
};

<ComponentHighlighter classes={classes}>
  ...
</ComponentHighlighter>
```

You can control the size using regular `font-size`.  
Keep in mind that the label can be either two elements (when using component id), and a single element (for other texts)
