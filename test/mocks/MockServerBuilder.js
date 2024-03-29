var http = require('http');
var https = require('https');
var _ = require('underscore');
var url = require('url');
var querystring = require('querystring');
var when = require('when');
var fs = require('fs');

/**
 * @constructor
 */
function MockServerBuilder() {
    this.paths = {};
}

function pathId(method,path) {
    return method.toUpperCase() + " " + path;
}

MockServerBuilder.prototype.addPath = function(method,path) {
    if(!method) throw new TypeError("Must supply a method name");
    if(!path) throw new TypeError("Must supply a path name");
    var id = pathId(method,path);
    var p =  this.paths[id];
    if(p) return p;
    else {
        var mp = new MockPath;
        this.paths[id] = mp;
        return mp;
    }
};

/**
 * A mock path
 * @constructor
 */
function MockPath() {
    this.responses = [];
}

MockPath.prototype.addResponse = function(request,response) {
    this.responses.push({
        request: request,
        response: response
    });
    return this;

};

MockPath.prototype.getResponse = function(request) {
    var ob =  _(this.responses).find(function(obj){
        if(_(obj.request).isObject()) {
            return _(obj.request).isEqual(request);
        } else {
            return obj.request === request;
        }
    });
    if(ob) return ob.response;
    else return null;
};

/**
 * @param {Number} port
 * @param {Object} options
 * options.port the port
 * options.hostname the hostname
 * options.protocol http or https, defaults to http
 * @returns {http.Server || https.Server}
 */
MockServerBuilder.prototype.listen = function(port,options) {
    var that = this;
    options = _({
        protocol: 'http'
    }).extend(options);
    var lib = http;
    var listener = function(req,res){
        var parsedUrl = url.parse(req.url);
        var method = req.method;
        var id = pathId(method,parsedUrl.pathname);
        var path = that.paths[id];
        if(!path) {
            res.writeHead(404);
            res.end();
        }
        var deferred = when.defer();
        var dataPromise = deferred.promise;
        var d = "";
        req.on('data',function(chunk){
            d += chunk;
        });
        switch(method.toUpperCase()) {
            case 'GET':
                if(url.search) {
                    deferred.resolve(querystring.parse(url.search.substr(1)));
                } else {
                    deferred.resolve("");
                }
                break;
            default:
                req.on('end',function(){
                    var _d = d;
                    if(req.headers['Content-type'] === 'application/json') {
                        _d = JSON.parse(d);
                    }
                    deferred.resolve(_d);
                });
        }
        dataPromise.then(function(data){
            var response = path.getResponse(data);
            function flush() {
                res.writeHead(response.status,response.headers);
                if(response.body) {
                    res.write(response.body);
                }
                res.end();
            }
            if(response.delay) {
                setTimeout(flush,response.delay);
            } else {
                flush();
            }
        });
    };
    var server;
    if(options.protocol == 'https') {
        lib = https;
        var serverOpts = {
            pfx: fs.readFileSync(__dirname+'/ssl/mycert.pfx'),
            passphrase: 'password'
        };
        server = lib.createServer(serverOpts,listener);
    } else {
        server = lib.createServer(listener);
    }
    server.listen(port,options.hostname || 'localhost');
    return server;
};

module.exports = MockServerBuilder;