var fs = require('fs');
var util = require('util');
var config = JSON.parse(fs.readFileSync(__dirname+'/config.json'));
var AA = require(__dirname+'/../../index');
var Cluster = AA.Cluster;
var ConnectionConfig = AA.ConnectionConfig;
var _ = require('underscore');

var url = 'http://'+config.vm+":"+config.port;

var users = JSON.parse(fs.readFileSync(__dirname+'/../mocks/json/users.json'));

function parseUser(u) {
    var userpass = u.split(":");
    return {
        USERNAME: userpass[0],
        PASSWORD: userpass[1]
    }
}

var Aql = {

    createUser: function(data) {
        var string = "CREATE USER (";
        var array = [];
        for(var i in data) {
            array.push(util.format("`%s`='%s'",i,data[i]));
        }
        string += array.join(",") + ")";
        return string;
    },
    dropUser: function(id) {
        return util.format("DROP USER '%s'",id);
    },
    selectUser: function(id) {
        return util.format("SELECT USER '%s'",id);
    }

};

var adminUser = parseUser(config.adminUser);

var cluster = new Cluster(url);

module.exports = {
    'testAdmin' : {
        setUp: function(callback) {
            var _config = new ConnectionConfig(adminUser);
            this.session = cluster.getSession(_config);
            callback();
        },
        testCreateDropUser: function(test) {
            var user = users[0];
            var session = this.session;
            session.execute(Aql.createUser(user))
                .then(function(response){
                    test.equal(response.statusCode,200,"Create user should return a 200");
                    test.ok(response.body,"Create user should return a non null response");
                    test.equal(response.body.length,36,"Create user should return a UUID");
                    return session.execute(Aql.dropUser(response.body));
                })
                .then(function(response){
                    test.equal(response.statusCode,200,"Drop user should return a 200");
                    test.strictEqual(response.body,null,"Drop user should return a null response body");
                },test.ifError)
                .ensure(test.done);
        },
        testCreateSameUserTwice: function(test) {
            var user = users[0];
            var session = this.session;
            session.execute(Aql.createUser(user))
                .then(function(response){
                    test.equal(response.statusCode,200,"Create user should return a 200");
                    test.ok(response.body,"Create user should return a non null response");
                    test.equal(response.body.length,36,"Create user should return a UUID");
                    return session.execute(Aql.createUser(user)).then(function(){
                            throw new Error("CREATE USER should have failed the second time!");
                        },function(err){
                            test.ok(err,"Create same user twice should return an error");
                            test.equal(err.statusCode,400,"Create same user twice should return a 400");
                        }
                    ).then(null,test.ifError)
                    .then(function(){
                        return session.execute(Aql.dropUser(response.body));
                    });
                })
                .then(function(response){
                    test.equal(response.statusCode,200,"Drop user should return a 200");
                    test.strictEqual(response.body,null,"Drop user should return a null response body");
                },test.ifError)
                .ensure(test.done);
        },
        testCreateUsersWithoutRequiredParams: function(test) {
            var session = this.session;
            session.execute("CREATE USER ()").then(function(){
                throw new Error("'CREATE USER ()' should have failed");
            },function(err){
                test.ok(err,"Create user with no params should throw an error");
                test.equal(err.statusCode,400,"Create user with no params should return a 400");
            }).then(null,test.ifError)
            .then(function(){
                return session.execute("CREATE USER (username='me')");
            })
            .then(function(){
                throw new Error("CREATE USER (username='me') should fail!");
            },function(err){
                test.ok(err,"Create user with no email should error");
                test.equal(err.statusCode,400,"Create user with no email should return a 400");
            }).then(null,test.ifError)
            .ensure(test.done);
        },
        testListUsers: function(test) {
            var session = this.session;
            var userIds = [];
            session.execute(Aql.createUser(users[0])).then(function(res){
                test.ok(res,users[0].username+" should get created successfully");
                test.equal(res.body.length,36,"Create user should return a UUID");
                userIds.push(res.body);
                return session.execute(Aql.createUser(users[1])).then(function(res){
                    test.ok(res,users[1].username+" should get created successfully");
                    test.equal(res.body.length,36,"Create user should return a UUID");
                    userIds.push(res.body);
                    return session.execute(Aql.createUser(users[2])).then(function(res){
                        test.ok(res,users[2].username+" should get created successfully");
                        test.equal(res.body.length,36,"Create user should return a UUID");
                        userIds.push(res.body);
                    })
                })
            }).then(function(){
                return session.execute("LIST USERS").then(function(res){
                    test.ok(res,"LIST USERS should succeed");
                    test.equal(res.body.length,5,"There should be 5 users listed");
                    var usernames = _(res.body).pluck('username');
                    _(users).each(function(user){
                        test.equal(_(usernames).indexOf(user.username)>-1,true,user.username+" should be listed");
                    });
                });
            }).then(function(){
                return session.execute(Aql.dropUser(userIds[0])).then(function(res){
                    test.ok(res,"Drop user after listing should succeed");
                });
            }).then(function(){
                return session.execute("LIST USERS").then(function(res){
                    test.ok(res,"LIST USERS should succeed after dropping a user");
                    test.equal(res.body.length,4,"There should be 4 users listed");
                    test.equal(_(res.body).chain().pluck('username').indexOf(users[0].username).value(),-1,
                        users[0].username+" should not be listed");
                });
            }).then(function(){
                return session.execute(Aql.dropUser(userIds[1]),Aql.dropUser(userIds[2])).then(function(res){
                    test.ok(res,"Dropping multiple users should succeed");
                });
            }).then(null,test.ifError).ensure(test.done);
        },
        testListRoles: function(test) {
            var session = this.session;
            session.execute("LIST ROLES").then(function(response){
                test.ok(response);
                test.equal(response.statusCode,200);
                test.ok(response.body);
                ['admin','guest','user'].forEach(function(str){
                    test.ok(response.body.indexOf(str) > -1,str+" should be in the list of roles");
                });
            },test.ifError)
            .ensure(test.done);
        },
        testCreateDropRole: function(test) {
            var session = this.session;
            session.execute("CREATE ROLE").then(function(){
                throw new Error("Shouldn't be able to create a role without a name!");
            },function(err){
                test.ok(err,"Create role with no name should error");
                test.equal(err.statusCode,400,"Create role with no name should return a 400");
            })
            .then(null,test.ifError)
            .then(function(){
                return session.execute("CREATE ROLE r1").then(function(response){
                    test.ok(response,"Create role r1 should succeed");
                    test.equal(response.statusCode,200,"Create role r1 should return a 200");
                },test.ifError);
            })
            .then(function(){
                return session.execute("CREATE ROLE r1").then(function(){
                    throw new Error("Shouldn't be able to create the same role twice!");
                },function(err) {
                    test.ok(err,"Create same role twice should fail");
                    test.equal(err.statusCode,400,"Create same role twice should return a 400");
                })
            })
            .then(function(){
                return session.execute("DROP ROLE").then(function(){
                    throw new Error("Shouldn't be able to drop a role without a name!");
                },function(err){
                    test.ok(err,"Drop role with no name should error");
                    test.equal(err.statusCode,400,"Drop role with no name should return a 400");
                })
            })
            .then(function(){
                return session.execute("DROP ROLE r1").then(function(response){
                    test.ok(response,"Drop role should succeed");
                    test.equal(response.statusCode,200,"Drop role should return a 200");
                });
            })
            .then(null,test.ifError)
            .ensure(test.done)
        },
        testSelectUser: function(test) {
            var session = this.session;
            session.execute(Aql.createUser(users[0])).then(function(res){
                test.ok(res,"Create user should succeed");
                test.equal(res.body.length,36,"Create user should return a UUID");
                return session.execute(Aql.selectUser(res.body)).then(function(response){
                    test.ok(response,"Select user should succeed");
                    for(var k in users[0]) {
                        if(k !== 'password') {
                            test.ok(k in response.body,k+" should be in user object");
                            test.equal(users[0][k],response.body[k],k+" should be the right value");
                        } else {
                            test.equal(k in response.body,false,"password should not be listed");
                        }
                    }
                },test.ifError)
                .then(function(){
                    return session.execute(Aql.dropUser(res.body));
                })
                .then(function(){
                    return session.execute(Aql.selectUser(res.body)).then(function(response){
                        test.ok(response,"Select dropped user should succeed");
                        test.equal(response.body.active,false,"A dropped user should be inactive");
                    })
                });
            })
            .then(null,test.ifError)
            .ensure(test.done);
        }

    }
};


