const bitBin = require('bit-bin');

const components = 
    [
        {
            'componentPaths' : ['add_multiple_test_files/a.js'],
            'main' : 'add_multiple_test_files/a.js',
            'tests' : ['add_multiple_test_files/a.spec.js'],
            'exclude' : ['add_multiple_test_files/a.spec.js'],
            'id' : 'add_multiple_test_files/a',
        },
    ]


    bitBin.addMany(components).then(function (results) {
        const resultsStr = JSON.stringify(results)
        console.log(resultsStr);
    });
    
