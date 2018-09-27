const runBitBin = require('../run_add_many').runBitBin;

const components = 
    [
        {
            'componentPaths' : ['../../g.js'],
            'main' : '../../g.js',
            'id' : 'g'
        },
        {
            'componentPaths' : ['../../h.js'],
            'main' : '../../h.js',
            'id' : 'h',
            'tests' : ['../../h.spec.js'],
        },
        {
            'componentPaths' : ['../../i.js'],
            'main' : '../../i.js',
            'tests' : ['../../i.spec.js'],
            'exclude' : ['../../i.spec.js'],
        },
    ]

    // Take the cwd from args
    // Support special arg name PROCESS to pass the current working directory
    const cwd = process.argv.length === 3 ? (process.argv[2] === 'PROCESS' ? process.cwd() : process.argv[2]) : undefined;
    runBitBin(components, cwd);
    

