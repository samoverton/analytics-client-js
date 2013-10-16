(function (){

    var Table = require('./Table');

    /**
     * @param {Cluster} cluster
     * @constructor
     */
    function Schema(cluster) {

        /**
         * @private
         * @type Cluster
         */
        this._cluster = cluster;
    }

    var self = Schema.prototype;

    // public api
    self.getTables = getTables;
    self.getPreprocessors = getPreprocessors;

    function getTables() {
        return this._cluster.apiCall('GET')('schema').then(function(schema){
            var tableDefs = {};
            for(var name in schema) {
                tableDefs[name] = new Table(schema[name]);
            }
            return tableDefs;
        });
    }

    function getPreprocessors() {
        return this._cluster.apiCall('GET')('preprocessor');
    }

    module.exports = Schema;

})();


