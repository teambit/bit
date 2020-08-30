import { execSync } from 'child_process';
import chalk from 'chalk';
import spawn from 'cross-spawn';
import open from 'open';
import { Logger } from '@teambit/logger';

export class OpenBrowser {
  constructor(private logger: Logger) {}
  OSX_CHROME = 'google chrome';

  Actions = Object.freeze({
    NONE: 0,
    BROWSER: 1,
    SCRIPT: 2,
  });

  /**
   * Reads the BROWSER environment variable and decides what to do with it. Returns
   * true if it opened a browser or ran a node.js script, otherwise false.
   */
  open(url: string) {
    const { action, value, args } = this.getBrowserEnv();
    switch (action) {
      case this.Actions.NONE:
        // Special case: BROWSER="none" will prevent opening completely.
        return false;
      case this.Actions.SCRIPT:
        return this.executeNodeScript(value, url);
      case this.Actions.BROWSER:
        return this.startBrowserProcess(value, url, args);
      default:
        throw new Error('Not implemented.');
    }
  }

  private getBrowserEnv() {
    // Attempt to honor this environment variable.
    // It is specific to the operating system.
    // See https://github.com/sindresorhus/open#app for documentation.
    const value = process.env.BROWSER;
    const args = process.env.BROWSER_ARGS ? process.env.BROWSER_ARGS.split(' ') : [];
    let action;
    if (!value) {
      // Default.
      action = this.Actions.BROWSER;
    } else if (value.toLowerCase().endsWith('.js')) {
      action = this.Actions.SCRIPT;
    } else if (value.toLowerCase() === 'none') {
      action = this.Actions.NONE;
    } else {
      action = this.Actions.BROWSER;
    }
    return { action, value, args };
  }

  private executeNodeScript(scriptPath, url) {
    const extraArgs = process.argv.slice(2);
    const child = spawn(process.execPath, [scriptPath, ...extraArgs, url], {
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code !== 0) {
        this.logger.info(chalk.red('The script specified as BROWSER environment variable failed.'));
        this.logger.info(`${chalk.cyan(scriptPath)} exited with code ${code}.`);
      }
    });
    return true;
  }

  private startBrowserProcess(browser: any, url: string, args: any) {
    // If we're on OS X, the user hasn't specifically
    // requested a different browser, we can try opening
    // Chrome with AppleScript. This lets us reuse an
    // existing tab when possible instead of creating a new one.
    const shouldTryOpenChromiumWithAppleScript =
      process.platform === 'darwin' && (typeof browser !== 'string' || browser === this.OSX_CHROME);

    if (shouldTryOpenChromiumWithAppleScript) {
      // Will use the first open browser found from list
      const supportedChromiumBrowsers = [
        'Google Chrome Canary',
        'Google Chrome',
        'Microsoft Edge',
        'Brave Browser',
        'Vivaldi',
        'Chromium',
      ];

      for (const chromiumBrowser of supportedChromiumBrowsers) {
        try {
          // Try our best to reuse existing tab
          // on OSX Chromium-based browser with AppleScript
          execSync(`ps cax | grep "${chromiumBrowser}"`);
          execSync(`osascript openChrome.applescript "${encodeURI(url)}" "${chromiumBrowser}"`, {
            cwd: __dirname,
            stdio: 'ignore',
          });
          return true;
        } catch (err) {
          // Ignore errors.
        }
      }
    }

    // Another special case: on OS X, check if BROWSER has been set to "open".
    // In this case, instead of passing `open` to `opn` (which won't work),
    // just ignore it (thus ensuring the intended behavior, i.e. opening the system browser):
    // https://github.com/facebook/create-react-app/pull/1690#issuecomment-283518768
    if (process.platform === 'darwin' && browser === 'open') {
      browser = undefined;
    }

    // If there are arguments, they must be passed as array with the browser
    if (typeof browser === 'string' && args.length > 0) {
      browser = [browser].concat(args);
    }

    // Fallback to open
    // (It will always open new tab)
    try {
      const options = { app: browser, wait: false, url: true };
      open(url, options).catch(() => {}); // Prevent `unhandledRejection` error.
      return true;
    } catch (err) {
      return false;
    }
  }
}
