REFACTOR GUIDE FOR WATCHER EXTENSION.

- watcher should accept an array of file and handle watching for file changes.
- workspace should register a slot which listens to file changes and reload the component.
- workspace allow extension to register a slot which listens to component changes.
- workspace graphql should emit an event through subscription (onComponentChange) after reloading all changed components.
- hook should be exposed from components on load in which extension can register to add data.


- more important events
  - apply onComponentChange
  - Scope
    - onComponentChange

