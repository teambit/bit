/** @flow */

/**
 * schema for remote remove.
 */
export default {
  properties: {
    shoudRemove: {
      required: true,
      description: "are you sure you want to remove from remote scope (yes/no)'",
      message: 'please answer yes or no.',
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
