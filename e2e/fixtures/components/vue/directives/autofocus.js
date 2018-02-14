import x from 'lodash';

export default {
  inserted(el, { value }) {
    if (value) {
      el.focus();
    }
  }
};
