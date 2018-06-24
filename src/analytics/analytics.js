/** @flow */
import serializeError from 'serialize-error';
import path from 'path';
import hashObj from 'object-hash';
import uniqid from 'uniqid';
import yn from 'yn';
import R from 'ramda';
import os from 'os';
import omitBy from 'lodash.omitby';
import { fork } from 'child_process';
import { setSync, getSync } from '../api/consumer/lib/global-config';
import { analyticsPrompt, errorReportingPrompt } from '../prompts';
import {
  CFG_ANALYTICS_USERID_KEY,
  CFG_ANALYTICS_REPORTING_KEY,
  CFG_ANALYTICS_ERROR_REPORTS_KEY,
  CFG_ANALYTICS_ANONYMOUS_KEY,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  DEFAULT_BIT_ENV,
  CFG_ANALYTICS_ENVIRONMENT_KEY
} from '../constants';

const LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  FATAL: 'fatal'
};

class Breadcrumb {
  category: string;
  message: string;
  data: Object;

  constructor(category: string, message: string, data: Object) {
    this.category = category;
    this.message = message;
    this.data = data;
  }
}
class Analytics {
  static username: string;
  static command: string;
  static release: string;
  static args: string[];
  static flags: Object = {};
  static success: boolean = true;
  static nodeVersion: string;
  static os: string;
  static extra: ?Object = {};
  static level: LEVEL;
  static error: Error | string | Object;
  static breadcrumbs: Array<Breadcrumb> = [];
  static analytics_usage: boolean;
  static error_usage: boolean;
  static anonymous: boolean;
  static environment: string;

  static getID(): string {
    const id = getSync(CFG_ANALYTICS_USERID_KEY);
    if (id) return id;
    const newId = uniqid();
    setSync(CFG_ANALYTICS_USERID_KEY, newId);
    return newId;
  }

  static promptAnalyticsIfNeeded(cmd: string): Promise<void> {
    function shouldPromptForAnalytics() {
      // do not prompt analytics approval for bit config command (so you can configure it in CI envs)
      if (cmd.length && cmd[0] !== 'config') {
        const analyticsReporting = getSync(CFG_ANALYTICS_REPORTING_KEY);
        const errorReporting = getSync(CFG_ANALYTICS_ERROR_REPORTS_KEY);
        return R.isNil(analyticsReporting) && R.isNil(errorReporting);
      }
      return false;
    }

    if (shouldPromptForAnalytics()) {
      const uniqId = uniqid();
      if (!getSync(CFG_ANALYTICS_USERID_KEY)) setSync(CFG_ANALYTICS_USERID_KEY, uniqId);
      return analyticsPrompt().then(({ analyticsResponse }) => {
        setSync(CFG_ANALYTICS_REPORTING_KEY, yn(analyticsResponse));
        if (!yn(analyticsResponse)) {
          return errorReportingPrompt().then(({ errResponse }) => {
            return setSync(CFG_ANALYTICS_ERROR_REPORTS_KEY, yn(errResponse));
          });
        }
        return Promise.resolve();
      });
    }
    return Promise.resolve();
  }
  static _hashFlags(flags: Object) {
    const hashedFlags = {};
    const nilOrFalse = val => R.isNil(val) || val === false;
    const filteredFlags = omitBy(flags, nilOrFalse);
    if (this.anonymous && !R.isEmpty(filteredFlags)) {
      Object.keys(filteredFlags).forEach((key) => {
        if (typeof flags[key] === 'boolean') {
          hashedFlags[key] = flags[key];
        } else {
          hashedFlags[key] = hashObj(flags[key]);
        }
      });
      return hashedFlags;
    }
    return filteredFlags;
  }
  static init(command: string, flags: Object, args: string[], version) {
    this.anonymous = yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
    this.command = command;
    this.flags = this._hashFlags(flags);
    this.release = version;
    this.args = this.anonymous ? hashObj(args) : args;
    this.nodeVersion = process.version;
    this.os = process.platform;
    this.level = LEVEL.INFO;
    this.username = !this.anonymous
      ? getSync(CFG_USER_EMAIL_KEY) || getSync(CFG_USER_NAME_KEY) || os.hostname() || this.getID()
      : this.getID();
    this.analytics_usage = yn(getSync(CFG_ANALYTICS_REPORTING_KEY), { default: false });
    this.error_usage = this.analytics_usage ? true : yn(getSync(CFG_ANALYTICS_ERROR_REPORTS_KEY), { default: false });
    this.environment = getSync(CFG_ANALYTICS_ENVIRONMENT_KEY) || DEFAULT_BIT_ENV;
  }

  static async sendData() {
    if (this.analytics_usage || (this.error_usage && !this.success)) {
      const forked = fork(path.join(__dirname, 'analytics-sender.js'), { silent: true });
      forked.send(this.toObject());
    }

    return Promise.resolve();
  }

  static setError(level: string = LEVEL.ERROR, err: Error): void {
    this.level = level;
    this.error = serializeError(err);
    this.success = false;
  }

  static setExtraData(key, value) {
    this.extra[key] = value;
  }
  static incExtraDataKey(key, value) {
    if (this.extra[key]) {
      this.extra[key] += value || 1;
    } else {
      this.extra[key] = value || 1;
    }
  }
  static hashData(data: any) {
    if (this.anonymous) {
      return hashObj(data);
    }
    return data;
  }
  static addBreadCrumb(category: string, message: string, data?: Object) {
    this.breadcrumbs.push(new Breadcrumb(category, message, data));
  }
  static toObject() {
    return {
      username: this.username,
      command: this.command,
      flags: this.flags,
      args: this.args,
      release: this.release,
      extra: this.extra,
      nodeVersion: this.nodeVersion,
      os: this.os,
      level: this.level,
      error: this.error,
      success: this.success,
      breadcrumbs: this.breadcrumbs,
      analytics_usage: this.analytics_usage,
      error_usage: this.analytics_usage,
      environment: this.environment
    };
  }
}

module.exports = { LEVEL, Analytics };
