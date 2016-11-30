// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true

export default (err: Error): boolean => {
  switch (err.message) {
    default: 
      return false;
  }
};
