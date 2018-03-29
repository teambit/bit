/** @flow */
import serializeError from 'serialize-error';
import requestify from 'requestify';
import hashObj from 'object-hash';
import uniqid from 'uniqid';
import yn from 'yn';
import R from 'ramda';
import omitBy from 'lodash.omitby';
import isNil from 'lodash.isnil';
import logger from '../logger/logger';
import { setSync, getSync } from '../api/consumer/lib/global-config';
import {
  CFG_ANALYTICS_USERID_KEY,
  CFG_ANALYTICS_REPORTING_KEY,
  CFG_ANALYTICS_ERROR_REPORTS_KEY,
  CFG_ANALYTICS_ANONYMOUS_KEY,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  ANALYTICS_URL
} from '../constants';

const LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  FATAL: 'fatal'
};

class Breadcrumb {
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
  static flags: Object;
  static success: boolean = true;
  static nodeVersion: string;
  static os: string;
  static extra: ?Object = {};
  static level: string;
  static error: Error | string | Object;
  static breadcrumbs: Array<Breadcrumb> = [];
  static errorName: ?string;
  static analytics_usage: boolean;
  static error_usage: boolean;
  static anonymous: boolean;

  static getID(): string {
    const id = getSync(CFG_ANALYTICS_USERID_KEY);
    const newId = uniqid();
    if (id) return id;
    setSync(CFG_ANALYTICS_USERID_KEY, newId);
    return newId;
  }
  static init(command: string, flags: Object, args: string[], version) {
    const filteredFlags = omitBy(flags, isNil);
    this.anonymous = yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
    this.command = command;
    this.flags =
      this.anonymous && !R.isEmpty(filteredFlags)
        ? Object.keys(filteredFlags).forEach((key) => {
          flags[key] = hashObj(flags[key]);
        })
        : filteredFlags;
    this.release = version;
    this.args = this.anonymous
      ? args.filter(x => x).map((arg) => {
        return arg instanceof Array ? arg.map(hashObj) : hashObj(arg);
      })
      : args;
    this.nodeVersion = process.version;
    this.os = process.platform;
    this.level = LEVEL.INFO;
    this.username = !this.anonymous
      ? getSync(CFG_USER_NAME_KEY) || getSync(CFG_USER_EMAIL_KEY) || this.getID()
      : this.getID();
    this.analytics_usage = yn(getSync(CFG_ANALYTICS_REPORTING_KEY), { default: false });
    this.error_usage = this.analytics_usage ? true : yn(getSync(CFG_ANALYTICS_ERROR_REPORTS_KEY), { default: false });
  }

  static async sendData() {
    if (this.analytics_usage || this.error_usage) {
      return requestify
        .post(ANALYTICS_URL, Analytics.toObejct(), { timeout: 1000 })
        .fail(err => logger.error(`failed sending anonymous usage: ${err.body}`));
    }
    return Promise.resolve();
  }

  static setError(level: string = LEVEL.ERROR, err: Error, errorName: ?string): void {
    this.level = level;
    this.error = serializeError(err);
    this.errorName = errorName;
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
  static toObejct() {
    return {
      username: this.username,
      command: this.command,
      errorName: this.errorName,
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
      error_usage: this.analytics_usage
    };
  }
}

module.exports = { LEVEL, Analytics };
