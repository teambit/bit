/** @flow */

/**
 * schema for remote remove.
 */
export default {
  properties: {
    shoudRemove: {
      required: true,
      description: "are you sure you would like to proceed with this operation? (yes[y]/no[n])'",
      message: 'please use yes or no.',
      type: 'string',
      conform(value) {
        return (
          value.toLowerCase() === 'y' ||
          value.toLowerCase() === 'n' ||
          value.toLowerCase() === 'yes' ||
          value.toLowerCase() === 'no'
        );
      }
    }
  }
};
