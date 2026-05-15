import type { CommandDescriptor, CommandOptions } from '@teambit/cli';

/**
 * Declarative command descriptors for this aspect.
 *
 * Part of the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single
 * source of truth for its command's static fields; the matching handler
 * class reads these fields rather than redeclaring them, and
 * `cli.register(descriptor, factory)` consumes the pair.
 */

export const runCommand: CommandDescriptor = {
  name: 'run [app-name]',
  alias: 'c',
  description: 'start an application component locally',
  extendedDescription: `runs application components in their own development server, separate from the "bit start" UI.
  apps are components that create deployable applications (React apps, Node.js servers, etc.).
  when no app name is specified, automatically detects and runs the app if only one exists in the workspace.`,
  helpUrl: 'reference/apps/apps-overview/',
  group: 'run-serve',
  arguments: [
      {
        name: 'app-name',
        description:
          "the app's name is registered by the app (run 'bit app list' to list the names of the available apps)",
      },
    ],
  options: [
      ['d', 'dev', 'start the application in dev mode.'],
      ['p', 'port [port-number]', 'port to run the app on'],
      ['v', 'verbose', 'show verbose output for inspection and print stack trace'],
      // ['', 'skip-watch', 'avoid running the watch process that compiles components in the background'],
      ['w', 'watch', 'watch and compile your components upon changes'],
      ['n', 'no-browser', 'do not automatically open browser when ready'],
      [
        'a',
        'args <argv>',
        'the arguments passing to the app. for example, --args="--a=1 --b". don\'t forget to use quotes to wrap the value to escape special characters.',
      ],
    ] as CommandOptions,
};
