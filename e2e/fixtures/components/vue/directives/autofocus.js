export default {
  inserted(el, { value }) {
    if (value) {
      el.focus();
    }
  }
};
