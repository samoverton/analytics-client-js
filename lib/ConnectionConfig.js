(function() {

    var defaults = {
        HOST_TIMEOUT: 30000, // how long to wait (s) before we abandon a host forever
        INSERT_BATCH_SIZE: 1000000, // bytes
        API_PATH: '/analytics/api/',

        // auth specific
        USERNAME: null,
        PASSWORD: null,
        SESSION_KEY: null
    };

    /**
     * @class ConnectionConfig
     * @param {Object} opts
     * @constructor
     */
    function ConnectionConfig(opts) {
        this.options = {};
        for(var i in defaults) {
            this.options[i] = defaults[i];
        }
        this.setOptions(opts);
    };

    var self = ConnectionConfig.prototype;

    // public api
    self.setOption = setOption;
    self.setOptions = setOptions;

    /**
     * @method setOption
     * @param {Object|String} option An object of key/val pairs or a string
     * representing the key
     * @param {mixed} value The value if the first argument
     * is a key
     * @throws {TypeError} when an argument is not supplied
     * @chainable
     */
    function setOption(option,value) {
        if(!option) throw new TypeError("Invalid first parameter to setOption");
        if(typeof option === "object") {
            this.setOptions(option);
        } else if(typeof option === "string" && value) {
            this.options[option] = value;
        } else {
            throw new TypeError("Need a second parameter");
        }
        return this;
    }

    /**
     * @method setOptions
     * @param {object} opts
     * @throws {TypeError} when the argument is not an object
     * @chainable
     */
    function setOptions(opts) {
        if(opts && typeof opts !== "object") {
            throw new TypeError("First parameter should be an object of key/value pairs");
        }
        for(var key in opts) {
            if(opts.hasOwnProperty(key)) {
                this.options[key] = opts[key];
            }
        }
        return this;
    }

    module.exports = ConnectionConfig;

})();


