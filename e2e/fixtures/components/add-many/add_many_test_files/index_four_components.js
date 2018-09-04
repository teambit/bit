const bitBin = require('bit-bin');

const components = 
    [
        {
            'componentPaths' : ['add_many_test_files/a.js'],
            'main' : 'add_many_test_files/a.js',
            'id' : 'add_many_test_files/my_defined_id',
            'tests' : ['add_many_test_files/a.spec.js']
        },
        {
            'componentPaths' : ['add_many_test_files/c.js'],
            'main' : 'add_many_test_files/c.js'
        }, 
        {
            'componentPaths' : ['add_many_test_files/b.js'],
            'namespace' : 'my_namespace',
            'main' : 'add_many_test_files/b.js'
        },
        {
            'componentPaths' : ['add_many_test_files/d.js'],
            'main' : 'add_many_test_files/d.js',
            'tests' : ['add_many_test_files/d.spec.js'],
            'exclude' : ['add_many_test_files/d.spec.js'],
            'id' : 'add_many_test_files/d',
        }
    ]


    bitBin.addMany(components).then(function (results) {
        const resultsStr = JSON.stringify(results)
        console.log(resultsStr);
    });
    
