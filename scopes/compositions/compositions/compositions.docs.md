---
description: Renders component instances as part of different compositions.
labels: ['ui', 'tests']
---

import { UserHeroExample } from './docs/user-hero';
import { UserProfileExample } from './docs/user-profile'

The Compositions aspect renders component 'compositions' in isolation and displays them in the Workspace UI and Scope UI.
'Compositions' are, essentially, small apps that exhibit and test a component in different contexts and variations.

The Compositions aspect is an essential tool to authoring independent components as it renders component instances in "controlled environments", isolated and un-affected by code that was not purposefully included.
This sterile environment provides an accurate understanding of their look and behavior, for manual and automated testings.

Moreover, a component's composition is a way to demonstrate the component for other developers looking to use it, and non-developers, such as designers and product managers, looking to inspect it.

#### Example

<UserHeroExample />

<UserProfileExample />

#### Features

**Create component examples with zero configuration:** Write your compositions the same way you write your components.
Place your examples in the component's `*.compositions.*` file to have them rendered in the Workspace UI with no additional configurations.

**See your components render in all relevant contexts:** - Render components in the visual context of related and dependant components to learn how changes impact other components during development.

**Hot-reloading in workspace UI:** - See various instances of a component render live to reflect most recent changes. Get immediate feedbacks to changes in your component's code.

**Compositions as visual documentation:** - Compositions play an essential part in a component documentation. They demonstrate potential behaviors and use cases for that component. Compositions are another step in promoting components' discoverability, both in your local workspace and in remote scopes.

**Compositions as test samples for your CI** - Use your compositions as samples for automated integration and unit tests, to track and view the impact of changes on all affected components in your different scopes.

**Developer-Designers collaboration** - Make visual compositions accessible to designers (and everyone else) to include them in the development and release process of web applications, in a visual way.

## Quickstart & configurations

Compositions require no configuration. Any `*.compositions.*` or `*.composition.*` file will be loaded and displayed in the workspace UI.
Any tagged version of a component will have its composition included in its build artifacts, to be used as part of the component's preview.

To add your own file pattern for compositions (to be automatically loaded and displayed by the Compositions aspect):

```json
// In the workspace configuration file
{
  "teambit.compositions/compositions": {
    "compositionFilePattern": ["**.my-pattern.tsx", "**.my-pattern-2.jsx"]
  }
}
```

## Creating compositions

> This document uses React code as snippets.

Writing a composition does not require any configuration. Import the component to the component's `*.compositions.tsx` file, use it to build a composition and export the new component (a.k.a, the composition) with a named export.

The name of the export will be converted from PascalCase/camelCase and used for the composition name (e.g, `"CompositionName" --> "Composition name"`).

**For example**, we'll create two compositions, 'Primary button' and 'Secondary button', each of which demonstrates a different variant or usage of that component.
Both compositions will be in themed (i.e, displayed in a specific context).

First, we'll create a new composition file in the component's directory:

```sh
$ touch path/to/component/directory/<component-name>.compositions.tsx
```

Then, we'll import the component and use it to create the compositions:

```javascript
// button.compositions.jsx
import React from 'react';
import { IrisTheme } from '@my-organization/design-system/iris-theme';
import { Button } from './button';

export const PrimaryButton = () => {
  return (
    <IrisTheme>
      <Button importance="cta" style={{ width: 120 }}>
        Primary
      </Button>
    </IrisTheme>
  );
};

export const SecondaryButton = () => {
  return (
    <IrisTheme>
      <Button importance="ghost" style={{ width: 120 }}>
        Secondary
      </Button>
    </IrisTheme>
  );
};
```

<div style={{width: 450, display: 'flex', justifyContent: 'space-between'}}>
    <CompositionCard Composition={() => (<Button importance="cta" style={{ width: 120 }} >Primary</Button>)} name="Primary" />
    <CompositionCard Composition={() => (<Button importance="ghost" style={{ width: 120 }} >Secondary</Button>)} name="Secondary" />
</div>

## Loading compositions

The ["Environment"](https://bit.dev/teambit/envs/envs) in use will automatically detect the composition file for each component and use it to load its compositions to the workspace UI.

## Viewing component compositions

To explore compositions in your Workspace UI, start the local development server for your workspace (`bit start`),
browse to a specific component and select the **compositions** tab.
There, you will see the full list of compositions available for that component, along with additional component meta-data.

## Using compositions for automated testings

Component compositions can be used in automated testing as well as manual examinations. To do that, simply import the compositions in your test file to run the appropriate tests.

For example, the below snapshot test checks the 'Button' component when the 'variant' prop is set to 'primary'.
In addition to simple unit tests, compositions play an important role in integration test as they provide feedback as to how a change to the component may affect potential usages.

```jsx
import React from 'react';
import testRenderer from 'react-test-renderer';
import { PrimaryButton } from './button.compositions.tsx';

describe('Button', () => {
  it('renders correctly as "primary"', () => {
    const component = testRenderer.create(
      <PrimaryButton>test primary variant</PrimaryButton>
    );
    const tree = component.toJSON();
    expect(tree).toMatchSnapshot();
  });
});
```

## Setting providers for all your compositions

Extend the [React](https://bit.dev/teambit/react/react) environment to customize its list of providers with your own composition providers.
The extended environment will then wrap every composition with these providers to make sure your themes or mock data are accessible to all of them,
without you having to repeat that task ever again.

## Compositions and storybook

Storybook displays individual components in different states and variations.
It is designed to help in authoring and displaying standalone components, each of which is usually part of a design system.
In contrast, 'Compositions' is mainly about examining how an independent component looks and behaves when used with other components.
These component integrations serve as a way to examine compositions that are likely to be part of real applications, using manual and automated testing.

If you're looking for a Storybook-like solution, you can find that either in the Storybook extension (currently in development) or by using 'Compositions' for that use-case as well.
