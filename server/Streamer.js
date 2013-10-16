(function(){

    var StreamerInterface = require('../lib/StreamerInterface');
    var when = require('when');
    var fs = require('fs');
    var Inserter = require('../lib/Inserter');

    /**
     * @class Streamer
     */
    function Streamer() {
        StreamerInterface.apply(this,arguments);
        var that = this;
        this._http = null;
        this._fd = null;
    }

    Streamer.prototype = Object.create(Object.create(StreamerInterface.prototype));

    var self = Streamer.prototype;

    Inserter.Streamer = Streamer;

    /**
     * @param {Integer} start bytes
     * @param {Integer} end bytes
     * @returns {Promise}
     */
    function readChunk(start,end) {
        var buffer='';
        var fd = this._fd;
        var deferred = when.defer();
        var data = this._data;
        var dataSize = this._dataSize;
        var request = this._http.request;
        var stripFirstLine = this._options.stripFirstLine && start === 0;
        var passedFirstLine = false;
        function _readChunk(i,j) {
            if(buffer && (buffer[buffer.length - 1] === "\n" || buffer.length + 1 < (j-i))) {
                if(!passedFirstLine && stripFirstLine) {
                    passedFirstLine = true;
                    buffer = '';
                    _readChunk(j-1,end);
                } else {
                    request.write(buffer);
                    deferred.notify({
                        progress: i+buffer.length,
                        total: dataSize
                    })
                    deferred.resolve(j-1);
                }
            } else {
                var readStream = fs.createReadStream(data,{
                    fd: fd,
                    autoClose: false,
                    start: i,
                    end: j
                });
                var string = '';
                readStream.setEncoding('utf8');
                readStream.on('error',function(err){
                    deferred.reject(err);
                    fs.close(fd);
                });
                readStream.on('readable',function(){
                    var tmp = readStream.read();
                    if(tmp)  string += tmp;
                });
                readStream.on('end',function(){
                    buffer = string;
                    _readChunk(i,j+1);
                });

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
        var dataSize = fs.statSync(data).size;
        this._dataSize = dataSize;
        var that = this;
        return this._cluster.apiCall('POST')(this._endpoint,null,{
            headers: {
                'Transfer-encoding': 'chunked'
            }
        }).then(function(http){
            that._http = http;
            http.response.then(null,function(error){
                throw error;
            });
            that._fd = fs.openSync(data,'r');
            function _readChunks(i,j) {
                return readChunk.call(that,i,j).then(function(offset){
                    if(offset <= dataSize) {
                        return _readChunks(offset,offset+batchSize);
                    }
                });
            }
            return _readChunks(start,batchSize);
        });
    }

    function flush() {
        fs.close(this._fd);
        this._http.request.end();
        return this._http.response;
    }

    // public api
    self.readChunks = readChunks;
    self.flush = flush;

    module.exports = Streamer;
})();


