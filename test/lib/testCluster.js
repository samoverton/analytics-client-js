var AA = require('../../index'),
    Cluster = AA.Cluster,
    ConnectionConfig = AA.ConnectionConfig;
var MockServerBuilder = require('../mocks/MockServerBuilder');
var childProcess = require('child_process');
var fs = require('fs');
var ConfigurationError = require('../../lib/ConfigurationError');
var _ = require('underscore');
var when = require('when');

var clusterSize = 4;
var sslSize = 2;
var portGenerator = __dirname+'/../mocks/bin/port';

module.exports = {
    testNonHttp: {
        setUp: function(callback) {
            this.cluster = new Cluster('h1','h2:8080',['h3','https://h4'],'http://h5');
            callback();
        },
        testConstructor: function(test) {
            test.expect(1);
            test.strictEqual(_(this.cluster.hosts).size(),5,"Constructor: should have 5 hosts");
            test.done();
        },
        testGetURIs: function(test) {
            test.expect(2);
            var hosts = this.cluster.getURIs();
            test.strictEqual(hosts.length,5,"getURIs(): should have 5 hosts");
            test.strictEqual(_.intersection(hosts,['http://h1','http://h2:8080','http://h3','https://h4','http://h5']).length,5,
                "getURIs(): hosts are h1-h5");
            test.done();
        },
        testAddURIs: function(test) {
            test.expect(2);
            this.cluster.addURIs('host');
            test.equal(_(this.cluster.getURIs()).indexOf('http://host')>-1,true,"addURIs(): 'host' should be added");
            this.cluster.addURIs(['host2','http://host3'],'https://host4');
            test.equal(_.intersection(this.cluster.getURIs(),['http://host2','http://host3','https://host4']).length,3,
                "addURIs(): host2-host4 should be added");
            test.done();
        }
    },
    testHttp: {
        setUp: function(callback) {
            var that = this;
            this.servers = [];
            var done =  _.after(clusterSize,callback);
            childProcess.execFile(portGenerator,[clusterSize],function(error,stdout){
                if(error) throw error;
                var ports = stdout.split(" ").map(function(str){
                    return parseInt(str.trim());
                });
                var hosts = [];
                for(var i=0;i<clusterSize;i++) {
                    hosts.push('http'+(i<sslSize ? 's' : '')+'://localhost:'+ports[i]);
                }
                that.cluster = new Cluster(hosts);
                ports.forEach(function(p,i) {
                    var builder = (new MockServerBuilder);
                    builder.addPath('GET','/analytics/api/schema').
                        addResponse('',{
                            status: 200,
                            headers: {
                                'Content-type': 'application/json'
                            },
                            body: fs.readFileSync(__dirname+'/../mocks/json/schema.json')
                        });
                    that.servers.push(builder.listen(p,{protocol: (i<sslSize ? 'https' : 'http')}));
                });
                that.servers.forEach(function(s){
                    s.on('listening',done);
                });
            });
            process.on('SIGTERM',function(){
                var after = _.after(clusterSize,function(){
                    process.exit(1);
                });
                that.servers.forEach(function(s){
                    try {
                        s.close(after);
                    } catch(e) {
                        //server not running
                        after();
                    }
                });

            });
        },
        testGetSession: function(test) {
            test.expect(2);
            test.ok(this.cluster.getSession(),"getSession(): should return truthy value");
            test.ok(this.cluster.config, "getSession(): should set a default config");
            test.done();
        },
        testApiCall: {
            testApiCallWithoutSession: function(test) {
                test.expect(1);
                var that = this;
                test.throws(function(){
                    that.cluster.apiCall('GET')('schema');
                },ConfigurationError,"apiCall() without session: should throw a ConfigurationError");
                test.done();
            },
            testApiCallWithSession: {
                setUp: function(callback) {
                    var config = new ConnectionConfig({
                        SSL_PFX: __dirname+'/../mocks/ssl/mycert.pfx',
                        SSL_PASSPHRASE: 'password'
                    });
                    this.cluster.getSession(config);
                    callback();
                },
                testApiCallWithHostsDown: function(test) {
                    test.expect(2);
                    var that = this;
                    var numberOfHostsDown = Math.floor(Math.random()*clusterSize + 1);
                    var done = _.after(numberOfHostsDown,function(){
                        that.cluster.apiCall('GET')('schema').then(function(res){
                            test.ok(numberOfHostsDown < clusterSize,
                                "apiCall() with hosts down: number of hosts down < clusterSize");
                            test.ok(res,"apiCall('GET')('schema') should succeed");
                            test.done();
                        },function(err){
                            test.strictEqual(numberOfHostsDown,clusterSize,
                                "apiCall() with hosts down: number of hosts down == clusterSize");
                            test.equal(err.message,'No available hosts!');
                            test.done();
                        });
                    });
                    for(var i=0;i<numberOfHostsDown;i++) {
                        this.servers[i].close(done);
                    }
                },
                testApiCallUndefinedMethod: function(test) {
                    this.cluster.apiCall('METH')('schema')
                        .then(function(res){
                            throw new Error("apiCall('METH') should not succeed");
                        },function(err){
                            test.ok(err,"apiCall('METH') should fail");
                            test.equal(err.message,"Invalid http method");
                        }).then(null,test.ifError).ensure(test.done);
                },
                testApiCallBadEndpoint: function(test) {
                    this.cluster.apiCall('GET')('schem')
                        .then(function(res){
                            throw new Error("apiCall('GET')('schem') has a bad endpoint and shouldn't succeed");
                        },function(err){
                            test.ok(err,"apiCall('GET')('schem') should fail");
                            test.equal(err.statusCode,404);
                        })
                        .then(null,test.ifError).ensure(test.done);
                }
            }
        },
        testSelectHost: {
            setUp: function(callback) {
                var config = new ConnectionConfig({
                    HOST_TIMEOUT: 2
                });
                this.cluster.getSession(config);
                callback();
            },
            testSelectHostWithAllHostsUp: function(test) {
                var host = this.cluster.selectHost();
                test.ok(host,"selectHost(): Test that return value truthy");
                test.done();
            },
            testSelectHostWithSomeHostsDown: {
                setUp: function(callback) {
                    this.downHosts = Math.floor(clusterSize/2);
                    var cluster = this.cluster;
                    var done = _.after(this.downHosts,function(){
                        var promises = [];
                        var attempts = 10;
                        for(var i=0;i<10;i++) {
                            promises.push(cluster.apiCall('GET')('schema'));
                        }
                        when.all(promises).ensure(function(){
                            callback();
                        });
                    });
                    for(var i=0;i<this.downHosts;i++) {
                        this.servers[i].close(done);
                    }
                },
                testSelectHost: function(test) {
                    var host = this.cluster.selectHost();
                    test.ok(host,"selectHost(): should succeed with some hosts down");
                    test.equal(host.down,undefined);
                    test.done();
                }
            }
        },
        tearDown: function(callback) {
            var done = _.after(clusterSize,callback);
            this.servers.forEach(function(s){
                try {
                    s.close(done);
                } catch(e) {
                    //server not running
                    done();
                }
            });
        }
    }
};