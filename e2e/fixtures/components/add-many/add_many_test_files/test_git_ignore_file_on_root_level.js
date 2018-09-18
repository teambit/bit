const bitBin = require('bit-bin');

const components = 
    [
        {
            'componentPaths' : ['c.js'],
            'main' : 'c.js'
        }
    ]

    // Take the cwd from args
    // Support special arg name PROCESS to pass the current working directory
    const cwd = process.argv.length === 3 ? (process.argv[2] === 'PROCESS' ? process.cwd() : process.argv[2]) : undefined;
    bitBin.addMany(components, cwd).then(function (results) {
            const resultsStr = JSON.stringify(results)
            console.log(resultsStr);
        }).catch(function (err) {
            console.log(err.toString());
        });
    

