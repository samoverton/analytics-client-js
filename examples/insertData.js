var AA = require('./../index');
var Config = AA.ConnectionConfig;
var Cluster = AA.Cluster;
var util = require('util');

module.exports = function(file,table,options) {

    var config = new Config;
    if(options['batch-size']) {
        config.setOption('INSERT_BATCH_SIZE',parseInt(options['batch-size']));
    }
    if(options.username && options.password) {
        config.setOptions({
            USERNAME: options.username,
            PASSWORD: options.password
        });
    }

    var hosts = options['host'] || ['localhost'];

    var cluster = new Cluster(hosts);

    var session = cluster.getSession(config);

    var inserter = session.inserter(table);

    console.log("INFO: batch size: %d bytes",inserter.getBatchSize());
    var progress = 0;
    var outputFormat = "%s %d bytes ... [%s]";
    inserter.insert(file).then(function(res){
        process.stdout.write(util.format(outputFormat+" \n",
            "Streaming",
            progress,
            res.statusCode+" "+res.statusText
        ));
        if(res.body) console.log(res.body);
    },function(err){
        if(err.statusCode && err.statusText) {
            process.stdout.write(util.format("\nError: %d %s",err.statusCode,err.statusText));
        }
        console.error("\n"+err.message);
        process.exit(1);
    },function(update){
        var perc = Math.round(update.progress*100/update.total);
        progress = update.progress;
        process.stdout.write(util.format(outputFormat+"\r",
            perc === 100 ? "Processing" : "Streaming",
            progress,
            perc === 100 ? "Pending" : perc+"%"
        ));
    });

};
