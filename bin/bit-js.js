/* eslint-disable */
var importer = require('../dist/importer/index.js');
var ids = process.argv.slice(2);

importer(ids)
.then((result) => {
  console.log('done');
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
