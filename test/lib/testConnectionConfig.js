var ConnectionConfig = require('../../lib/ConnectionConfig');

var data = [
    {
        HOST_TIMEOUT: 20000,
        OPTION_0: "opt0"
    },
    {
        INSERT_BATCH_SIZE: 2000000,
        OPTION_1: 'opt1'
    }

];

exports.testConnectionConfig = {
    setUp: function(callback) {
        this.cc = new ConnectionConfig(data[0]);
        callback();
    },
    testMethods: {
        testConstructor: function(test) {
            test.expect(5);
            var opts = this.cc.options;
            test.strictEqual(opts.HOST_TIMEOUT,data[0].HOST_TIMEOUT);
            test.strictEqual(opts.OPTION_0,data[0].OPTION_0);
            test.strictEqual(opts.API_PATH,"/analytics/api/");
            test.throws(function(){
                new ConnectionConfig("string");
            },TypeError);
            test.doesNotThrow(function(){
                new ConnectionConfig;
            });
            test.done();
        },
        testSetOption: function(test) {
            test.expect(6);
            var opts = this.cc.options;

            test.throws(function(){
                this.cc.setOption();
            },TypeError);

            test.throws(function(){
                this.cc.setOption("NEW_OPT");
            },TypeError);

            this.cc.setOption("KEY","value");

            test.strictEqual(opts.KEY,"value");

            this.cc.setOption({"KEY": "newvalue"}).setOption("KEY1","value1");

            test.strictEqual(opts.KEY,"newvalue");
            test.strictEqual(opts.KEY1,"value1");
            test.strictEqual(opts.OPTION_0,data[0].OPTION_0);
            test.done();
        },
        testSetOptions: function(test) {
            test.expect(5);
            var opts = this.cc.options;

            test.throws(function(){
                this.cc.setOptions("string");
            },TypeError);

            this.cc.setOptions(data[1]).setOptions({'KEY':'value'});

            test.strictEqual(opts.INSERT_BATCH_SIZE,data[1].INSERT_BATCH_SIZE);

            test.strictEqual(opts.OPTION_1,data[1].OPTION_1);

            test.strictEqual(opts.HOST_TIMEOUT,data[0].HOST_TIMEOUT);

            test.strictEqual(opts.KEY,"value");
            test.done();
        }
    }
};
