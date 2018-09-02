const bitBin = require('bit-bin');

const components = {
    'components' : [
        {
            'paths' : ['add_multiple_test_files/a.js'],
            'main' : 'add_multiple_test_files/a.js',
            'tests' : ['add_multiple_test_files/a.spec.js']
        },
        {
            'paths' : ['add_multiple_test_files/c.js'],
            'main' : 'add_multiple_test_files/c.js'
        }, 
        {
            'paths' : ['add_multiple_test_files/b.js'],
            'main' : 'add_multiple_test_files/b.js'
        }
    ]
}

bitBin.addMany(components).then(function () {
    console.log('success');
});

