(function() {

    var Schema = require('./Schema');
    var Inserter = require('./Inserter');

    /**
     *
     * @param {Cluster} cluster
     * @constructor
     */
    function Session(cluster) {

        /**
         * @private
         * @type Cluster
         */
        this._cluster = cluster;

        /**
         * @private
         * @type Schema
         */
        this._schema = new Schema(cluster);

    };

    var self = Session.prototype;

    //public api
    self.getSchema = getSchema;
    self.execute = execute;
    self.inserter = inserter;

    function getSchema() {
        return this._schema;
    };

    function execute() {
        var options = {
            qsParams: {},
            headers: {
                'Content-Type': 'text/plain'
            },
            parseData: function(string) { return string; }
        };
        var aqlStatements = [];
        var args = Array.prototype.slice.call(arguments);
        args.forEach(function(arg){
            if(typeof arg === "string") {
                aqlStatements.push(arg);
            } else if(typeof arg === "object") {
                for(var k in arg) {
                    options.qsParams[k] = arg[k];
                }
            }
        });
        if(aqlStatements.length > 1) {
            options.qsParams.allowMulti = true;
        }
        return this._cluster.apiCall('POST')('aql',aqlStatements.join(';'),options);
    }

    function inserter(endpoint) {
        return new Inserter(this._cluster,endpoint);
    }

    module.exports = Session;

})();
