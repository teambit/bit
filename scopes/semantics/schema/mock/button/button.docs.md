---
description: A standard, accessible and customizable Button
labels: ['button', 'ui', 'base', 'aria']
---

import { Button } from './button';
import { Image } from '@teambit/base-react.content.image';

Base, non-styled and standard Button. Designed for consistency, accessability and customization. Supports mouse, keyboard, and touch interactions, focus behavior, and ARIA props for both native button elements and custom element types.

On the surface level, building a custom styled Button might seem simple. In reality, there are different issues that emerge such as custom element support (e.g. `a` and `span` elements), mouse and touch event handling and up until keyboard bindings.

### Button with custom styles

```ts live=true
<Button style={{ background: 'red' }}>Click here!</Button>
```

### Button with press event

```ts live=true
<Button onPress={() => alert('hello there!')}>click me</Button>
```

### Button with Icon

```ts live
<Button>
  <Image src="https://static.bit.dev/bit-logo.svg" />
  click me
</Button>
```

### Button used as a link

```ts live=true
<Button href="https://bit.dev">Bit</Button>
```
