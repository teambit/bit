const bitBin = require('bit-bin');

const components = {
    "components" : [
        {
            "paths" : ["add-multiple-test-files/a.js"],
            "main" : "add-multiple-test-files/a.js",
            "tests" : ["add-multiple-test-files/a.spec.js"]
        },
        {
            "paths" : ["add-multiple-test-files/c.js"],
            "main" : "add-multiple-test-files/c.js"
        }, 
        {
            "paths" : ["add-multiple-test-files/b.js"],
            "main" : "add-multiple-test-files/b.js"
        }
    ]
}

bitBin.addMany(components).then(function () {
    console.log('success');
});

