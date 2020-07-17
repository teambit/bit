import { BASE_DOCS_DOMAIN } from '../../constants';

/**
 * schema for analytics.
 */
export default {
  properties: {
    analyticsResponse: {
      required: true,
      default: 'yes',
      description: `help us prioritize new features and bug fixes by enabling us to collect anonymous statistics about your usage. sharing anonymous usage information is completely voluntary and helps us improve Bit and build a better product.
for more information see analytics documentation - https://${BASE_DOCS_DOMAIN}/docs/conf-analytics
would you like to help Bit with anonymous usage analytics? [yes(y)/no(n)]`,
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
