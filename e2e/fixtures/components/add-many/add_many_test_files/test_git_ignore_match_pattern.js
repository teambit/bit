const runBitBin = require('./run_add_many').runBitBin;

const components = 
    [
        {
            'componentPaths' : ['add_many_test_files/c.js'],
            'main' : 'add_many_test_files/c.js'
        }
    ]

    // Take the cwd from args
    // Support special arg name PROCESS to pass the current working directory
    const cwd = process.argv.length === 3 ? (process.argv[2] === 'PROCESS' ? process.cwd() : process.argv[2]) : undefined;
    runBitBin(components, cwd);
