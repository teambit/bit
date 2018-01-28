/** @flow */

/**
 * schema for remote remove.
 */
export default {
  properties: {
    shoudRemove: {
      required: true,
      description: "are you shure you want to remove from remote(yes/no)'",
      message: 'please answer y or n.',
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
