const runBitBin = require('bit-bin/e2e/fixtures/components/add-many/add_many_test_files/run_add_many').runBitBin;

const components = 
    [
        {
            'componentPaths' : ['add_many_test_files/LICENSE'],
            'main' : 'add_many_test_files/LICENSE'
        },
        {
            'componentPaths' : ['add_many_test_files/yarn.lock'],
            'main' : 'add_many_test_files/yarn.lock'
        }
    ]

    // Take the cwd from args
    // Support special arg name PROCESS to pass the current working directory
    const cwd = process.argv.length === 3 ? (process.argv[2] === 'PROCESS' ? process.cwd() : process.argv[2]) : undefined;
    runBitBin(components, cwd);
    

