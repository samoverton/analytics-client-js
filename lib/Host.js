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


