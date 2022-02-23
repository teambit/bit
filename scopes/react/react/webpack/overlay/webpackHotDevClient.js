/* eslint-disable promise/catch-or-return */
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const stripAnsi = require('strip-ansi');
const ErrorOverlay = require('react-error-overlay');
const url = require('url');
const launchEditorEndpoint = require('./launch-editor-endpoint');
const formatWebpackMessages = require('./format-webpack-messages');

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  // Keep this sync with errorOverlayMiddleware.js
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fetch(
    `${launchEditorEndpoint}?fileName=${window.encodeURIComponent(
      errorLocation.fileName
    )}&lineNumber=${window.encodeURIComponent(errorLocation.lineNumber || 1)}&colNumber=${window.encodeURIComponent(
      errorLocation.colNumber || 1
    )}`
  );
});

// We need to keep track of if there has been a runtime error.
// Essentially, we cannot guarantee application state was not corrupted by the
// runtime error. To prevent confusing behavior, we forcibly reload the entire
// application. This is handled below when we are notified of a compile (code
// change).
// See https://github.com/facebook/create-react-app/issues/3096
let hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError() {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    // TODO: why do we need this?
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// Connect to WebpackDevServer via a socket.
const querystring = module.id.substring(module.id.indexOf('?'));
const urlParams = new URLSearchParams(querystring);

const connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: window.location.hostname,
    port: window.location.port,
    // Hardcoded in WebpackDevServer
    pathname: urlParams.get('sockPath') || '/sockjs-node',
    // pathname: '_hmr/teambit.bad-jokes/extensions/harmony-react',
    slashes: true,
  })
);

// Unlike WebpackDevServer client, we won't try to reconnect
// to avoid spamming the console. Disconnect usually happens
// when developer stops the server.
connection.onclose = function () {
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    // eslint-disable-next-line no-console
    console.info('The development server has disconnected.\nRefresh the page if necessary.');
  }
};

// Remember some state related to hot module replacement.
let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

function clearOutdatedErrors() {
  // Clean up outdated compile errors, if any.
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      // eslint-disable-next-line no-console
      console.clear();
    }
  }
}

// Successful compilation.
function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  // Attempt to apply hot updates or reload.
  if (isHotUpdate) {
    tryApplyUpdates(function onHotUpdateSuccess() {
      // Only dismiss it when we're sure it's a hot update.
      // Otherwise it would flicker right before the reload.
      tryDismissErrorOverlay();
    });
  }
}

// Compilation with warnings (e.g. ESLint).
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  function printWarnings() {
    // Print warnings to the console.
    const formatted = formatWebpackMessages({
      warnings,
      errors: [],
    });

    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < formatted.warnings.length; i++) {
        if (i === 5) {
          // eslint-disable-next-line
          console.warn('There were more warnings in other files.\n' + 'You can find a complete log in the terminal.');
          break;
        }
        // eslint-disable-next-line no-console
        console.warn(stripAnsi(formatted.warnings[i]));
      }
    }
  }

  printWarnings();

  // Attempt to apply hot updates or reload.
  if (isHotUpdate) {
    tryApplyUpdates(function onSuccessfulHotUpdate() {
      // Only dismiss it when we're sure it's a hot update.
      // Otherwise it would flicker right before the reload.
      tryDismissErrorOverlay();
    });
  }
}

// Compilation with errors (e.g. syntax error or missing modules).
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  // "Massage" webpack messages.
  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  // Only show the first error.
  ErrorOverlay.reportBuildError(formatted.errors[0]);

  // Also log them to the console.
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < formatted.errors.length; i++) {
      // eslint-disable-next-line no-console
      console.error(stripAnsi(formatted.errors[i]));
    }
  }

  // Do not attempt to reload now.
  // We will reload on next success instead.
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// There is a newer version of the code available.
function handleAvailableHash(hash) {
  // Update last known compilation hash.
  mostRecentCompilationHash = hash;
}

// Handle messages from the server.
connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  switch (message.type) {
    case 'hash':
      handleAvailableHash(message.data);
      break;
    case 'still-ok':
    case 'ok':
      handleSuccess();
      break;
    case 'content-changed':
      // Triggered when a file from `contentBase` changed.
      window.location.reload();
      break;
    case 'warnings':
      handleWarnings(message.data);
      break;
    case 'errors':
      handleErrors(message.data);
      break;
    default:
    // Do nothing.
  }
};

// Is there a newer version of this code available?
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  // __webpack_hash__ is the hash of the current compilation.
  // It's a global variable injected by webpack.
  return mostRecentCompilationHash !== __webpack_hash__;
}

// webpack disallows updates in other states.
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    // HotModuleReplacementPlugin is not in webpack configuration.
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  function handleApplyUpdates(err, updatedModules) {
    if (err || !updatedModules || hadRuntimeError) {
      window.location.reload();
      return;
    }

    if (typeof onHotUpdateSuccess === 'function') {
      // Maybe we want to do something.
      onHotUpdateSuccess();
    }

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdates();
    }
  }

  // https://webpack.github.io/docs/hot-module-replacement.html#check
  const result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  // // webpack 2 returns a Promise instead of invoking a callback
  if (result && result.then) {
    result.then(
      function (updatedModules) {
        handleApplyUpdates(null, updatedModules);
      },
      function (err) {
        handleApplyUpdates(err, null);
      }
    );
  }
}
