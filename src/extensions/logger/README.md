# Reporter
The reporter extension is in charge of real-time reporting within Bit.

It renders a single status-line on the bottom of the screen.
It also renders a continuous log of real-time messages sent to it from an arbitrary amount of different sources.

## Workflow
The reporter works in "phases". A phase is a brief description of what Bit is doing now (eg. Installing, Building Capsules, etc.)
In order for the reporter to start, we need to start a phase using the `startPhase` method. Once this is done, the reporter prints a title
with the phase name to the screen, and starts showing all logs sent to it.

In order to send logs to the reporter, we must instantiate a Logger instance using the `createLogger` method.
When we create a logger we provide it an id (preferably the component name), and it uses this id to give the logs a unique color.
It will also display this id (in its appropriate color) in the status line.

Once we no longer wish for the reporter to report, we should use the `end` method to stop it.
The reporter can always be started again with the `startPhase` method.

Logs sent to the reporter while not in a `phase` (between `startPhase` and `end`) will not be printed.

If we wish to start a new phase (eg. we finished Installing and now we wish to start Building), we can use the `startPhase` method again.
This will erase all the previous logger IDs from the status line. Stopping a phase with `end` before starting a new one is not necessary.

## API

### Reporter

#### `startPhase(phaseName)`
Starts a reporting phase with the phaseName. It (re)renders the status line and prints the phase name to the terminal.
#### `suppressOutput()`
Suppresses the output of the reporter. This cannot be undone and should be used in environments where we do not wish to have real time reporting at all (eg. JSON output).
#### `createLogger(id)`
Creates a `Logger` instance. The ID should be a component name. This might be enforced in the future.
#### `end()`
Ends the current phase (this is optional as the same effect can be achieved by starting a new phase). Should be performed at least once at the end of the workflow,
otherwise the app will hang.

### Logger

#### createLongProcessLogger: (processDescription: string, totalItems?: number) => LongProcessLogger;
Returns an instance of LongProcessLogger and start logging the process description.

If the process involves iteration over a list of items, such as running tag on a list of components, then pass the `totalItems` as the total number of the components in the list.

Later, during the iteration, call `logProgress(componentName)` on the `LongProcessLogger` instance.
once done, call `end()`, which logs the duration of the process in ms.

The reporter can be used to show the progress in the status-line. To enable this, call `this.reporter.start()`. Once done, call `this.reporter.end()`.

Here is an example of the messages produced by this longProcessLogger. If the reporter is used, the status-line always shows the last message.
```
@teambit/workspace, loading components (total: 20)
@teambit/workspace, loading components (1/20). ui/button
@teambit/workspace, loading components (2/20). ui/form
...
@teambit/workspace, loading components (20/20). ui/page
@teambit/workspace, loading components (completed in 200ms)
```

An example when there is no `totalItems`.
```
@teambit/workspace, loading components
@teambit/workspace, loading components (completed in 200ms)
```

#### info(...messages)
Emits messages as-is to the log. They will receive a unique color according to the id with which the logger was instantiated.

eg. `logger.info('foo', 'bar', 'baz', {some: { more: 'stuff' } })`
#### warn(...messages)
Emits messages to the log with a yellow `WARN:` prefix. They will receive a unique color according to the id with which the logger was instantiated.

eg. `logger.warn('foo', 'bar', 'baz', {some: { more: 'stuff' } })`
#### error(...messages)
TBD
#### debug(...messages)
TBD
#### onInfo(cb)
Calls `cb` every time info is called.

eg. `logger.onInfo((...messages) => {
  // messages is a list of arguments sent to logger.info
})`
#### onWarn(cb)
Calls `cb` every time warn is called.

eg. `logger.onWarn((...messages) => {
  // messages is a list of arguments sent to logger.warn
})`
#### onError(cb)
TBD
#### onDebug(cb)
TBD

## How does it work?
This extension was written in order to provide an interactive terminal experience without breaking the terminal output when it is resized.
It also allows scrolling back through the output once bit has exited.

This is done by not "taking over" the user's terminal using terminal [raw mode](https://en.wikipedia.org/wiki/Terminal_mode).
The only interactive part of the reporter is the last line. It is controlled and cleared as needed using a carriage return (`\r`) and the number of
spaces in `process.stdout.columns` in order to be sure to clear the line from the user's terminal. (eg. `\r                 /*...*/ `)
This is done whenever we wish to log to the screen (eg. with the logger methods) and whenever the screen is resized by listening to `SIGWINCH` events.

The status line re-renders itself on a debounced timer of 100ms to allow for multiple logs (or multiple `SIGWINCH` events) to pass through.
