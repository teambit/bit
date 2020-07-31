# Create a logger
In your extension, add `LoggerExtension` as a dependency and create a new logger by running
```
LoggerExtension.createLogger('your-extension-id');
```

# Log to a file
The following standard methods are available to log into a file. By default it's the `debug.log` file located at  `~/Library/Caches/Bit/logs` for Mac/Linux or  `$LOCALAPPDATA\Bit` for Windows.

```
logger.silly(message: string, ...meta: any[]);
logger.debug(message: string, ...meta: any[]);
logger.info(message: string, ...meta: any[]);
logger.warn(message: string, ...meta: any[]);
logger.error(message: string, ...meta: any[]);
```

The message color is coded uniquely per extension-id. This way, it's easier to scroll the logs and distinguish between the extensions.

The format of the message logged to the file is **"TIMESTAMP LEVEL: EXT-ID, MSG [META]"**. The "[META]" part is `JSON.stringify` of the second parameter in case it's an object. Otherwise, it's ignored.

JSON format is available as well. To use it, run  `bit config set log_json_format true`.

It's possible to have the console as an extra layer so these messages will be printed to the screen as well, see below.

## Log also to the console

To see the same massages above printed into the screen, use the global flag `--log [level]`. For example, `bit status --log=error`. Alternatively, you can set an environment variable `BIT_LOG` with the desired level.

# Report progress
During the command execution it's helpful to see the progress on the screen. The following options log to the file and in addition, print to the screen. Use only these methods and avoid calling `console.log` to not break the output (or potentially the JSON structure).

> Please note that these methods print to the screen only when a command is not considered "internal" (such commands normally run on the remote server) and when a command is not used with `--json` flag. To specifically disable console-printing to a command, set the `loader` property to `false`.

## Status Line (spinner)
The status-line is a single line on the bottom of the screen, with a spinner/loader prefix. It's changing constantly during the command execution. This is the main indicator for the end-user of what's going on at the moment.

To set the text of this status-line, call:
```
logger.setStatusLine(text: string);
```

Once the command completed, the spinner is stopped and the status-line is cleared. Then, the command results are printed. If, for some reason, it is needed to clear the status-line before, just call `logger.clearStatusLine()`.

## Persist text
Sometimes it's helpful to indicate that a phase has completed. Either successfully or failed. The following methods help with this:
```
// print to the screen with a green `✔` prefix. if message is empty, print the last logged message.
logger.consoleSuccess(message?: string);

// print to the screen with a red `✖` prefix. if message is empty, print the last logged message.
logger.consoleFailure(message?: string);
```
To print without any prefix, use `logger.console(message);`

## Long Running Process Logger
Run the following to get an instance of the `LongProcessLogger` and start logging the process description.
```
logger.createLongProcessLogger(processDescription: string, totalItems?: number): LongProcessLogger;
```

If the process involves iteration over a list of items, such as running tag on a list of components, then pass the `totalItems` as the total number of the components in the list.

Later, during the iteration, call `logProgress(componentName)` on the `LongProcessLogger` instance.
once done, call `end()`, which logs the duration of the process in ms.

Here is an example of the messages produced by this longProcessLogger. The status-line always shows the last message.
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