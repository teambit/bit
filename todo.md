refactoring to do in Bit:

- config api is far too concete and causes coupling, we need to delegate configuration to harmony.
- refactor all implmentations of api file to or Bit extensions for now.
- chanage the name of the debug environment variable from BLUEBIRD_DEBUG to DEBUG.
- refactor filesystem to be given to Bit so it could be reaplced from the outside.
- rewrite and replace cli infraturcture
  - React components for UI using Ink or anything else.
  - support stdout streaming through extensions.
  - extensions 
- refactor and narrow scope and workspace public api.
- refactor app.ts to cli.ts.
- consolidate and refactor file system and path selection outside of Bit through workspace.
- redesign bit's api in the "Bit" module and expose it as our api. 
