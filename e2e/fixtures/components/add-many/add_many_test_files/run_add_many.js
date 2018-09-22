const bitBin = require('bit-bin');

exports.runBitBin = function(components, cwd)  {
    return bitBin.addMany(components, cwd).then(function (results) {
        const resultsStr = JSON.stringify(results)
        console.log(resultsStr);
    }).catch(function (err) {
        console.log(err.toString());
    });
   
}