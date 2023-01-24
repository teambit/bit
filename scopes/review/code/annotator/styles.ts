import { InternalReviewManagerSettings } from './models';

const defaultIcons = {
  ADD_REVIEW: 'https://static.bit.dev/bit-icons/plus.svg',
  LINE_REVIEW: 'https://static.bit.dev/bit-icons/collection.svg',
};

export const defaultStyles: {
  id: string;
  icons: typeof defaultIcons;
  styles: InternalReviewManagerSettings;
} = {
  id: 'monaco_review_manager_styles',
  icons: defaultIcons,
  styles: {
    addReviewStyles: {
      className: 'default_add_review',
      styles: {
        backgroundImage: `url(${defaultIcons.ADD_REVIEW})`,
        backgroundRepeat: 'no-repeat',
        height: '16px',
        width: '16px',
        backgroundSize: '16px',
        marginLeft: '4px',
        cursor: 'pointer',
      },
    },
    lineReviewStyles: {
      className: 'default_line_review',
      styles: {
        backgroundImage: `url(${defaultIcons.LINE_REVIEW})`,
        backgroundRepeat: 'no-repeat',
        height: '16px',
        width: '16px',
        backgroundSize: '16px',
        marginLeft: '4px',
        cursor: 'pointer',
      },
    },
    codeSelectionReviewStyles: {
      className: 'default_code_selection',
      styles: {
        color: 'red',
        textDecoration: 'underline',
        fontWeight: '500',
      },
    },
  },
};
