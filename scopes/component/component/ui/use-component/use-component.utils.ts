import { LegacyComponentLog } from '@teambit/legacy-component-log';

export function mergeLogs(logs1: LegacyComponentLog[] = [], logs2: LegacyComponentLog[] = []): LegacyComponentLog[] {
  const logMap = new Map<string, LegacyComponentLog>();
  const result: LegacyComponentLog[] = [];

  let index1 = 0;
  let index2 = 0;

  while (index1 < logs1.length && index2 < logs2.length) {
    if (Number(logs1[index1].date) >= Number(logs2[index2].date)) {
      if (!logMap.has(logs1[index1].hash)) {
        logMap.set(logs1[index1].hash, logs1[index1]);
        result.push(logs1[index1]);
      }
      index1 += 1;
    } else {
      if (!logMap.has(logs2[index2].hash)) {
        logMap.set(logs2[index2].hash, logs2[index2]);
        result.push(logs2[index2]);
      }
      index2 += 1;
    }
  }

  while (index1 < logs1.length) {
    if (!logMap.has(logs1[index1].hash)) {
      logMap.set(logs1[index1].hash, logs1[index1]);
      result.push(logs1[index1]);
    }
    index1 += 1;
  }

  while (index2 < logs2.length) {
    if (!logMap.has(logs2[index2].hash)) {
      logMap.set(logs2[index2].hash, logs2[index2]);
      result.push(logs2[index2]);
    }
    index2 += 1;
  }

  return result;
}

export function getOffsetValue(offset, limit, backwards = false) {
  if (offset !== undefined) {
    return backwards ? -(offset + limit) : offset;
  }
  if (limit !== undefined) {
    return 0;
  }
  return undefined;
}
/**
 * Calculates the new offset based on initial offset, current offset, and the number of logs.
 *
 * @param {boolean} [fetchLogsByTypeSeparately] A flag to determine if logs are fetched by type separately.
 * @param {number} [initialOffset] The initial offset.
 * @param {number} [currentOffset] The current offset.
 * @param {any[]} [logs=[]] The array of logs.
 *
 * @returns {number | undefined} -  new offset
 */
export function calculateNewOffset(initialOffset = 0, currentOffset = 0, logs: any[] = []): number | undefined {
  const logCount = logs.length;

  if (initialOffset !== currentOffset && logCount + initialOffset >= currentOffset) return currentOffset;
  return logCount + initialOffset;
}

/**
 * Calculate the availability of more logs.
 *
 * @param {number | undefined} logLimit - The limit for the logs.
 * @param {any} rawComponent - The raw component object containing logs.
 * @param {string} logType - Type of log ('logs', 'tagLogs', 'snapLogs').
 * @param {boolean | undefined} currentHasMoreLogs - Current state of having more logs.
 *
 * @returns {boolean | undefined} - Whether there are more logs available.
 */
export function calculateHasMoreLogs(
  // @todo account for negative offset and limit (the API gives the nearest nodes to the limit, not the exact limit)
  logLimit?: number,
  rawComponent?: any,
  logType = 'logs',
  currentHasMoreLogs?: boolean
): boolean | undefined {
  if (!logLimit) return false;
  if (rawComponent === undefined) return undefined;
  if (currentHasMoreLogs === undefined) return !!rawComponent?.[logType]?.length;
  return currentHasMoreLogs;
}
