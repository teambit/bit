const runBitBin = require('./run_add_many').runBitBin;

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
            'main' : 'add_many_test_files/c.js',
            'id': 'add_many_test_files/c'
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
        },
        {
            'componentPaths' : ['add_many_test_files/e.js', 'add_many_test_files/f.js'],
            'main' : 'add_many_test_files/e.js',
            'id' : 'add_many_test_files/component_with_many_paths',
        }
    ]

    // Take the cwd from args
    // Support special arg name PROCESS to pass the current working directory
    const cwd = process.argv.length === 3 ? (process.argv[2] === 'PROCESS' ? process.cwd() : process.argv[2]) : undefined;
    runBitBin(components, cwd);


