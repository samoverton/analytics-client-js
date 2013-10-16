(function(){

    /**
     * @constructor
     * @param {Number} code
     * Error codes:
     * 0 = unknown error
     * 1 = no response received (eg host down or misconfigured)
     * 2 = response received but an http error occurred in which case the http
     * error is given in the response object
     *
     * @param {Object} response the response object with attributes
     * {Number} response.statusCode
     * {String} response.statusText
     * {String} response.responseText
     */

    function HttpError(code,response) {
        response = response || {};
        this.statusCode = response.statusCode;
        this.statusText = response.statusText;
        this.code = code || 0;
        this.message = response.responseText;
        this.name = "HttpError";
    }

    HttpError.prototype = new Error();
    HttpError.prototype.constructor = HttpError;

    module.exports = HttpError;

})();


