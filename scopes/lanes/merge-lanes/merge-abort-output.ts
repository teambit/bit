import chalk from 'chalk';
import type { CheckoutProps } from '@teambit/checkout';
import type { Report } from '@teambit/cli';
import { checkoutOutput } from '@teambit/checkout/dist/checkout-output.js';
import { formatItem, formatSuccessSummary, joinSections } from '@teambit/cli/dist/output-formatter.js';

/** Shared public report formatting; recovery adapters supply metadata only. */
export function formatLaneMergeAbort(
  {
    checkoutResults,
    restoredItems,
    checkoutError,
  }: {
    checkoutResults?: Parameters<typeof checkoutOutput>[0];
    restoredItems: string[];
    checkoutError?: { message: string };
  },
  checkoutProps: CheckoutProps
): string | Report {
  const getCheckoutErrorStr = () => {
    if (!checkoutError) return '';
    const errMsg = `\n\nFailed to change component files to the pre-merge state due to an error:
${checkoutError.message}
please fix the error and then run "bit checkout reset --all" to revert the components to the pre-merge state`;
    return chalk.red(errMsg);
  };

  const checkoutResult = checkoutResults ? checkoutOutput(checkoutResults, checkoutProps) : '';
  const restoredItemsOutput = restoredItems.map((item) => formatItem(item)).join('\n');
  const extraSections = [
    `${formatSuccessSummary('The following have been restored successfully')}\n${restoredItemsOutput}`,
    getCheckoutErrorStr(),
  ];

  if (typeof checkoutResult !== 'string') {
    const data = joinSections([checkoutResult.data, ...extraSections]);
    const details = checkoutResult.details ? joinSections([checkoutResult.details, ...extraSections]) : undefined;
    return { data, code: checkoutResult.code, details };
  }
  return joinSections([checkoutResult, ...extraSections]);
}
