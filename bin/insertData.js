var GetOpt = require('node-getopt');
var insertData = require('../examples/insertData.js');

var getopt = new GetOpt([
    ['','help','display this help page and exit'],
    ['h','host=ARG+',"name of host of jbird instance.\n"+
        "                        Multiple arguments are supported.\n"+
        "                        Defaults to localhost"],
    ['','ssl-cert=ARG','path to file containing SSL client certificate'],
    ['','ssl-pass=ARG','SSL certificate passphrase'],
    ['b','batch-size=ARG','The batch size in bytes'],
    ['u','username=ARG','Username for basic auth'],
    ['p','password=ARG','Password for basic auth']
]);

getopt.setHelp(
    "\n  Usage: insertData FILE TABLE [OPTIONS]\n\n"+
        "  FILE = a file containing a json event per line\n"+
        "  TABLE = the table name in which to insert data\n\n"+
        "  OPTIONS:\n\n"+
        "[[OPTIONS]]\n\n"
).bindHelp();

var opt = getopt.parseSystem();

if(opt.argv.length < 2) {
    getopt.showHelp();
    process.exit(1);
}

insertData(opt.argv[0],opt.argv[1],opt.options);