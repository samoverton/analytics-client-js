(function(){
    var HttpInterface = require('../lib/HttpInterface');
    var HttpError = require('../lib/HttpError');
    var when = require('when');

    var self = Object.create(HttpInterface.prototype);

    function httpError(xmlHttp) {
        var code = xmlHttp.readyState !== 4 ? 1 : 2;
        throw new HttpError(code,
            {
                statusCode: xmlHttp.status,
                statusText: xmlHttp.statusText,
                responseText: xmlHttp.responseText
            }
        );
    }

    function request(method) {
        return (function(path,data,options) {
            options = options || {};
            var headers = options.headers;
            var qsOptions = options.qsParams;
            var parseData = options.parseData || JSON.stringify;
            var opts={};
            var username = this.cluster.config.options.USERNAME;
            var password = this.cluster.config.options.PASSWORD;
            if(username && password) {
                opts.username = username;
                opts.password = password;
            }
            var queryString = "";
            opts.type = method;
            if(headers) opts.headers = headers;
            if(options.success) opts.success = options.success;
            opts.dataType = options.dataType === undefined ? 'json' : options.dataType;
            opts.contentType = options.contentType === undefined ? 'application/json' : options.contentType;
            opts.processData = options.processData === undefined ? false : options.processData;
            opts.xhr = options.xhr;
            if(data) {
                if(data instanceof FormData) {
                    opts.contentType = false;
                    opts.data = data;
                } else {
                    opts.data = parseData(data);
                }
            }
            if(qsOptions && !jQuery.isEmptyObject(qsOptions)) {
                queryString = "?"+jQuery.param(qsOptions);
            }
            return when(jQuery.ajax(this.apiPath()+path+queryString,opts),null,httpError);
        });
    }

    // public api:
    self.GET = request('GET');
    self.POST = request('POST');
    self.DELETE = request('DELETE');

    module.exports = self;
})();


