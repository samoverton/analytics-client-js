(function(){
    var HttpInterface = require('../lib/HttpInterface');
    var HttpError = require('../lib/HttpError');
    var when = require('when');
    var http = require('http');
    var Cluster = require('../lib/Cluster');
    var querystring = require('querystring');

    var self = Object.create(HttpInterface.prototype);

    function httpError(deferred) { return function(err) {
        deferred.reject(new HttpError(1,{
             responseText: err.toString()
        }));
    };}

    function request(method) {
        return (function(path,data,options) {
            options || (options = {});
            var qs = "";
            var chunked = false;
            var qsOptions = options.qsParams;
            var headers = options.headers;
            var parseData = options.parseData || JSON.stringify;
            if(qsOptions) {
                qs = querystring.stringify(qsOptions);
            }
            var o = {
                path: this.cluster.apiPath()+path+(qs ? "?" : "")+qs,
                method: method,
                headers: {
                    Accept: 'application/json, text/javascript, */*; q=0.01'
                }
            };
            //set default content-type as json
            if(!chunked && data && typeof data === "object") {
                o.headers['Content-type'] = 'application/json';
            }
            if(headers) {
                for(var k in headers) {
                    o.headers[k] = headers[k];
                    if((k.toLowerCase() + ":"+headers[k].toLowerCase())
                        === 'transfer-encoding:chunked') {
                        chunked = true;
                    }
                }
            }
            var username = this.cluster.config.options.USERNAME;
            var password = this.cluster.config.options.PASSWORD;
            if(username && password) {
                o.auth = username+":"+password;
            }
            var match = /^https?:\/\/([^:]*):?(.*)/.exec(this.url);
            if(match) {
                o.hostname = match[1];
                if(match[2]) {
                    o.port = match[2];
                }
            } else {
                o.hostname = this.url;
            }
            var deferred = when.defer();
            var req = http.request(o,function(res){
                res.setEncoding('utf8');
                res.on('data',function(chunk){
                    buffer += chunk;
                });
                var buffer = "";
                if(/^(5|4).*/.test(res.statusCode)) {
                    res.on('end',function(){
                        deferred.reject(new HttpError(2,{
                            statusCode: res.statusCode,
                            statusText: http.STATUS_CODES[res.statusCode],
                            responseText: buffer
                        }));
                    });
                } else {
                    res.on('end',function(){
                        try {
                            var resolution = null;
                            if(buffer.length) resolution = JSON.parse(buffer);
                            deferred.resolve({
                                statusCode: res.statusCode,
                                statusText: http.STATUS_CODES[res.statusCode],
                                body: resolution
                            });
                        } catch(e) {
                            deferred.reject(new HttpError(2,{
                                statusCode: res.statusCode,
                                statusText: http.STATUS_CODES[res.statusCode],
                                responseText: e.message
                            }));
                        }

                    });
                }
            });
            req.on('error',httpError(deferred));
            if(chunked) {
                if(data) req.write(data);
                return {
                    request: req,
                    response: deferred.promise
                };
            } else {
                if(data) req.write(parseData(data));
                req.end();
                return deferred.promise;
            }
        });
    }

    // public api:
    self.GET = request('GET');
    self.POST = request('POST');
    self.DELETE = request('DELETE');
    self.PUT = request('PUT');

    Cluster.prototype.setHttpInterface(self);

    module.exports = self;
})();




