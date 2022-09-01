import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { BitId } from '@teambit/legacy/dist/bit-id';
import { BEFORE_CHECKOUT } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { HEAD, LATEST } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import checkoutVersion, { CheckoutProps } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import { ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import NoIdMatchWildcard from '@teambit/legacy/dist/api/consumer/lib/exceptions/no-id-match-wildcard';
import { CheckoutCmd } from './checkout-cmd';
import { CheckoutAspect } from './checkout.aspect';

export class CheckoutMain {
  constructor(private workspace: Workspace, private logger: Logger) {}
  async checkout(values: string[], checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
    this.logger.setStatusLine(BEFORE_CHECKOUT);
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer = this.workspace.consumer;
    await this.parseValues(values, checkoutProps);
    const checkoutResults = await checkoutVersion(consumer, checkoutProps);
    await consumer.onDestroy();
    return checkoutResults;
  }

  private async parseValues(values: string[], checkoutProps: CheckoutProps) {
    const consumer = this.workspace.consumer;
    const firstValue = R.head(values);
    checkoutProps.version =
      firstValue && (BitId.isValidVersion(firstValue) || firstValue === LATEST || firstValue === HEAD)
        ? firstValue
        : undefined;
    const ids = checkoutProps.version ? R.tail(values) : values; // if first value is a version, the rest are ids
    checkoutProps.latestVersion = Boolean(
      checkoutProps.version && (checkoutProps.version === LATEST || checkoutProps.version === HEAD)
    );
    if (checkoutProps.latestVersion && checkoutProps.version === LATEST) {
      this.logger.console(`"latest" is deprecated. please use "${HEAD}" instead`);
    }
    if (checkoutProps.latestVersion && !ids.length) {
      if (checkoutProps.all) {
        this.logger.console(`"--all" is deprecated for "bit checkout ${HEAD}", please omit it.`);
      }
      checkoutProps.all = true;
    }
    if (!firstValue && !checkoutProps.reset && !checkoutProps.all) {
      throw new GeneralError('please enter [values...] or use --reset --all flags');
    }
    if (checkoutProps.reset && checkoutProps.version) {
      throw new GeneralError(
        `the first argument "${checkoutProps.version}" seems to be a version. however, --reset flag doesn't support a version`
      );
    }
    if (ids.length && checkoutProps.all) {
      throw new GeneralError('please specify either [ids...] or --all, not both');
    }
    if (!checkoutProps.reset && !checkoutProps.version) {
      if (ids.length) throw new GeneralError(`the specified version "${ids[0]}" is not a valid version`);
      else throw new GeneralError('please specify a version');
    }
    if (!ids.length) {
      this.populateAllIds(consumer, checkoutProps);
    } else {
      const idsHasWildcard = hasWildcard(ids);
      checkoutProps.ids = idsHasWildcard
        ? this.getIdsMatchedByWildcard(consumer, checkoutProps, ids)
        : ids.map((id) => consumer.getParsedId(id));
    }
  }

  /**
   * when user didn't enter any id and used '--all' flag, populate all ids.
   */
  private populateAllIds(consumer: Consumer, checkoutProps: CheckoutProps) {
    if (!checkoutProps.all) {
      throw new GeneralError('please specify [ids...] or use --all flag');
    }
    checkoutProps.ids = this.getCandidateIds(consumer, checkoutProps);
  }

  private getIdsMatchedByWildcard(consumer: Consumer, checkoutProps: CheckoutProps, ids: string[]): BitId[] {
    const candidateIds = this.getCandidateIds(consumer, checkoutProps);
    const matchedIds = ComponentsList.filterComponentsByWildcard(candidateIds, ids);
    if (!matchedIds.length) throw new NoIdMatchWildcard(ids);
    return matchedIds;
  }

  private getCandidateIds(consumer: Consumer, checkoutProps: CheckoutProps): BitId[] {
    const idsFromBitMap = consumer.bitMap.getAllBitIds();
    return idsFromBitMap.map((bitId) => {
      const version = checkoutProps.latestVersion ? LATEST : bitId.version;
      return bitId.changeVersion(version);
    });
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, loggerMain]: [CLIMain, Workspace, LoggerMain]) {
    const logger = loggerMain.createLogger(CheckoutAspect.id);
    const checkoutMain = new CheckoutMain(workspace, logger);
    cli.register(new CheckoutCmd(checkoutMain));
    return checkoutMain;
  }
}

CheckoutAspect.addRuntime(CheckoutMain);

export default CheckoutMain;
