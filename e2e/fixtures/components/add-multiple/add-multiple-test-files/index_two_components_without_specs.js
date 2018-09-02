const bitBin = require('bit-bin');

const components = {
    "components" : [
        {
            "paths" : ["add-multiple-test-files/a.js"],
            "main" : "add-multiple-test-files/a.js"
        }, 
        {
            "paths" : ["add-multiple-test-files/c.js"],
            "main" : "add-multiple-test-files/c.js"
        }
    ]
}


bitBin.addMany(components).then(function () {
    console.log('success');
});

