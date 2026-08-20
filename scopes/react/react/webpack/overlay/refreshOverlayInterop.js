/* eslint-disable */
// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

// Thin mapping between @pmmmwh/react-refresh-webpack-plugin's overlay
// contract and react-error-overlay. Initialization (startReportingRuntimeErrors)
// is handled by webpackHotDevClient.js which is added as the overlay entry.

const {
  dismissBuildError,
  dismissRuntimeErrors,
  reportBuildError,
  reportRuntimeError,
} = require('react-error-overlay');

module.exports = {
  clearCompileError: dismissBuildError,
  clearRuntimeErrors: dismissRuntimeErrors,
  showCompileError: reportBuildError,
  handleRuntimeError: reportRuntimeError,
};
