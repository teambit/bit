/* eslint-disable */
var importer = require('../dist/importer/index.js');
var ids = process.argv.slice(2);

importer(ids)
.then((result) => {
  console.log('done');
});
