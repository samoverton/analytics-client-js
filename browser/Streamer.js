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