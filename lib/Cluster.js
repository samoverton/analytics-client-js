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
        args.forEach(function(arg){
            if(Array.isArray(arg)) {
                arg.forEach(function(h){
                    var k = h;
                    if(!/^http:\/\//.test(h)) {
                        k = "http://"+h;
                    }
                    that.hosts[k] = new Host(k,that);
                });
            } else if(typeof arg === "string") {
                var k = arg;
                if(!/^http:\/\//.test(arg)) {
                    k = "http://"+arg;
                }
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


