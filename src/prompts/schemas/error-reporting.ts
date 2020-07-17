/**
 * schema for analytics.
 */
export default {
  properties: {
    errResponse: {
      required: true,
      default: 'yes',
      description: 'would you like to share error information to Bit’s error reporting platform? [yes/no]',
      message: 'please choose yes or no.',
      type: 'string',
      conform(value: string) {
        return (
          value.toLowerCase() === 'y' ||
          value.toLowerCase() === 'n' ||
          value.toLowerCase() === 'yes' ||
          value.toLowerCase() === 'no'
        );
      },
    },
  },
};
