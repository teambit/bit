---
description: Integrates MDX with Bit.
labels: ['mdx', 'bit', 'docs', 'md', 'markdown', 'ui']
---

import _ from 'lodash';
import { Button } from '@teambit/evangelist.elements.button';

The MDX aspect integrates [MDX](https://mdxjs.com/) with Bit to provide an enjoyable and flexible content creation in a Bit workspace.

MDX can be used to author documentation for Bit components, or to create independent content components that can be used across web projects.

### Documenting components

The MDX format is perfect for writing documentation for components as it joins together the ease-of-use and readability of the Markdown syntax with the flexibility that comes when integrating code into it. In addition to that, the modularity that's offered by both technologies (MDX and Bit) enables importing and integrating segments of content from the documentation of other components, into a single documentation file. This can be done to document your components in a way that reflects the way they are built - through a composition of components. That will help in keeping your docs always up-to-date as changes made to a sub-component will propagate to the component's docs. Links to other pages should only be used when the page they reference is expected to be read by only a small percentage of readers.

To start writing your docs with MDX, add a `*.docs.mdx` or `*.docs.md` file to the component's directory and Bit will render it in the component's 'Overview' tab, in the Workspace UI (and later on, after it is exported, in the Scope UI). Bit's development server will hot-reload your documentation to reflect any changes made to it, in real time.


```
// An example documented component file-structure

├── login-form
    ├── index.tsx
    ├── login-form.compositions.tsx
    ├── login-form.docs.mdx
    ├── login-form.spec.tsx
    └── login-form.tsx
```
<br />

> Make sure the Bit environment used by your component supports MDX!

#### Bit-MDX integration

Bit wraps your MDX with its own (customizable) layout to integrate it with the rest of the Workspace/Scope UI. This is done in a few ways:

1. Bit themes your MDX using Bit's [Documenter design system](https://bit.dev/teambit/documenter), to give it a look-and-feel that is consistent with the rest of the Workspace/Scope UI.
2. Bit offers an API to override the component's meta-data (this is done using the frontmatter block at the top of the file).
3. Bit provides a live playground that can be easily integrated into your documentation using the MDX syntax, for live demonstrations of code.

#### Using the frontmatter API

Bit parses your code to generate metadata for your components. This metadata is presented in the component's documentation and is used by Bit.dev's search engine.

To override it, use Bit's frontmatter properties, at the top of your MDX file.

For example:

```md
---
displayName: Login Form
description: My customized description
labels: ['react', 'typescript', 'ui', 'form']
---
```

- `displayName` _string_ overrides the component name.
- `description` _string_ overrides the component description/abstract.
- `labels` _string[]_ overrides the component labels/tags.

#### Using the live playground

To use Bit's live playground add `live=true` to your codeblock.

For example:

````jsx
```jsx live=true
    () => {
        return <p> Hello World! </p>
    }
```
````
The above MDX snippet will be rendered like so:

```jsx live=true
() => {

  return <p> Hello World! </p>
};
```

##### Live playground dependencies
The live playground can access the docs file dependencies. To use an external module, first import it to the docs file.

For example:

````jsx
---
description: A frontmatter exammple.
---

import _ from 'lodash';

```jsx live=true
    () => {
        return <p> { _.camelCase('Hello world') } </p>
    }
```
````

The above MDX snippet will be rendered like so:

```jsx live=true
() => {

  return <p> { _.camelCase('Hello world') } </p>;
};
```


### Independent MDX components

Building with components, whether they are code or markdown, means easier maintainability and better reusability. That naturally translates into faster delivery and more consistent content across web projects.

The MDX aspect can be used to author independent MDX components. Components can be written using MDX and compiled to plain JS, to be consumed by other web projects. Since the MDX aspect is used and handled by your environment, this feature is turned on using the environment's configurations.

For example, to turn on this feature in [`@teambit.react/react`](https://bit.dev/teambit/react/react) environment:

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {
        "mdx": true
      }
    }
  }
}
```

### Collaborating with non-developers

Your docs are not only for other developers. A component's documentation can be used as a hub for collaboration between different stakeholders. 

The verbal descriptions, live examples, images and links to other related artifacts, are all communicating the component's story with little or no code.

<br />

The below example shows easily detectable discrepancies between design and implementation, seen in a demo documentation for a "button" component.

<iframe style={{borderRadius: 6, border: "1px solid #ededed", marginBottom: 25}} width="100%" height="450" src="https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2FjuFzg6Qsc3UKhJ5HZKQZE2%2FBase-UI-Buttons%3Fnode-id%3D465%253A941" allowfullscreen></iframe>


```jsx live=true
    // Buttons do not follow the design when 'disabled'
    <>
      <Button disabled importance="cta" style={{ width: 120 }}>Primary</Button>

      <Button importance="ghost" style={{ width: 120 }}>Secondary</Button>

      <Button style={{ width: 120 }}>Normal</Button>
    </>
```