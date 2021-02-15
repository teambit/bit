---
description: A Bit-MDX integration for simple & powerful component documentation and independent content composition
labels: ['mdx', 'bit', 'docs', 'md', 'markdown', 'ui']
---

import _ from 'lodash';
import { Button } from '@teambit/evangelist.elements.button';

The MDX aspect integrates [MDX](https://mdxjs.com/) with Bit to enable the authoring of component documentation and standalone content components, using the MDX format.   
The MDX format joins together the ease-of-use and readability of the Markdown syntax with the endless possibilities that are offered by JSX. 
The modularity that's offered by both technologies (MDX and Bit) enables MDX files to be exported to a remote scope and imported to other web projects, just like any other Bit component.

#### Example
````md
---
displayName: Login form
description: A simple login form
labels: ['react', 'ui', 'form']
---

import { LoginForm } from './login-form'

## A live example

A simple example of live example:

```jsx live=true
<LoginForm><LoginForm/>
```
````

```
// An example of a documented component file-structure

├── login-form
    ├── index.tsx
    ├── login-form.compositions.tsx
    ├── login-form.docs.md
    ├── login-form.spec.tsx
    └── login-form.tsx
```

#### Features

* __Powerful component composition__: Author clear and engaging documentation that integrates readable Markdown syntax, Bit's live playground and your own customized components.
* __Docs that look and feel like Bit__: Component docs written with MDX (like the one you're reading right now) are themed using Bit's [Documenter design system](https://bit.dev/teambit/documenter) to provide a look-and-feel that is consistent with the Workspace/Scope UI.
* __Bit component frontmatter__: Use Bit's YAML frontmatter to add or override metadata to the component being documented.
* __A simple-to-use live playground__: Use MDX's user-friendly syntax to add live examples of code. No need to worry about dependencies - any module used by the doc file will also be available to code running in the live playground.
* __Independent MDX components__: Author consumable independent content components that can be shared across web projects. Use it to maintain a consistent "voice & tone" and to keep your content always up-to-date.


## Quick start
The MDX aspect is used by various Bit environments. To use it, set your workspace configuration to use an MDX supported environment.

As a default, MDX will only be used for component documentation. To enable the compilation of MDX components, set the `mdx` property to `true`.

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

## Usage

#### Using the frontmatter API
Bit parses your code to generate metadata for your components. This metadata is presented in the component's documentation and is used by Bit.dev's search engine.  
To override it, use Bit's frontmatter properties, at the top of your MDX file.

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

#### Using the live playground with external modules
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

## Use-cases and best practices


### Documenting components

The MDX format is perfect for writing documentation for components as it joins together the ease-of-use and readability
of the Markdown syntax with the great flexibility that's offered by integrating code into it.
In addition to that, the modularity that's offered by both technologies (MDX and Bit) enables importing and integrating
segments of content from the documentation of other components, into a single documentation file.
This can be done to document your components in a way that reflects the way they are built - through a composition of components.
That will help in keeping your docs always up-to-date as changes made to a sub-component will propagate to the component's docs.

> Linking to external pages is, in  many cases,  the  result of technological limitations and not the preferred solution.
If most people reading your docs need to visit an external page in order for them to get the full explanation,
then it makes more sense to have that external text integrated into your docs (by importing it).
<br/>
Now that we have MDX and Bit, that can be done quite easily.

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
