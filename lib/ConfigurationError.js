(function() {
    /**
     * @param {String} message
     * @constructor
     */
    function ConfigurationError(message) {
        this.name = "ConfigurationError";
        this.message = message;
    }

    ConfigurationError.prototype = new Error();

    ConfigurationError.prototype.constructor = ConfigurationError;

    module.exports = ConfigurationError;
})();
