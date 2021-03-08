---
description: Handles the bundlings and rendering of component compositions and documentations
labels: ['core aspect']
---

The Preview aspect handles the bundling and rendering of component compositions and documentation, for the Workspace UI and Scope UI.

Preview is used to display components in development (on `bit start`) as well as in their released versions (assets for the release version are generated as part of the build process).

The Preview aspect handles each component according to the configurations set by the environment that is used by that component. That means both the documentation and the component compositions will be bundled and displayed differently for different environments.

## Rational

In a standard web application, UI components _serving the same application_ are bundled together to produce the necessary assets to make them renderable by the browser.

Components in a Bit workspace are not all in the service of the same application. Each component is authored, tagged and exported as an independent component.
That means a few things:

1. Components in a Bit workspace are not consumed ,directly or indirectly, by a single entry file (e.g, the app's `index.js`). That makes it impossible for the bundler to follow the files needed to be bundled.

2. Different components in a single workspace may be implemented using different technologies and bundled using different configurations or even different bundlers.

Preview solves the above challenges by creating a temporary entry file for each group of components using the same environment.
It then serves this file to the Bundler, to be bundled according to the environment and the purpose of bundling. That is, to display components in development or to display the components' release versions (for a "production-level" exhibition of the component's documentation and compositions).

## Usage

### Extending the Preview aspect

The preview aspect can be extended to generate other renderable artifacts , either when running Bit's development server or as part of the build pipeline (for a component's tagged version).  
These artifacts can present additional information that assists in inspecting a component (for example, showing the results of accessibility tests).
