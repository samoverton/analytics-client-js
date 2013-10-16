(function(){
    var ConnectionConfig = require('../lib/ConnectionConfig');
    var Cluster = require('../lib/Cluster');
    var http = require('./jqHttp');
    var Streamer = require('./Streamer');

    Cluster.prototype.setHttpInterface(http);
    Cluster.prototype.setStreamerInterface(Streamer);


    function Connection() {};

    module.exports = function(opts) {
        var cluster = new Cluster('http://'+window.location.host);
        var connectionConfig = new ConnectionConfig(opts);
        Connection.prototype = cluster.getSession(connectionConfig);
        return new Connection();
    };
})();


