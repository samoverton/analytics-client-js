(function(){
    function HttpInterface() {};

    var self = HttpInterface.prototype;

    /**
     * All request functions take the same arguments
     * @param {String} path
     * @param {Object} data
     * @param {Object} options
     * {Object} options.qsParams maps keys to values
     * {Object} options.headers maps keys to values
     * {Function} options.parseData transforms the data object
     * @returns {Promise}
     */
    self.GET = function(path,data,options) {
        throw new Error("Http:GET not implemented!");
    };

    self.POST = function(path,data,options) {
        throw new Error("Http:POST not implemented!");
    };

    self.PUT = function(path,data,options) {
        throw new Error("Http:PUT not implemented!");
    };

    self.DELETE = function(path,data,options) {
        throw new Error("Http:DELETE not implemented!");
    };

    module.exports = HttpInterface;
})();


