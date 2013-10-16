(function(){

    var when = require('when');

    /**
     * A batch insertion class
     * @param {Cluster} cluster
     * @param {String} endpoint
     * @constructor
     */
    function Inserter(cluster,endpoint) {

        /**
         * @private
         * @type Cluster
         */
        this._cluster = cluster;

        /**
         * @private
         * @type String
         */
        this._endpoint = 'data/'+endpoint;

        this._batchSize = cluster.config.options.INSERT_BATCH_SIZE;

    }

    var self = Inserter.prototype;

    /**
     * This should be set globally
     * @type {null|Streamer}
     */
    self.constructor.Streamer = null;

    // public api
    self.insert = insert;
    self.getBatchSize = getBatchSize;

    /**
     *
     * @param {mixed} data
     * @param {Object} opts options: currently implemented
     * opts.stripFirstLine {Boolean} eg strips the header line of a csv file
     * @returns {Promise}
     */
    function insert(data,opts) {
        if(typeof data === "object" && (typeof File === "undefined" || !(data instanceof File))) {
            var parseData = function(d){
                if(Array.isArray(d)) {
                    return d.map(JSON.stringify).join("\n");
                } else {
                    return d;
                }
            }
            return this._cluster.apiCall('POST')(this._endpoint,data,{parseData: parseData});
        }
        var streamer = new this.constructor.Streamer(
            data,
            this._cluster.config.options.INSERT_BATCH_SIZE,
            this._cluster,
            this._endpoint,
            opts
        );
        return streamer.readChunks().then(function(res){
            return streamer.flush(res);
        },function(err){
            streamer.flush();
            throw new Error(err);
        });
    }

    function getBatchSize() {
        return this._batchSize;
    }

    module.exports = Inserter;
})();

