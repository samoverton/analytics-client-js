;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function(){
    var ConnectionConfig = require('../lib/ConnectionConfig');
    var Cluster = require('../lib/Cluster');
    var http = require('./jqHttp');
    var Streamer = require('./Streamer');

    Cluster.prototype.setHttpInterface(http);
    Cluster.prototype.setStreamerInterface(Streamer);


    function Connection() {};

    module.exports = function(opts) {
        var cluster = new Cluster(window.location.protocol+'//'+window.location.host);
        var connectionConfig = new ConnectionConfig(opts);
        Connection.prototype = cluster.getSession(connectionConfig);
        return new Connection();
    };
})();



},{"../lib/Cluster":5,"../lib/ConnectionConfig":7,"./Streamer":2,"./jqHttp":3}],2:[function(require,module,exports){
(function(){

    var StreamerInterface = require('../lib/StreamerInterface');
    var when = require('when');

    /**
     * @class Streamer
     */
    function Streamer() {
        StreamerInterface.apply(this,arguments);
        this._requestQ = [when(0)];
    }

    Streamer.prototype = Object.create(Object.create(StreamerInterface.prototype));

    var self = Streamer.prototype;

    var uploadXhr = function(opts) {
        return function() {
            var xhr = new XMLHttpRequest();
            if(xhr.upload) {
                xhr.upload.onprogress = function(e){
                    opts.deferred.notify({
                        progress: opts.offset + e.loaded,
                        total: opts.total
                    });
                };
            }
            return xhr;
        };
    };

    /**
     * @param {Integer} start bytes
     * @param {Integer} end bytes
     * @param {Deferred} progress the caller's deferred to be notified of progress
     * @returns {Promise} resolves to an integer offset
     */
    function readChunk(start,end,progress) {
        var buffer;
        var deferred = when.defer();
        var q = this._requestQ;
        var data = this._data;
        var cluster = this._cluster;
        var post = cluster.apiCall('POST').bind(cluster,this._endpoint);
        var stripFirstLine = this._options.stripFirstLine && start === 0;
        var passedFirstLine = false;
        function _readChunk(i,j) {
            if(buffer && (buffer[buffer.length - 1] === "\n" || buffer.length + 1 < (j-i))) {
                if(!passedFirstLine && stripFirstLine) {
                    passedFirstLine = true;
                    buffer = null;
                    _readChunk(j-1,end);
                } else {
                    var d = when.defer();
                    var f = post.bind(cluster,buffer,{
                        contentType: 'text/plain',
                        dataType: false,
                        parseData: function(data) { return data; },
                        xhr: uploadXhr({
                            deferred: progress,
                            offset: start,
                            total: data.size
                        })
                    });
                    q.push(d.promise);
                    q.shift().then(function(){
                        return f().then(function(responseData){
                            if(j < data.size && q.length) {
                                d.resolve();
                            } else {
                                progress.resolve(responseData);
                            }
                        },function(err){
                            progress.reject(err);
                        });
                    });
                    deferred.resolve(j-1);
                }
            } else {
                var reader = new FileReader;
                reader.readAsText(data.slice(i,j));
                reader.onloadend = function() {
                    if(reader.readyState === reader.DONE) {
                        buffer = reader.result;
                        _readChunk(i,j+1);
                    } else {
                        deferred.reject(new Error("Unable to read file"));
                    }
                };
            }
        }
        if(stripFirstLine) {
            _readChunk(0,1);
        } else {
            _readChunk(start,end);
        }
        return deferred.promise;
    }

    function readChunks() {
        var data = this._data;
        var start = 0;
        var batchSize = this._batchSize;
        var that = this;
        var deferred = when.defer();
        function _readChunks(i,j) {
            return readChunk.call(that,i,j,deferred).then(function(offset){
                if(offset <= data.size) {
                    return _readChunks(offset,offset+batchSize);
                }
            });
        }
        _readChunks(start,batchSize);
        return deferred.promise;
    }

    function flush(res) {
        return res;
    }

    // public api
    self.readChunks = readChunks;
    self.flush = flush;

    module.exports = Streamer;
})();
},{"../lib/StreamerInterface":15,"when":18}],3:[function(require,module,exports){
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



},{"../lib/HttpError":10,"../lib/HttpInterface":11,"when":18}],4:[function(require,module,exports){
if(typeof AA === "undefined") AA = {};

AA.Connection = require('./Connection');


},{"./Connection":1}],5:[function(require,module,exports){
(function(){

    var Host = require('./Host');
    var when = require('when');
    var Inserter = require('./Inserter');
    var ConnectionConfig = require('./ConnectionConfig');
    var ConfigurationError = require('./ConfigurationError');

    /**
     * @class Cluster
     * @constructor
     */
    function Cluster() {
        this.hosts = {};
        addURIs.apply(this,arguments);
    }

    var self = Cluster.prototype;

    self.setHttpInterface = function(http) {
        Host.Http.prototype = http;
    };

    self.setStreamerInterface = function(Streamer) {
        Inserter.Streamer = Streamer;
    };

    //public api
    self.getURIs = getURIs;
    self.addURIs = addURIs;
    self.getHost = getHost;
    self.selectHost = selectHost;
    self.getSession = getSession;
    self.apiPath = apiPath;
    self.apiCall = apiCall;

    /**
     * @method getURIs
     * @returns {Array}
     */
    function getURIs() {
        return Object.keys(this.hosts);
    }


    function getRandom(uris) {
        if(!uris || !uris.length) throw new Error("No uris given");
        var i = Math.floor(Math.random()*uris.length);
        return uris[i];
    }

    function getHost(uri) {
        return this.hosts[uri];
    }

    function selectHost() {
        var that = this;
        var time = (new Date).getTime();
        function getFilter(k) {
            return function filter(h) {
                var down = that.hosts[h].down;
                if(down) {
                    var dt = time - down.time;
                    var dT = time - down.firstDown;
                    // Ignore this host if it has been down for more than HOST_TIMEOUT
                    // seconds or
                    // if we haven't waited k ms times the number of retries
                    // since this host was last seen to be down
                    if(
                        dt <= (down.retries+1)*k ||
                        dT > that.config.options.HOST_TIMEOUT*1000
                    ) {
                        return false;
                    }
                }
                return true;
            };
        }

        var uris = [];
        var wait = 30000;
        var step = 3000;
        while(!uris.length) {
            if(wait <= 0) {
                throw new Error("No available hosts!");
            }
            uris = this.getURIs().filter(getFilter(wait));
            while(wait - step <= 0) {
                step = Math.floor(step/2);
                if(step === 0) {
                    throw new Error("No available hosts!");
                }
            }
            wait -= step;
        }
        var random = getRandom(uris);
        return this.hosts[random];
    }

    /**
     * @method addURIs
     * @chainable
     */
    function addURIs() {
        var args = Array.prototype.slice.call(arguments);
        var that = this;
        var transform = function(h) {
            // default to http if no protocol specified
            if(!/^http/.test(h)) return 'http://'+h;
            return h;
        };
        args.forEach(function(arg){
            if(Array.isArray(arg)) {
                arg.forEach(function(h){
                    var k = transform(h);
                    that.hosts[k] = new Host(k,that);
                });
            } else if(typeof arg === "string") {
                var k = transform(arg);
                that.hosts[k] = new Host(k,that);
            }
        });
        return this;
    }

    function apiPath() {
        return this.config.options.API_PATH;
    }

    /**
     * @method getSession
     * @param {ConnectionConfig} config
     * @returns {Session}
     */
    function getSession(config) {
        var Session = require('./Session');
        this.config = config || new ConnectionConfig;
        return new Session(this);
    }

    /**
     * @method apiCall
     * @param {String} method
     * @returns {Function}
     */
    function apiCall(method) {
        if(!this.config) throw new ConfigurationError("You must get a Session and use that object to make api calls!");
        var that = this;
        return function() {
            var deferred = when.defer();
            var args = arguments;
            function callMethod() {
                try {
                    var h = selectHost.call(that);
                    if(!h[method]) {
                        throw new Error("Invalid http method");
                    }
                    h[method].apply(h,args).then(function(data){
                        deferred.resolve(data);
                    },function(err){
                        if(err.code === 1) {
                            callMethod();
                        } else {
                            deferred.reject(err);
                        }
                    });
                } catch(e) {
                    deferred.reject(e);
                }

            }
            callMethod();
            return deferred.promise;
        };
    }

    module.exports = Cluster;

})();



},{"./ConfigurationError":6,"./ConnectionConfig":7,"./Host":9,"./Inserter":12,"./Session":14,"when":18}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
(function() {

    var defaults = {
        HOST_TIMEOUT: 30000, // how long to wait (s) before we abandon a host forever
        INSERT_BATCH_SIZE: 1000000, // bytes
        API_PATH: '/analytics/api/',

        // auth specific
        USERNAME: null,
        PASSWORD: null,
        SESSION_KEY: null,

        //ssl specific
        SSL_PFX: null,
        SSL_KEY: null,
        SSL_PASSPHRASE: null,
        SSL_CERT: null,
        SSL_CA: null
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



},{}],8:[function(require,module,exports){
(function(){

    /**
     * @param {Object} def
     * @constructor
     */
    function Field(def) {
        for(var key in def) {
            this[key] = def[key];
        }
    }

    module.exports = Field;

})();



},{}],9:[function(require,module,exports){
(function(){

    /**
     * @class Host
     * @param {String} url
     * @param {Cluster} cluster
     * @constructor
     */
    function Host(url,cluster) {
        this.apiPath = function() {
            return url+cluster.apiPath();
        };
        this.url = url;
        this.cluster = cluster;
    }

    var HttpInterface = require('./HttpInterface');
    var when = require('when');

    /**
     * @class Http
     * @constructor
     */
    function Http() {}

    Http.prototype = HttpInterface.prototype;

    Host.prototype = Object.create(Http.prototype);
    Host.Http = Http;

    var self = Host.prototype;

    function httpError(err) {
        if(err.code === 1) {
            var time = (new Date).getTime();
            if(!this.down) {
                this.down = {
                    time: time,
                    firstDown: time,
                    retries: 0
                };
            } else {
                this.down.time = time;
                this.down.retries++;
            }
        }
        throw err;
    }

    function httpSuccess(data) {
        if(this.down) delete this.down;
        return data;
    }

    function request(method) {
        return function() { return when(Http.prototype[method].apply(this,arguments),
            httpSuccess.bind(this),httpError.bind(this));
        };
    }

    // public api
    self.GET = request('GET');
    self.POST = request('POST');
    self.DELETE = request('DELETE');
    self.PUT = request('PUT');

    module.exports = Host;

})();



},{"./HttpInterface":11,"when":18}],10:[function(require,module,exports){
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



},{}],11:[function(require,module,exports){
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



},{}],12:[function(require,module,exports){
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


},{"when":18}],13:[function(require,module,exports){
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



},{"./Table":16}],14:[function(require,module,exports){
(function() {

    var Schema = require('./Schema');
    var Inserter = require('./Inserter');

    /**
     *
     * @param {Cluster} cluster
     * @constructor
     */
    function Session(cluster) {

        /**
         * @private
         * @type Cluster
         */
        this._cluster = cluster;

        /**
         * @private
         * @type Schema
         */
        this._schema = new Schema(cluster);

    };

    var self = Session.prototype;

    //public api
    self.getSchema = getSchema;
    self.execute = execute;
    self.inserter = inserter;

    function getSchema() {
        return this._schema;
    };

    function execute() {
        var options = {
            qsParams: {},
            headers: {
                'Content-Type': 'text/plain'
            },
            parseData: function(string) { return string; }
        };
        var aqlStatements = [];
        var args = Array.prototype.slice.call(arguments);
        args.forEach(function(arg){
            if(typeof arg === "string") {
                aqlStatements.push(arg);
            } else if(typeof arg === "object") {
                for(var k in arg) {
                    options.qsParams[k] = arg[k];
                }
            }
        });
        if(aqlStatements.length > 1) {
            options.qsParams.allowMulti = true;
        }
        return this._cluster.apiCall('POST')('aql',aqlStatements.join(';'),options);
    }

    function inserter(endpoint) {
        return new Inserter(this._cluster,endpoint);
    }

    module.exports = Session;

})();

},{"./Inserter":12,"./Schema":13}],15:[function(require,module,exports){
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



},{}],16:[function(require,module,exports){
(function(){

    var Field = require('./Field');

    /**
     * @param {Object} def
     * @constructor
     */
    function Table(def) {

        /**
         * @private
         * @type Object
         */
        this._def = def;

    }

    var self = Table.prototype;

    // public api
    self.getFields = getFields;

    function getFields() {
        return this._def['data'].map(function(fieldDef){
            return new Field(fieldDef);
        });
    }

    module.exports = Table;

})();



},{"./Field":8}],17:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],18:[function(require,module,exports){
var process=require("__browserify_process");/** @license MIT License (c) copyright 2011-2013 original author or authors */

/**
 * A lightweight CommonJS Promises/A and when() implementation
 * when is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author Brian Cavalier
 * @author John Hann
 * @version 2.5.1
 */
(function(define, global) { 'use strict';
define(function (require) {

	// Public API

	when.promise   = promise;    // Create a pending promise
	when.resolve   = resolve;    // Create a resolved promise
	when.reject    = reject;     // Create a rejected promise
	when.defer     = defer;      // Create a {promise, resolver} pair

	when.join      = join;       // Join 2 or more promises

	when.all       = all;        // Resolve a list of promises
	when.map       = map;        // Array.map() for promises
	when.reduce    = reduce;     // Array.reduce() for promises
	when.settle    = settle;     // Settle a list of promises

	when.any       = any;        // One-winner race
	when.some      = some;       // Multi-winner race

	when.isPromise = isPromiseLike;  // DEPRECATED: use isPromiseLike
	when.isPromiseLike = isPromiseLike; // Is something promise-like, aka thenable

	/**
	 * Register an observer for a promise or immediate value.
	 *
	 * @param {*} promiseOrValue
	 * @param {function?} [onFulfilled] callback to be called when promiseOrValue is
	 *   successfully fulfilled.  If promiseOrValue is an immediate value, callback
	 *   will be invoked immediately.
	 * @param {function?} [onRejected] callback to be called when promiseOrValue is
	 *   rejected.
	 * @param {function?} [onProgress] callback to be called when progress updates
	 *   are issued for promiseOrValue.
	 * @returns {Promise} a new {@link Promise} that will complete with the return
	 *   value of callback or errback or the completion value of promiseOrValue if
	 *   callback and/or errback is not supplied.
	 */
	function when(promiseOrValue, onFulfilled, onRejected, onProgress) {
		// Get a trusted promise for the input promiseOrValue, and then
		// register promise handlers
		return cast(promiseOrValue).then(onFulfilled, onRejected, onProgress);
	}

	function cast(x) {
		return x instanceof Promise ? x : resolve(x);
	}

	/**
	 * Trusted Promise constructor.  A Promise created from this constructor is
	 * a trusted when.js promise.  Any other duck-typed promise is considered
	 * untrusted.
	 * @constructor
	 * @param {function} sendMessage function to deliver messages to the promise's handler
	 * @param {function?} inspect function that reports the promise's state
	 * @name Promise
	 */
	function Promise(sendMessage, inspect) {
		this._message = sendMessage;
		this.inspect = inspect;
	}

	Promise.prototype = {
		/**
		 * Register handlers for this promise.
		 * @param [onFulfilled] {Function} fulfillment handler
		 * @param [onRejected] {Function} rejection handler
		 * @param [onProgress] {Function} progress handler
		 * @return {Promise} new Promise
		 */
		then: function(onFulfilled, onRejected, onProgress) {
			/*jshint unused:false*/
			var args, sendMessage;

			args = arguments;
			sendMessage = this._message;

			return _promise(function(resolve, reject, notify) {
				sendMessage('when', args, resolve, notify);
			}, this._status && this._status.observed());
		},

		/**
		 * Register a rejection handler.  Shortcut for .then(undefined, onRejected)
		 * @param {function?} onRejected
		 * @return {Promise}
		 */
		otherwise: function(onRejected) {
			return this.then(undef, onRejected);
		},

		/**
		 * Ensures that onFulfilledOrRejected will be called regardless of whether
		 * this promise is fulfilled or rejected.  onFulfilledOrRejected WILL NOT
		 * receive the promises' value or reason.  Any returned value will be disregarded.
		 * onFulfilledOrRejected may throw or return a rejected promise to signal
		 * an additional error.
		 * @param {function} onFulfilledOrRejected handler to be called regardless of
		 *  fulfillment or rejection
		 * @returns {Promise}
		 */
		ensure: function(onFulfilledOrRejected) {
			return typeof onFulfilledOrRejected === 'function'
				? this.then(injectHandler, injectHandler)['yield'](this)
				: this;

			function injectHandler() {
				return resolve(onFulfilledOrRejected());
			}
		},

		/**
		 * Shortcut for .then(function() { return value; })
		 * @param  {*} value
		 * @return {Promise} a promise that:
		 *  - is fulfilled if value is not a promise, or
		 *  - if value is a promise, will fulfill with its value, or reject
		 *    with its reason.
		 */
		'yield': function(value) {
			return this.then(function() {
				return value;
			});
		},

		/**
		 * Runs a side effect when this promise fulfills, without changing the
		 * fulfillment value.
		 * @param {function} onFulfilledSideEffect
		 * @returns {Promise}
		 */
		tap: function(onFulfilledSideEffect) {
			return this.then(onFulfilledSideEffect)['yield'](this);
		},

		/**
		 * Assumes that this promise will fulfill with an array, and arranges
		 * for the onFulfilled to be called with the array as its argument list
		 * i.e. onFulfilled.apply(undefined, array).
		 * @param {function} onFulfilled function to receive spread arguments
		 * @return {Promise}
		 */
		spread: function(onFulfilled) {
			return this.then(function(array) {
				// array may contain promises, so resolve its contents.
				return all(array, function(array) {
					return onFulfilled.apply(undef, array);
				});
			});
		},

		/**
		 * Shortcut for .then(onFulfilledOrRejected, onFulfilledOrRejected)
		 * @deprecated
		 */
		always: function(onFulfilledOrRejected, onProgress) {
			return this.then(onFulfilledOrRejected, onFulfilledOrRejected, onProgress);
		}
	};

	/**
	 * Returns a resolved promise. The returned promise will be
	 *  - fulfilled with promiseOrValue if it is a value, or
	 *  - if promiseOrValue is a promise
	 *    - fulfilled with promiseOrValue's value after it is fulfilled
	 *    - rejected with promiseOrValue's reason after it is rejected
	 * @param  {*} value
	 * @return {Promise}
	 */
	function resolve(value) {
		return promise(function(resolve) {
			resolve(value);
		});
	}

	/**
	 * Returns a rejected promise for the supplied promiseOrValue.  The returned
	 * promise will be rejected with:
	 * - promiseOrValue, if it is a value, or
	 * - if promiseOrValue is a promise
	 *   - promiseOrValue's value after it is fulfilled
	 *   - promiseOrValue's reason after it is rejected
	 * @param {*} promiseOrValue the rejected value of the returned {@link Promise}
	 * @return {Promise} rejected {@link Promise}
	 */
	function reject(promiseOrValue) {
		return when(promiseOrValue, rejected);
	}

	/**
	 * Creates a {promise, resolver} pair, either or both of which
	 * may be given out safely to consumers.
	 * The resolver has resolve, reject, and progress.  The promise
	 * has then plus extended promise API.
	 *
	 * @return {{
	 * promise: Promise,
	 * resolve: function:Promise,
	 * reject: function:Promise,
	 * notify: function:Promise
	 * resolver: {
	 *	resolve: function:Promise,
	 *	reject: function:Promise,
	 *	notify: function:Promise
	 * }}}
	 */
	function defer() {
		var deferred, pending, resolved;

		// Optimize object shape
		deferred = {
			promise: undef, resolve: undef, reject: undef, notify: undef,
			resolver: { resolve: undef, reject: undef, notify: undef }
		};

		deferred.promise = pending = promise(makeDeferred);

		return deferred;

		function makeDeferred(resolvePending, rejectPending, notifyPending) {
			deferred.resolve = deferred.resolver.resolve = function(value) {
				if(resolved) {
					return resolve(value);
				}
				resolved = true;
				resolvePending(value);
				return pending;
			};

			deferred.reject  = deferred.resolver.reject  = function(reason) {
				if(resolved) {
					return resolve(rejected(reason));
				}
				resolved = true;
				rejectPending(reason);
				return pending;
			};

			deferred.notify  = deferred.resolver.notify  = function(update) {
				notifyPending(update);
				return update;
			};
		}
	}

	/**
	 * Creates a new promise whose fate is determined by resolver.
	 * @param {function} resolver function(resolve, reject, notify)
	 * @returns {Promise} promise whose fate is determine by resolver
	 */
	function promise(resolver) {
		return _promise(resolver, monitorApi.PromiseStatus && monitorApi.PromiseStatus());
	}

	/**
	 * Creates a new promise, linked to parent, whose fate is determined
	 * by resolver.
	 * @param {function} resolver function(resolve, reject, notify)
	 * @param {Promise?} status promise from which the new promise is begotten
	 * @returns {Promise} promise whose fate is determine by resolver
	 * @private
	 */
	function _promise(resolver, status) {
		var self, value, consumers = [];

		self = new Promise(_message, inspect);
		self._status = status;

		// Call the provider resolver to seal the promise's fate
		try {
			resolver(promiseResolve, promiseReject, promiseNotify);
		} catch(e) {
			promiseReject(e);
		}

		// Return the promise
		return self;

		/**
		 * Private message delivery. Queues and delivers messages to
		 * the promise's ultimate fulfillment value or rejection reason.
		 * @private
		 * @param {String} type
		 * @param {Array} args
		 * @param {Function} resolve
		 * @param {Function} notify
		 */
		function _message(type, args, resolve, notify) {
			consumers ? consumers.push(deliver) : enqueue(function() { deliver(value); });

			function deliver(p) {
				p._message(type, args, resolve, notify);
			}
		}

		/**
		 * Returns a snapshot of the promise's state at the instant inspect()
		 * is called. The returned object is not live and will not update as
		 * the promise's state changes.
		 * @returns {{ state:String, value?:*, reason?:* }} status snapshot
		 *  of the promise.
		 */
		function inspect() {
			return value ? value.inspect() : toPendingState();
		}

		/**
		 * Transition from pre-resolution state to post-resolution state, notifying
		 * all listeners of the ultimate fulfillment or rejection
		 * @param {*|Promise} val resolution value
		 */
		function promiseResolve(val) {
			if(!consumers) {
				return;
			}

			var queue = consumers;
			consumers = undef;

			enqueue(function () {
				value = coerce(self, val);
				if(status) {
					updateStatus(value, status);
				}
				runHandlers(queue, value);
			});

		}

		/**
		 * Reject this promise with the supplied reason, which will be used verbatim.
		 * @param {*} reason reason for the rejection
		 */
		function promiseReject(reason) {
			promiseResolve(rejected(reason));
		}

		/**
		 * Issue a progress event, notifying all progress listeners
		 * @param {*} update progress event payload to pass to all listeners
		 */
		function promiseNotify(update) {
			if(consumers) {
				var queue = consumers;
				enqueue(function () {
					runHandlers(queue, progressed(update));
				});
			}
		}
	}

	/**
	 * Run a queue of functions as quickly as possible, passing
	 * value to each.
	 */
	function runHandlers(queue, value) {
		for (var i = 0; i < queue.length; i++) {
			queue[i](value);
		}
	}

	/**
	 * Creates a fulfilled, local promise as a proxy for a value
	 * NOTE: must never be exposed
	 * @param {*} value fulfillment value
	 * @returns {Promise}
	 */
	function fulfilled(value) {
		return near(
			new NearFulfilledProxy(value),
			function() { return toFulfilledState(value); }
		);
	}

	/**
	 * Creates a rejected, local promise with the supplied reason
	 * NOTE: must never be exposed
	 * @param {*} reason rejection reason
	 * @returns {Promise}
	 */
	function rejected(reason) {
		return near(
			new NearRejectedProxy(reason),
			function() { return toRejectedState(reason); }
		);
	}

	/**
	 * Creates a near promise using the provided proxy
	 * NOTE: must never be exposed
	 * @param {object} proxy proxy for the promise's ultimate value or reason
	 * @param {function} inspect function that returns a snapshot of the
	 *  returned near promise's state
	 * @returns {Promise}
	 */
	function near(proxy, inspect) {
		return new Promise(function (type, args, resolve) {
			try {
				resolve(proxy[type].apply(proxy, args));
			} catch(e) {
				resolve(rejected(e));
			}
		}, inspect);
	}

	/**
	 * Create a progress promise with the supplied update.
	 * @private
	 * @param {*} update
	 * @return {Promise} progress promise
	 */
	function progressed(update) {
		return new Promise(function (type, args, _, notify) {
			var onProgress = args[2];
			try {
				notify(typeof onProgress === 'function' ? onProgress(update) : update);
			} catch(e) {
				notify(e);
			}
		});
	}

	/**
	 * Coerces x to a trusted Promise
	 * @param {*} x thing to coerce
	 * @returns {*} Guaranteed to return a trusted Promise.  If x
	 *   is trusted, returns x, otherwise, returns a new, trusted, already-resolved
	 *   Promise whose resolution value is:
	 *   * the resolution value of x if it's a foreign promise, or
	 *   * x if it's a value
	 */
	function coerce(self, x) {
		if (x === self) {
			return rejected(new TypeError());
		}

		if (x instanceof Promise) {
			return x;
		}

		try {
			var untrustedThen = x === Object(x) && x.then;

			return typeof untrustedThen === 'function'
				? assimilate(untrustedThen, x)
				: fulfilled(x);
		} catch(e) {
			return rejected(e);
		}
	}

	/**
	 * Safely assimilates a foreign thenable by wrapping it in a trusted promise
	 * @param {function} untrustedThen x's then() method
	 * @param {object|function} x thenable
	 * @returns {Promise}
	 */
	function assimilate(untrustedThen, x) {
		return promise(function (resolve, reject) {
			fcall(untrustedThen, x, resolve, reject);
		});
	}

	/**
	 * Proxy for a near, fulfilled value
	 * @param {*} value
	 * @constructor
	 */
	function NearFulfilledProxy(value) {
		this.value = value;
	}

	NearFulfilledProxy.prototype.when = function(onResult) {
		return typeof onResult === 'function' ? onResult(this.value) : this.value;
	};

	/**
	 * Proxy for a near rejection
	 * @param {*} reason
	 * @constructor
	 */
	function NearRejectedProxy(reason) {
		this.reason = reason;
	}

	NearRejectedProxy.prototype.when = function(_, onError) {
		if(typeof onError === 'function') {
			return onError(this.reason);
		} else {
			throw this.reason;
		}
	};

	function updateStatus(value, status) {
		value.then(statusFulfilled, statusRejected);

		function statusFulfilled() { status.fulfilled(); }
		function statusRejected(r) { status.rejected(r); }
	}

	/**
	 * Determines if x is promise-like, i.e. a thenable object
	 * NOTE: Will return true for *any thenable object*, and isn't truly
	 * safe, since it may attempt to access the `then` property of x (i.e.
	 *  clever/malicious getters may do weird things)
	 * @param {*} x anything
	 * @returns {boolean} true if x is promise-like
	 */
	function isPromiseLike(x) {
		return x && typeof x.then === 'function';
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * howMany of the supplied promisesOrValues have resolved, or will reject when
	 * it becomes impossible for howMany to resolve, for example, when
	 * (promisesOrValues.length - howMany) + 1 input promises reject.
	 *
	 * @param {Array} promisesOrValues array of anything, may contain a mix
	 *      of promises and values
	 * @param howMany {number} number of promisesOrValues to resolve
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise} promise that will resolve to an array of howMany values that
	 *  resolved first, or will reject with an array of
	 *  (promisesOrValues.length - howMany) + 1 rejection reasons.
	 */
	function some(promisesOrValues, howMany, onFulfilled, onRejected, onProgress) {

		return when(promisesOrValues, function(promisesOrValues) {

			return promise(resolveSome).then(onFulfilled, onRejected, onProgress);

			function resolveSome(resolve, reject, notify) {
				var toResolve, toReject, values, reasons, fulfillOne, rejectOne, len, i;

				len = promisesOrValues.length >>> 0;

				toResolve = Math.max(0, Math.min(howMany, len));
				values = [];

				toReject = (len - toResolve) + 1;
				reasons = [];

				// No items in the input, resolve immediately
				if (!toResolve) {
					resolve(values);

				} else {
					rejectOne = function(reason) {
						reasons.push(reason);
						if(!--toReject) {
							fulfillOne = rejectOne = identity;
							reject(reasons);
						}
					};

					fulfillOne = function(val) {
						// This orders the values based on promise resolution order
						values.push(val);
						if (!--toResolve) {
							fulfillOne = rejectOne = identity;
							resolve(values);
						}
					};

					for(i = 0; i < len; ++i) {
						if(i in promisesOrValues) {
							when(promisesOrValues[i], fulfiller, rejecter, notify);
						}
					}
				}

				function rejecter(reason) {
					rejectOne(reason);
				}

				function fulfiller(val) {
					fulfillOne(val);
				}
			}
		});
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * any one of the supplied promisesOrValues has resolved or will reject when
	 * *all* promisesOrValues have rejected.
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise} promise that will resolve to the value that resolved first, or
	 * will reject with an array of all rejected inputs.
	 */
	function any(promisesOrValues, onFulfilled, onRejected, onProgress) {

		function unwrapSingleResult(val) {
			return onFulfilled ? onFulfilled(val[0]) : val[0];
		}

		return some(promisesOrValues, 1, unwrapSingleResult, onRejected, onProgress);
	}

	/**
	 * Return a promise that will resolve only once all the supplied promisesOrValues
	 * have resolved. The resolution value of the returned promise will be an array
	 * containing the resolution values of each of the promisesOrValues.
	 * @memberOf when
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise}
	 */
	function all(promisesOrValues, onFulfilled, onRejected, onProgress) {
		return _map(promisesOrValues, identity).then(onFulfilled, onRejected, onProgress);
	}

	/**
	 * Joins multiple promises into a single returned promise.
	 * @return {Promise} a promise that will fulfill when *all* the input promises
	 * have fulfilled, or will reject when *any one* of the input promises rejects.
	 */
	function join(/* ...promises */) {
		return _map(arguments, identity);
	}

	/**
	 * Settles all input promises such that they are guaranteed not to
	 * be pending once the returned promise fulfills. The returned promise
	 * will always fulfill, except in the case where `array` is a promise
	 * that rejects.
	 * @param {Array|Promise} array or promise for array of promises to settle
	 * @returns {Promise} promise that always fulfills with an array of
	 *  outcome snapshots for each input promise.
	 */
	function settle(array) {
		return _map(array, toFulfilledState, toRejectedState);
	}

	/**
	 * Promise-aware array map function, similar to `Array.prototype.map()`,
	 * but input array may contain promises or values.
	 * @param {Array|Promise} array array of anything, may contain promises and values
	 * @param {function} mapFunc map function which may return a promise or value
	 * @returns {Promise} promise that will fulfill with an array of mapped values
	 *  or reject if any input promise rejects.
	 */
	function map(array, mapFunc) {
		return _map(array, mapFunc);
	}

	/**
	 * Internal map that allows a fallback to handle rejections
	 * @param {Array|Promise} array array of anything, may contain promises and values
	 * @param {function} mapFunc map function which may return a promise or value
	 * @param {function?} fallback function to handle rejected promises
	 * @returns {Promise} promise that will fulfill with an array of mapped values
	 *  or reject if any input promise rejects.
	 */
	function _map(array, mapFunc, fallback) {
		return when(array, function(array) {

			return _promise(resolveMap);

			function resolveMap(resolve, reject, notify) {
				var results, len, toResolve, i;

				// Since we know the resulting length, we can preallocate the results
				// array to avoid array expansions.
				toResolve = len = array.length >>> 0;
				results = [];

				if(!toResolve) {
					resolve(results);
					return;
				}

				// Since mapFunc may be async, get all invocations of it into flight
				for(i = 0; i < len; i++) {
					if(i in array) {
						resolveOne(array[i], i);
					} else {
						--toResolve;
					}
				}

				function resolveOne(item, i) {
					when(item, mapFunc, fallback).then(function(mapped) {
						results[i] = mapped;

						if(!--toResolve) {
							resolve(results);
						}
					}, reject, notify);
				}
			}
		});
	}

	/**
	 * Traditional reduce function, similar to `Array.prototype.reduce()`, but
	 * input may contain promises and/or values, and reduceFunc
	 * may return either a value or a promise, *and* initialValue may
	 * be a promise for the starting value.
	 *
	 * @param {Array|Promise} promise array or promise for an array of anything,
	 *      may contain a mix of promises and values.
	 * @param {function} reduceFunc reduce function reduce(currentValue, nextValue, index, total),
	 *      where total is the total number of items being reduced, and will be the same
	 *      in each call to reduceFunc.
	 * @returns {Promise} that will resolve to the final reduced value
	 */
	function reduce(promise, reduceFunc /*, initialValue */) {
		var args = fcall(slice, arguments, 1);

		return when(promise, function(array) {
			var total;

			total = array.length;

			// Wrap the supplied reduceFunc with one that handles promises and then
			// delegates to the supplied.
			args[0] = function (current, val, i) {
				return when(current, function (c) {
					return when(val, function (value) {
						return reduceFunc(c, value, i, total);
					});
				});
			};

			return reduceArray.apply(array, args);
		});
	}

	// Snapshot states

	/**
	 * Creates a fulfilled state snapshot
	 * @private
	 * @param {*} x any value
	 * @returns {{state:'fulfilled',value:*}}
	 */
	function toFulfilledState(x) {
		return { state: 'fulfilled', value: x };
	}

	/**
	 * Creates a rejected state snapshot
	 * @private
	 * @param {*} x any reason
	 * @returns {{state:'rejected',reason:*}}
	 */
	function toRejectedState(x) {
		return { state: 'rejected', reason: x };
	}

	/**
	 * Creates a pending state snapshot
	 * @private
	 * @returns {{state:'pending'}}
	 */
	function toPendingState() {
		return { state: 'pending' };
	}

	//
	// Internals, utilities, etc.
	//

	var reduceArray, slice, fcall, nextTick, handlerQueue,
		setTimeout, funcProto, call, arrayProto, monitorApi,
		cjsRequire, MutationObserver, undef;

	cjsRequire = require;

	//
	// Shared handler queue processing
	//
	// Credit to Twisol (https://github.com/Twisol) for suggesting
	// this type of extensible queue + trampoline approach for
	// next-tick conflation.

	handlerQueue = [];

	/**
	 * Enqueue a task. If the queue is not currently scheduled to be
	 * drained, schedule it.
	 * @param {function} task
	 */
	function enqueue(task) {
		if(handlerQueue.push(task) === 1) {
			nextTick(drainQueue);
		}
	}

	/**
	 * Drain the handler queue entirely, being careful to allow the
	 * queue to be extended while it is being processed, and to continue
	 * processing until it is truly empty.
	 */
	function drainQueue() {
		runHandlers(handlerQueue);
		handlerQueue = [];
	}

	// capture setTimeout to avoid being caught by fake timers
	// used in time based tests
	setTimeout = global.setTimeout;

	// Allow attaching the monitor to when() if env has no console
	monitorApi = typeof console != 'undefined' ? console : when;

	// Sniff "best" async scheduling option
	// Prefer process.nextTick or MutationObserver, then check for
	// vertx and finally fall back to setTimeout
	/*global process*/
	if (typeof process === 'object' && process.nextTick) {
		nextTick = process.nextTick;
	} else if(MutationObserver = global.MutationObserver || global.WebKitMutationObserver) {
		nextTick = (function(document, MutationObserver, drainQueue) {
			var el = document.createElement('div');
			new MutationObserver(drainQueue).observe(el, { attributes: true });

			return function() {
				el.setAttribute('x', 'x');
			};
		}(document, MutationObserver, drainQueue));
	} else {
		try {
			// vert.x 1.x || 2.x
			nextTick = cjsRequire('vertx').runOnLoop || cjsRequire('vertx').runOnContext;
		} catch(ignore) {
			nextTick = function(t) { setTimeout(t, 0); };
		}
	}

	//
	// Capture/polyfill function and array utils
	//

	// Safe function calls
	funcProto = Function.prototype;
	call = funcProto.call;
	fcall = funcProto.bind
		? call.bind(call)
		: function(f, context) {
			return f.apply(context, slice.call(arguments, 2));
		};

	// Safe array ops
	arrayProto = [];
	slice = arrayProto.slice;

	// ES5 reduce implementation if native not available
	// See: http://es5.github.com/#x15.4.4.21 as there are many
	// specifics and edge cases.  ES5 dictates that reduce.length === 1
	// This implementation deviates from ES5 spec in the following ways:
	// 1. It does not check if reduceFunc is a Callable
	reduceArray = arrayProto.reduce ||
		function(reduceFunc /*, initialValue */) {
			/*jshint maxcomplexity: 7*/
			var arr, args, reduced, len, i;

			i = 0;
			arr = Object(this);
			len = arr.length >>> 0;
			args = arguments;

			// If no initialValue, use first item of array (we know length !== 0 here)
			// and adjust i to start at second item
			if(args.length <= 1) {
				// Skip to the first real element in the array
				for(;;) {
					if(i in arr) {
						reduced = arr[i++];
						break;
					}

					// If we reached the end of the array without finding any real
					// elements, it's a TypeError
					if(++i >= len) {
						throw new TypeError();
					}
				}
			} else {
				// If initialValue provided, use it
				reduced = args[1];
			}

			// Do the actual reduce
			for(;i < len; ++i) {
				if(i in arr) {
					reduced = reduceFunc(reduced, arr[i], i, arr);
				}
			}

			return reduced;
		};

	function identity(x) {
		return x;
	}

	return when;
});
})(typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); }, this);

},{"__browserify_process":17}]},{},[5,6,7,8,9,10,11,12,13,14,16,1,2,15,4,3])
;