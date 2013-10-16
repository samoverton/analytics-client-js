(function(){

    /**
     * @param {mixed} data
     * @param {Integer} batchSize
     * @param {Cluster} cluster
     * @param {String} endpoint
     * @constructor
     */
    function StreamerInterface(data,batchSize,cluster,endpoint,opts) {
        /**
         * The data reference
         * @type {mixed}
         * @private
         */
        this._data = data;

        /**
         * How to split the chunks
         * @type {Integer}
         * @private
         */
        this._batchSize = batchSize;

        /**
         * @type {Cluster}
         * @private
         */
        this._cluster = cluster;

        /**
         * @type {String}
         * @private
         */
        this._endpoint = endpoint;

        /**
         * @type {Object}
         * @private
         */
        this._options = {
            stripFirstLine: false
        };
        for(var i in opts) {
            if(opts.hasOwnProperty(i))
                this._options[i] = opts[i];
        }
    }

    var self = StreamerInterface.prototype;

    /**
     * Read chunks of data
     * @returns {Promise}
     */
    self.readChunks = function() {
        throw new Error("Streamer::readChunks not implemented!");
    };

    self.flush = function() {
        throw new Error("Streamer::flush not implemented!")
    };

    module.exports = StreamerInterface;

})();


