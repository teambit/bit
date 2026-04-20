/* eslint-disable */
/** this file was copied as is from react-dev-utils/refreshOverlayInterop */

// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

const {
  dismissBuildError,
  dismissRuntimeErrors,
  reportBuildError,
  reportRuntimeError,
  setEditorHandler,
} = require('react-error-overlay');
const launchEditorEndpoint = require('./launchEditorEndpoint');

setEditorHandler(function editorHandler(errorLocation) {
  // Keep this in sync with the error overlay middleware endpoint.
  fetch(
    launchEditorEndpoint +
      '?fileName=' +
      window.encodeURIComponent(errorLocation.fileName) +
      '&lineNumber=' +
      window.encodeURIComponent(errorLocation.lineNumber || 1) +
      '&colNumber=' +
      window.encodeURIComponent(errorLocation.colNumber || 1)
  );
});

module.exports = {
  clearCompileError: dismissBuildError,
  clearRuntimeErrors: dismissRuntimeErrors,
  showCompileError: reportBuildError,
  handleRuntimeError: reportRuntimeError,
};
