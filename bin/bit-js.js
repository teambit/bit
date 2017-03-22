var importer = require('../src/importer/index');
var ids = process.argv.slice(2);

importer(ids)
.then((result) => {
  console.log(result);
});
