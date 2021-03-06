var test = require('tape');
var dopServer = require('../../dist/nodejs').create();
var dopClient = require('../../dist/nodejs').create();
dopServer.env = 'SERVER';
dopClient.env = 'CLIENT';
dopClient.data.object_inc = 7;

var transportName = process.argv[2]|| 'local';
var transportListen = require('dop-transports').listen[transportName];
var transportConnect = require('dop-transports').connect[transportName];
var serverClient;
var server = dopServer.listen({transport:transportListen})
var client = dopClient.connect({transport:transportConnect, listener:server})
server.on('connect', function(node) {
    if (typeof serverClient == 'undefined')
        serverClient = node;
})



test('Client unsubscribe Server', function(t) {
    var objectServer = dopServer.register({test:Math.random()});

    t.equal(dopServer.data.object[1], undefined, 'Object data not stored on server yet');

    dopServer.onsubscribe(function() {
        return objectServer;
    })

    var objectClient = dopClient.register({});
    
    t.equal(dopClient.data.object[1], undefined, 'Object data not stored on client yet');
    
    client.subscribe().into(objectClient).then(function(obj){
        
        var objectDataServer = dopServer.data.object[1];
        var objectDataClient = dopClient.data.object[7];

        t.deepEqual(objectDataServer.node[serverClient.token].subscriber, 1, 'Client subscriber');
        t.deepEqual(objectDataServer.node[serverClient.token].owner, 0, 'Client is not owner');
        t.deepEqual(objectDataClient.node[client.token].subscriber, 0, 'Server is not subscriber');
        t.deepEqual(objectDataClient.node[client.token].owner, 1, 'Server is owner');

        client.unsubscribe(objectClient)
        .then(function(){
            t.deepEqual(dopServer.data.object[1], undefined, 'Object in server removed from data.object');
            t.deepEqual(dopServer.data.object[7], undefined, 'Object in client removed from data.object');
            t.deepEqual(objectDataServer.node[serverClient.token].subscriber, 0, 'Client is not subscriber');
            t.deepEqual(objectDataServer.node[serverClient.token].owner, 0, 'Client is not owner');
            t.deepEqual(objectDataClient.node[client.token].subscriber, 0, 'Server is not subscriber');
            t.deepEqual(objectDataClient.node[client.token].owner, 0, 'Server not is owner');
            t.end();
            server.listener.close();
        })


    })

})