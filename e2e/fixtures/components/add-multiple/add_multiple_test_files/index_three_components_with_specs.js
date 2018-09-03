const bitBin = require('bit-bin');

const components = 
    [
        {
            'componentPaths' : ['add_multiple_test_files/a.js'],
            'main' : 'add_multiple_test_files/a.js',
            'id' : 'add_multiple_test_files/a',
            'tests' : ['add_multiple_test_files/a.spec.js']
        },
        {
            'componentPaths' : ['add_multiple_test_files/c.js'],
            'id' : 'add_multiple_test_files/c',
            'main' : 'add_multiple_test_files/c.js'
        }, 
        {
            'componentPaths' : ['add_multiple_test_files/b.js'],
            'id' : 'add_multiple_test_files/b',
            'main' : 'add_multiple_test_files/b.js'
        }
    ]


    bitBin.addMany(components).then(function (results) {
        const resultsStr = JSON.stringify(results)
        console.log(resultsStr);
    });
    
