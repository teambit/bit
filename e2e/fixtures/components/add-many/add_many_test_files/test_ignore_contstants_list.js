const bitBin = require('bit-bin');

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
    bitBin.addMany(components, cwd).then(function (results) {
            const resultsStr = JSON.stringify(results)
            console.log(resultsStr);
        }).catch(function (err) {
            console.log(err.toString());
        });
    

