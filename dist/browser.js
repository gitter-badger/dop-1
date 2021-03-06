/*
 * dop@0.11.1
 * www.distributedobjectprotocol.org
 * (c) 2016 Josema Gonzalez
 * MIT License.
 */

//////////  src/dop.js
(function factory(root) {

var dop = {
    name: 'dop',
    create: factory,

    // Where all the internal information is stored
    data: {
        node_inc:0,
        node:{},
        object_inc:1,
        object:{},
        collectors:[[],[]],
        observers:{},
        observers_inc:0
    },
    
    // src
    util: {},
    core: {},
    protocol: {},
    transports: {listen:{}, connect:{}},

    // Constants
    cons: {
        TOKEN: '~TOKEN_DOP',
        DOP: '~DOP',
        // CONNECT: '~CONNECT',
        SEND: '~SEND',
        DISCONNECT: '~DISCONNECT',
        REMOTE_FUNCTION: '$DOP_REMOTE_FUNCTION',
        BROADCAST_FUNCTION: '$DOP_BROADCAST_FUNCTION',
    }

};





//////////  src/env/browser/connect.js

dop.connect = function(options) {

    var args = Array.prototype.slice.call(arguments, 0);

    if (dop.util.typeof(args[0]) != 'object')
        options = args[0] = {};

    if (typeof options.transport != 'function')
        options.transport = dop.transports.connect.websocket;

    return dop.core.connector(args);
};




//////////  src/env/browser/emitter.js

dop.util.emitter = function() {
    this._events = {};
};


dop.util.emitter.prototype.on = function(name, callback, once) {
    if (isFunction(callback)) {
        if (!isObject(this._events))
            this._events = {};
        if (!isObject(this._events[name]))
            this._events[name] = [];
        this._events[name].push(
            (once === true) ? [ callback, true ] : [ callback ]
       );
    }
    return this;
};



dop.util.emitter.prototype.once = function(name, callback) {
    return this.on(name, callback, true);
};



dop.util.emitter.prototype.emit = function(name) {
    if (isObject(this._events[name]) && this._events[name].length > 0) {
        for (var i=0, fun=[], args=Array.prototype.slice.call(arguments, 1); i < this._events[name].length; i++) {
            fun.push(this._events[name][i][0]);
            if (this._events[name][i][1] === true) {
               this._events[name].splice(i, 1); 
               i -= 1;
            }
        }
        for (i=0; i < fun.length; i++)
            fun[i].apply(this, args);
    }
    return this;
};




dop.util.emitter.prototype.removeListener = function(name, callback) {
    if (isObject(this._events[name]) && this._events[name].length > 0) {
        for (var i=0; i < this._events[name].length; i++) {
            if (this._events[name][i][0] === callback) {
                this._events[name].splice(i, 1); 
                i -= 1;
            }
        }
    }
    return this;
};




/*
name = 'T@!#asty ';
emitter = new require('events').EventEmitter();
emitter = new dop.util.emitter();

emitter.on(name, function() {
    console.log('AAA', arguments.length); 
})

cached = function() { console.log('BBB',this._events[name].length); emitter.removeListener(name, cached) };
emitter.on(name, cached);
emitter.on(name, cached);

emitter.once(name, function() {
    console.log('CCC', this._events[name].length); 
})


emitter.emit(name);
emitter.emit(name, 2, 3);
emitter.emit(name, 4);
*/




//////////  src/env/browser/listen.js

dop.listen = function(options) {

    var args = Array.prototype.slice.call(arguments, 0);

    if (dop.util.typeof(args[0]) != 'object')
        options = args[0] = {};

    if (typeof options.transport != 'function')
        options.transport = dop.transports.listen.local;

    return new dop.core.listener(args);
};




//////////  src/env/browser/websocket.js
(function(root){
function websocket(dop, node, options) {

    var url = 'ws://localhost:4444/'+dop.name,
        args = arguments;
    if (typeof options.url == 'string')
        url = options.url.replace('http','ws');
    else if (typeof window!='undefined' && /http/.test(window.location.href)) {
        var domain_prefix = /(ss|ps)?:\/\/([^\/]+)\/?(.+)?/.exec(window.location.href),
            protocol = domain_prefix[1] ? 'wss' : 'ws';
        url = protocol+'://'+domain_prefix[2].toLocaleLowerCase()+'/'+dop.name;
    }

    // Variables
    var api = options.transport.getApi(),
        socket = new api(url),
        tokenServer,
        send_queue = [],
        readyState;
    
    // Helpers
    function send(message) {
        (socket.readyState===OPEN) ?
            socket.send(message)
        :
            send_queue.push(message); 
    }
    function sendQueue() {
        if (socket.readyState===OPEN)
            while (send_queue.length>0)
                socket.send(send_queue.shift());
    }

    // Socket events
    function onopen() {
        // Reconnect
        if (readyState === CONNECTING)
            socket.send(tokenServer);
        // Connect
        else {
            socket.send(''); // Empty means we want to get connected
            readyState = OPEN;
        }
        dop.core.emitOpen(node, socket, options.transport);
    }
    function onmessage(message) {
        // console.log( 'C<<: `'+message.data+'`' );
        // Reconnecting
        if (readyState===CONNECTING && message.data===tokenServer) {
            readyState = CONNECT;
            dop.core.setSocketToNode(node, socket);
            dop.core.emitReconnect(node, oldSocket);
            sendQueue();
        }
        else if (readyState !== CONNECT) {
            tokenServer = message.data;
            readyState = CONNECT;
            dop.core.setSocketToNode(node, socket);
            send(tokenServer);
            sendQueue();
            dop.core.emitConnect(node);
        }
        else
            dop.core.emitMessage(node, message.data, message);
    }
    function onclose() {
        readyState = CLOSE;
        dop.core.emitClose(node, socket);
    }

    // dop events
    // function onconnect() {
    //     if (readyState === CONNECTING) {
    //         dop.core.emitDisconnect(node);
    //         dop.core.setSocketToNode(node, socket);
    //     }
    //     readyState = CONNECT;
    //     dop.core.emitConnect(node);
    //     sendQueue();
    // }
    function ondisconnect() {
        readyState = CLOSE;
        socket.close();
    }

    function reconnect() {
        if (readyState === CLOSE) {
            oldSocket = socket;
            socket = new api(url);
            readyState = CONNECTING;
            addListeners(socket, onopen, onmessage, onclose);
            removeListeners(oldSocket, onopen, onmessage, onclose);
        }
    }

    // Setting up
    dop.core.setSocketToNode(node, socket);
    readyState = CLOSE;
    node.reconnect = reconnect;
    // node.on(dop.cons.CONNECT, onconnect);
    node.on(dop.cons.SEND, send);
    node.on(dop.cons.DISCONNECT, ondisconnect);
    addListeners(socket, onopen, onmessage, onclose);
    
    return socket;
}

function addListeners(socket, onopen, onmessage, onclose) {
    socket.addEventListener('open', onopen);
    socket.addEventListener('message', onmessage);
    socket.addEventListener('close', onclose);
}
function removeListeners(socket, onopen, onmessage, onclose) {
    socket.removeEventListener('open', onopen);
    socket.removeEventListener('message', onmessage);
    socket.removeEventListener('close', onclose);
}


// UMD
if (typeof dop=='undefined' && typeof module == 'object' && module.exports)
    module.exports = websocket;
else {
    websocket.getApi = function() { return window.WebSocket };
    (typeof dop != 'undefined') ?
        dop.transports.connect.websocket = websocket
    :
        root.dopTransportsConnectWebsocket = websocket;
}

// Cons
var CLOSE = 0,
    OPEN = 1,
    CONNECTING = 2,
    CONNECT = 3;


})(this);




//////////  src/util/alias.js
// Private alias
function isFunction(func) {
    return typeof func == 'function';
}

function isObject(object) {
    return (object!==null && typeof object=='object');
}

function isArray(array) {
    return Array.isArray(array);
}




//////////  src/util/get.js

dop.util.get = function(object, path) {

    if (path.length === 0)
        return object;

    for (var index=0, total=path.length; index<total; index++) {

        if (index+1<total && isObject(object[ path[index] ]))
            object = object[ path[index] ];

        else if (object.hasOwnProperty(path[index]))
            return object[ path[index] ];

        else
            return undefined;

    }

    return object[ path[index] ];

};




// dop.util.set = function(object, path, value) {

//     if (path.length == 0)
//         return object;

//     path = path.slice(0);
//     var obj = object, objdeep, index=0, total=path.length-1;

//     for (;index<total; ++index) {
//         objdeep = obj[path[index]];
//         obj = (objdeep && typeof objdeep == 'object') ?
//             objdeep
//         :
//             obj[path[index]] = {};
//     }

//     obj[path[index]] = value;

//     return object;
// };

// /*
// ori = {test:{hs:124}}
// console.log( dop.util.set(ori, ['test','more'], undefined))
// */







//////////  src/util/invariant.js

dop.util.invariant = function(check) {
    if (!check) {
        var message = dop.util.sprintf.apply(this, Array.prototype.slice.call(arguments, 1));
        throw new Error("[dop] Invariant failed: " + message);
    }
};




//////////  src/util/merge.js

dop.util.merge = function(first, second) {
    var args = arguments;
    if (args.length > 2) {
        // Remove the first 2 arguments of the arguments and add thoose arguments as merged at the begining
        Array.prototype.splice.call(args, 0, 2, dop.util.merge.call(this, first, second));
        // Recursion
        return dop.util.merge.apply(this, args);
    }
    else 
        return dop.util.path(second, this, first, dop.util.mergeMutator);
};

dop.util.mergeMutator = function(destiny, prop, value, typeofValue) {
    if (typeofValue=='object' || typeofValue=='array')
        (!destiny.hasOwnProperty(prop)) ? (destiny[prop] = (typeofValue=='array') ? [] : {}) : destiny[prop];
    else
        destiny[prop] = value;
};




//////////  src/util/path.js

dop.util.path = function (source, callback, destiny, mutator) {
    var hasCallback = isFunction(callback),
        hasDestiny = isObject(destiny);
    dop.util.pathRecursive(source, callback, destiny, mutator, [], [], hasCallback, hasDestiny);
    return destiny;
};

dop.util.pathRecursive = function (source, callback, destiny, mutator, circular, path, hasCallback, hasDestiny) {

    var prop, value, typeofValue, skip;

    for (prop in source) {

        skip = false;
        value = source[prop];
        path.push(prop);

        if (hasCallback)
            skip = callback(source, prop, value, destiny, path, this);

        if (skip !== true) {

            typeofValue = dop.util.typeof(value);

            if (hasDestiny)
                skip = mutator(destiny, prop, value, typeofValue, path);

            // Objects or arrays
            if ((typeofValue=='object' || typeofValue=='array') && skip !== true && value!==source && circular.indexOf(value)==-1) {
                circular.push(value);
                dop.util.pathRecursive(value, callback, hasDestiny?destiny[prop]:undefined, mutator, circular, path, hasCallback, hasDestiny);
            }

            path.pop();
        }
    }
};




//////////  src/util/sprintf.js

dop.util.sprintf = function() {

    var s = -1, result, str=arguments[0], array = Array.prototype.slice.call(arguments, 1);
    return str.replace(/"/g, "'").replace(/%([0-9]+)|%s/g , function() {

        result = array[ 
            (arguments[1] === undefined || arguments[1] === '') ? ++s : arguments[1]
        ];

        if (result === undefined)
            result = arguments[0];

        return result;

    });

};
// Usage: sprintf('Code error %s for %s', 25, 'Hi') -> "Code error 25 for Hi"
// Usage2: sprintf('Code error %1 for %0', 25, 'Hi') -> "Code error Hi for 25"




//////////  src/util/typeof.js
// https://jsperf.com/typeof-with-more-types
// dop={util:{}}
dop.util.typeof = function(value) {
    var s = typeof value;
    if (s == 'object') {
        if (value) {
            if (isArray(value))
                s = 'array';
            else if (value instanceof Date)
                s = 'date';
            else if (value instanceof RegExp)
                s = 'regexp';
        }
        else
            s = 'null';
    }
    return s;
};



// dop.util.typeof2 = (function() {
    
//     var list = {

//         '[object Null]': 'null',
//         '[object Undefined]': 'undefined',
//         '[object Object]': 'object',
//         '[object Function]': 'function',
//         '[object Array]': 'array',
//         '[object Number]': 'number',
//         '[object String]': 'string',
//         '[object Boolean]': 'boolean',
//         '[object Symbol]': 'symbol',
//         '[object RegExp]': 'regexp',
//         '[object Date]': 'date'
//     };


//     return function(type) {

//         return list[ Object.prototype.toString.call(type) ];

//     };


// })();

// Typeof=dop.util.typeof;
// console.log(Typeof(null));
// console.log(Typeof(undefined));
// console.log(Typeof({}));
// console.log(Typeof(function(){}));
// console.log(Typeof([]));
// console.log(Typeof(1));
// console.log(Typeof("s"));
// console.log(Typeof(true));
// console.log(Typeof(/a/));
// console.log(Typeof(new Date()));
// console.log(Typeof(Symbol('')));
// console.log(Typeof(new Typeof));


// Typeof(null);
// Typeof(undefined);
// Typeof({});
// Typeof(function(){});
// Typeof([]);
// Typeof(1);
// Typeof("s");
// Typeof(true);
// Typeof(/a/);
// Typeof(new Date());
// Typeof(Symbol(''));
// Typeof(new Typeof);






//////////  src/util/uuid.js

dop.util.uuid = function () {

    for (var i=0, uuid='', random; i < 32; i++) {
        random = Math.random() * 16 | 0;
        if (i === 8 || i === 12 || i === 16 || i === 20)
            uuid += '-';
        uuid += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random)).toString(16);
    }

    return uuid;
};




//////////  src/api/collect.js

dop.collect = function(filter) {
    dop.util.invariant(arguments.length===0 || (arguments.length>0 && isFunction(filter)), 'dop.collect only accept one argument as function');
    return dop.core.createCollector(dop.data.collectors[0], dop.data.collectors[0].length, filter);
};


// setTimeout(function() {
// console.clear();

// obj=dop.register({mola:123,array:[1,2,{obj:'lol'},4,5,6,7,8],old:"old"})
// arr=obj.array;
// str=dop.encode(obj);

// dop.observe(obj.array, console.log);
// console.log(obj.array.slice(0), obj.array.length);

// collector = dop.collect();
// obj.new='yeah';
// delete obj.old;
// obj.array.shift();
// obj.array.splice(2,{last:9},'coca','cola');
// obj.array.reverse();
// obj.array.push(dop.register({registered:true}));
// obj.array[7].obj='LOOOOOL!'
// collector.emit();

// unaction = collector.getUnaction();
// // console.log(obj.array.slice(0), obj, unaction[3], collector.mutations.length);
// console.log(obj.array.slice(0), obj.array.length, arr===obj.array);
// dop.setAction(unaction);
// console.log(str);
// console.log(dop.encode(obj), str===dop.encode(obj));
// console.log(obj.array.slice(0), obj.array.length, arr===obj.array);

// },1000)




//////////  src/api/collectFirst.js

dop.collectFirst = function(filter) {
    dop.util.invariant(arguments.length===0 || (arguments.length>0 && isFunction(filter)), 'dop.collectFirst only accept one argument as function');
    return dop.core.createCollector(dop.data.collectors[0], 0, filter);
};




//////////  src/api/createAsync.js

dop.createAsync = function() {
    var resolve, reject,
    promise = new Promise(function(res, rej) {
        resolve = res;
        reject = rej;
    });
    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
};



// mypromise = dop.createAsync();
// mypromise.then(function(v) {
//     console.log('yeah',v)
// });
// setTimeout(function() {
//     mypromise.resolve(1234567890)
// },1000);


// dop.core.createAsync = function() {
//     var observable = Rx.Observable.create(function(observer) {
//         observable.resolve = function(value) {
//             observer.onNext(value);
//             observer.onCompleted();
//         };
//         observable.reject = observer.onError;
//     });
//     return observable;
//     // return {stream:observable,resolve:observer.onNext,reject:observer.onError,cancel:cancel};
// };
// mypromise = dop.createAsync();
// mypromise.subscribe(function(v) {
//     console.log('yeah',v);
// });
// setTimeout(function() {
//     mypromise.resolve(1234567890);
// },1000);




// https://github.com/ReactiveX/rxjs/issues/556
// function getData(num) {
//   return new Promise((resolve, reject) => {
//     resolve(num + 1);
//   });
// }

// async function create() {
//   var list = await Rx.Observable.range(1, 5)
//     .flatMap(num => getData(num))
//     .toArray().toPromise();

//   return list;
// }

// console.clear();

// Rx.Observable.fromPromise(create()).subscribe(list => {
//   console.log(list);
// }, err => {
//   console.log(err);
// });





//////////  src/api/createObserverMultiple.js

dop.createObserverMultiple = function(callback) {
    dop.util.invariant(isFunction(callback), 'dop.createObserverMultiple only accept one argument as function');
    var observers=dop.data.observers, index, observer_id, observer;
    for (index in observers)
        if (observers[index].callback === callback)
            return observers[index];

    observer_id = dop.data.observers_inc++;
    observer = new dop.core.observer(callback, observer_id);
    return observers[observer_id] = observer;
};




//////////  src/api/decode.js

dop.decode = function(data, node) {
    var undefineds = [],
        index = 0,
        total,
        output = JSON.parse(data, function(property, value) {
            return dop.core.decode.call(this, property, value, node, undefineds);
        });

    for (total=undefineds.length,index=0; index<total; ++index)
        undefineds[index][0][undefineds[index][1]] = undefined;

    return output;
};




//////////  src/api/del.js

dop.del = function(object, property) {
    // dop.util.invariant(dop.isRegistered(object), 'Object passed to dop.del must be a registered object');
    return (dop.isRegistered(object)) ?
        dop.core.delete(object, property) !== undefined
    :
        delete object[property];
};




//////////  src/api/emit.js

dop.emit = function(mutations, action) {
    if (mutations.length>0) {
        // This is true if we have nodes subscribed to those object/mutations
        if (dop.core.emitObservers(mutations)) {
            if (action === undefined)
                action = dop.getAction(mutations);
            dop.core.emitNodes(action);
        }
    }
};




//////////  src/api/encode.js

dop.encode = function(data, encoder) {
    if (typeof encoder != 'function')
        encoder = dop.core.encode;
    return JSON.stringify(data, encoder);
};
dop.encodeFunction = function(data) {
    return JSON.stringify(data, dop.core.encodeFunction);
};




//////////  src/api/getAction.js

dop.getAction = function(mutations) {

    var actions = {},
        index = 0,
        total = mutations.length,
        mutation,
        object_id;

    for (;index<total; ++index) {
        mutation = mutations[index];
        if (dop.core.objectIsStillStoredOnPath(mutation.object)) {// Only need it for arrays but is faster than injectMutation directly
            object_id = dop.getObjectId(mutation.object);
            if (actions[object_id] === undefined)
                actions[object_id] = {object:dop.getObjectRoot(mutation.object), action:{}};
            dop.core.injectMutationInAction(actions[object_id].action, mutation);
        }
    }

    return actions;
};




//////////  src/api/getNodeBySocket.js

dop.getNodeBySocket = function(socket) {
    return dop.data.node[ socket[dop.cons.TOKEN] ];
};




//////////  src/api/getObject.js

dop.getObjectDop = function(object) {
    if (isObject(object))
        return object[dop.cons.DOP];
};

dop.getObjectId = function(object) {
    var object_dop = dop.getObjectDop(object);
    return object_dop ? object_dop[0] : undefined;
};

dop.getObjectParent = function(object) {
    var object_dop = dop.getObjectDop(object);
    return object_dop ? object_dop._ : undefined;
};

dop.getObjectProperty = function(object) {
    var object_dop = dop.getObjectDop(object);
    return object_dop[object_dop.length-1];
};

dop.getObjectProxy = function(object) {
    return dop.getObjectDop(object).p;
};

dop.getObjectRoot = function(object) {
    while(dop.getObjectParent(object) !== undefined)
        object = dop.getObjectParent(object);
    return dop.getObjectProxy(object);
};

// dop.getObjectRoot = function(object) {
//     return dop.data.object[dop.getObjectId(object)];
// };

// dop.getObjectRootById = function(object_id) {
//     return dop.data.object[object_id];
// };

dop.getObjectTarget = function(object) {
    return dop.getObjectDop(object).t;
};




//////////  src/api/getUnaction.js

dop.getUnaction = function(mutations) {

    var actions = {},
        index = mutations.length-1,
        object_id,
        mutation;

    for (;index>-1; --index) {
        mutation = mutations[index];
        object_id = dop.getObjectId(mutation.object);
        if (actions[object_id] === undefined)
            actions[object_id] = {object:dop.getObjectRoot(mutation.object), action:{}};
        dop.core.injectMutationInAction(actions[object_id].action, mutation, true);
    }

    return actions;
};




//////////  src/api/isBroadcastFunction.js

dop.isBroadcastFunction = function(fun) {
    return (isFunction(fun) && fun.name===dop.cons.BROADCAST_FUNCTION);
};




//////////  src/api/isObjectRegistrable.js

dop.isObjectRegistrable = function(object) {
    var tof = dop.util.typeof(object);
    return (tof === 'object' || tof == 'array');
};

// dop.isObjectRegistrable = function(object) {
//     if (!object)
//         return false;
//     var prototype = Object.getPrototypeOf(object);
//     return (prototype === Object.prototype || prototype === Array.prototype);
// };

// function Test(){}
// console.log(isObjectRegistrable({}));
// console.log(isObjectRegistrable([]));
// console.log(isObjectRegistrable(new Test));
// console.log(isObjectRegistrable(new Map));
// console.log(isObjectRegistrable(new Date()));
// console.log(isObjectRegistrable(null));
// console.log(isObjectRegistrable(Symbol('')));
// console.log(isObjectRegistrable(function(){}));
// console.log(isObjectRegistrable(1));
// console.log(isObjectRegistrable("s"));
// console.log(isObjectRegistrable(true));
// console.log(isObjectRegistrable(/a/));




//////////  src/api/isProxy.js

dop.isProxy = function (object) {
    return (dop.isRegistered(object) && dop.getObjectProxy(object)===object);
};




//////////  src/api/isRegistered.js

dop.isRegistered = function (object) {
    if (isObject(object)){
        var object_dop = dop.getObjectDop(object);
        if (isArray(object_dop) && object_dop.hasOwnProperty('p'))
            return true;
    }
    return false;
};




//////////  src/api/isRemoteFunction.js

dop.isRemoteFunction = function(fun) {
    return (isFunction(fun) && fun.name===dop.cons.REMOTE_FUNCTION);
};




//////////  src/api/isTarget.js

dop.isTarget = function (object) {
    return (dop.isRegistered(object) && dop.getObjectTarget(object)===object);
};




//////////  src/api/observe.js

dop.observe = function(object, callback) {
    dop.util.invariant(dop.isRegistered(object), 'dop.observe needs a registered object as first parameter');
    dop.util.invariant(isFunction(callback), 'dop.observe needs a callback as second parameter');

    if (dop.getObjectDop(object).o.indexOf(callback) == -1) {
        dop.getObjectDop(object).o.push(callback);

        return function defered() {
            return dop.unobserve(object, callback);
        }
    }

};




//////////  src/api/observeProperty.js

dop.observeProperty = function(object, property, callback) {
    dop.util.invariant(dop.isRegistered(object), 'dop.observeProperty needs a registered object as first parameter');
    dop.util.invariant(isFunction(callback), 'dop.observeProperty needs a callback as third parameter');

    if (dop.util.typeof(dop.getObjectDop(object).op) != 'object')
        dop.getObjectDop(object).op = {};

    var observers = (dop.util.typeof(dop.getObjectDop(object).op[property]) != 'array') ?
        (dop.getObjectDop(object).op[property] = [])
    :
        dop.getObjectDop(object).op[property];


    if (observers.indexOf(callback) == -1) {
        observers.push(callback);
        return function defered() {
            return dop.unobserveProperty(object, property, callback);
        }
    }
};




//////////  src/api/onsubscribe.js

dop.onsubscribe = function(callback) {
    dop.util.invariant(isFunction(callback), 'dop.onsubscribe only accept a function as parameter');
    dop.data.onsubscribe = callback;
};




//////////  src/api/register.js

dop.register = function(object, options) {

    dop.util.invariant(dop.isObjectRegistrable(object), 'dop.register needs a regular object as first parameter');

    if (dop.isRegistered(object))
        return dop.getObjectProxy(object);    

    var object_id = dop.data.object_inc++;
    // options = dop.util.merge({unregister:false}, options);
    object = dop.core.configureObject(object, [object_id]);
    // dop.data.object[object_id] = object;
    // dop.data.object_data[object_id] = {
    //     last: 0, // last mutation id
    //     nodes: 0, // total nodes depending
    //     options: options,
    //     owners: {},
    //     subscribers: {}
    // };

    return object;

};





//////////  src/api/set.js

dop.set = function(object, property, value) {
    // dop.util.invariant(dop.isRegistered(object), 'Object passed to dop.set must be a registered object');
    (dop.isRegistered(object)) ?
        dop.core.set(object, property, value)
    :
        object[property] = value;
    return value;
};




//////////  src/api/setAction.js

dop.setAction = function(actions) {
    var collector = dop.collectFirst(), object_id;
    for (object_id in actions)
        dop.core.setAction(actions[object_id].object, actions[object_id].action);
    return collector;
};




//////////  src/api/setBroadcastFunction.js

dop.setBroadcastFunction = function (object, namefunction) {
    dop.util.invariant(dop.isRegistered(object), 'Object passed to dop.setBroadcastFunction must be a registered object');
    var path = dop.getObjectDop(object).slice(0),
        object_id = path.shift();
    path.push(namefunction);
    dop.getObjectTarget(object)[namefunction] = function $DOP_BROADCAST_FUNCTION() {
        return dop.protocol.broadcast(object_id, path, arguments);
    }
};




//////////  src/api/unobserve.js

dop.unobserve = function(object, callback) {
    dop.util.invariant(dop.isRegistered(object), 'dop.unobserve needs a registered object as first parameter');
    dop.util.invariant(isFunction(callback), 'dop.unobserve needs a callback as second parameter');

    var observers = dop.getObjectDop(object).o, indexOf;
    if (dop.util.typeof(observers) != 'array')
        return false;

    indexOf = observers.indexOf(callback);

    if (indexOf == -1)
        return false;
    else
        observers.splice(indexOf, 1);

    if (observers.length == 0)
        delete dop.getObjectDop(object).o;

    return true;
};




//////////  src/api/unobserveProperty.js

dop.unobserveProperty = function(object, property, callback) {
    dop.util.invariant(dop.isRegistered(object), 'dop.unobserveProperty needs a registered object as first parameter');
    dop.util.invariant(isFunction(callback), 'dop.unobserveProperty needs a callback as second parameter');

    var observers = dop.getObjectDop(object).op, indexOf;
    if (dop.util.typeof(observers) != 'object' || dop.util.typeof(observers[property]) != 'array')
        return false;

    observers = observers[property];
    indexOf = observers.indexOf(callback);

    if (indexOf == -1)
        return false;
    else
        observers.splice(indexOf, 1);

    if (observers.length == 0)
        delete dop.getObjectDop(object).op[property];

    return true;
};







//////////  src/core/api_transports/emitClose.js

dop.core.emitClose = function(node, socket) {
    if (node.listener)
        node.listener.emit('close', socket);
    node.emit('close', socket);
};




//////////  src/core/api_transports/emitConnect.js

dop.core.emitConnect = function(node) {
    node.connected = true;
    if (node.listener)
        node.listener.emit('connect', node);
    node.emit('connect');
    dop.core.sendMessages(node);
};




//////////  src/core/api_transports/emitDisconnect.js

dop.core.emitDisconnect = function(node) {
    node.connected = false;
    if (node.listener) {
        dop.core.unregisterNode(node);
        node.listener.emit('disconnect', node);
    }
    node.emit('disconnect');
};




//////////  src/core/api_transports/emitMessage.js

dop.core.emitMessage = function(node, message_string, message_raw) {

    // If server
    if (node.listener)
        node.listener.emit('message', node, message_string, message_raw);

    node.emit('message', message_string, message_raw);

    var messages;

    // Parsing messages
    if (typeof message_string == 'string' && message_string.substr(0,1) == '[') {
        try { messages = dop.decode(message_string, node); } 
        catch(e) { /*console.log(e);*/ }
    }
    else 
        messages = message_string;


    // Managing protocol
    if (isArray(messages)) {

        // Detecting if is multimessage
        if (typeof messages[0] == 'number')
            messages = [messages];

        // Managing all messages one by one
        for (var i=0, t=messages.length, message, requests, request, request_id, response, instruction_type, message_typeof; i<t; i++) {

            message = messages[i];
            request_id = message[0];

            // If is a number we manage the request
            if (typeof request_id == 'number' && request_id !== 0) {

                // If is only one request
                message_typeof = dop.util.typeof(message[1]);
                requests = ((message_typeof=='number' && message_typeof!='array') || request_id<0) ? 
                    [request_id, message.slice(1)]
                :
                    requests = message;


                for (var j=1, t2=requests.length, instruction_function; j<t2; ++j) {
                    
                    request = requests[j];

                    if (dop.util.typeof(request)=='array' && ((typeof request[0]=='number' && request_id>0) || request_id<0)) {
                        
                        instruction_type = request[0];
                        instruction_function = 'on'+dop.protocol.instructions[instruction_type];

                        // REQUEST ===============================================================
                        if (request_id>0 && isFunction(dop.protocol[instruction_function]))
                            dop.protocol[instruction_function](node, request_id, request);


                        // RESPONSE ===============================================================
                        else {

                            request_id *= -1;

                            if (isObject(node.requests[request_id])) {

                                response = request;
                                request = node.requests[request_id];

                                instruction_type = request[1];
                                instruction_function = '_on'+dop.protocol.instructions[instruction_type];

                                if (isFunction(dop.protocol[instruction_function]))
                                    dop.protocol[instruction_function](node, request_id, request, response);
                                
                                dop.core.deleteRequest(node, request_id);
                            }

                        }

                    }
                }

            }

        }

    }






    // var messages, 
    //     user = (socket[dop.cons.TOKEN] === undefined) ?
    //         socket
    //     :
    //         node.users[ socket[dop.cons.TOKEN] ];






    // // Managing OSP protocol
    // if (dop.util.typeof(messages) == 'array')
    //     dop.core.manage.call(this, user, messages);

};




//////////  src/core/api_transports/emitOpen.js

dop.core.emitOpen = function(listener_node, socket, transport) {
    var node;
    // Client
    if (listener_node instanceof dop.core.node)
        node = listener_node;
    // Server
    else {
        node = new dop.core.node();
        node.listener = listener_node;
    }
    node.transport = transport;
    dop.core.registerNode(node);
    listener_node.emit('open', socket);
    return node;
};




//////////  src/core/api_transports/emitReconnect.js

dop.core.emitReconnect = function(node, oldSocket, newNode) {
    if (node.listener) {
        dop.core.unregisterNode(newNode);
        node.listener.emit('reconnect', node, oldSocket);
    }
    node.emit('reconnect', oldSocket);
    dop.core.sendMessages(node);
};





//////////  src/core/constructors/collector.js

dop.core.collector = function(queue, index) {
    this.active = true;
    this.shallWeGenerateAction = true;
    this.shallWeGenerateUnaction = true;
    this.mutations = [];
    this.queue = queue;
    queue.splice(index, 0, this);
};



dop.core.collector.prototype.add = function(mutation) {
    if (this.active && (this.filter===undefined || this.filter(mutation)===true)) {
        this.shallWeGenerateAction = true;
        this.shallWeGenerateUnaction = true;
        this.mutations.push(mutation);
        return true;
    }
    return false;
};


dop.core.collector.prototype.emit = function() {
    var mutations = this.mutations;
    dop.emit(mutations, this.action);
    this.mutations = [];
    return mutations;
};


dop.core.collector.prototype.destroy = function() {
    this.active = false;
    this.queue.splice(this.queue.indexOf(this), 1);
};


dop.core.collector.prototype.emitAndDestroy = function() {
    this.destroy();
    return this.emit();
};


dop.core.collector.prototype.getAction = function() {
    if (this.shallWeGenerateAction) {
        this.shallWeGenerateAction = false;
        this.action = dop.getAction(this.mutations);
    }
    return this.action;
};


dop.core.collector.prototype.getUnaction = function() {
    if (this.shallWeGenerateUnaction) {
        this.shallWeGenerateUnaction = false;
        this.unaction = dop.getUnaction(this.mutations);
    }
    return this.unaction;
};





//////////  src/core/constructors/listener.js

dop.core.listener = function(args) {
    // Inherit emitter
    dop.util.merge(this, new dop.util.emitter);
    args.unshift(dop, this);
    this.options = args[2];
    this.transport = this.options.transport;
    this.listener = this.options.transport.apply(this, args);
};




//////////  src/core/constructors/node.js

dop.core.node = function() {
    // Inherit emitter
    dop.util.merge(this, new dop.util.emitter); //https://jsperf.com/inheritance-call-vs-object-assign
    this.connected = false;
    this.request_inc = 1;
    this.requests = {};
    this.message_queue = []; // Response / Request / instrunctions queue
    this.subscriber = {};
    this.owner = {};
    // Generating token
    do { this.token = dop.util.uuid() }
    while (typeof dop.data.node[this.token]=='object');
};



dop.core.node.prototype.send = function(message) {
    this.emit(dop.cons.SEND, message);
};

dop.core.node.prototype.disconnect = function() {
    this.emit(dop.cons.DISCONNECT);
};

dop.core.node.prototype.subscribe = function() {
    return dop.protocol.subscribe(this, arguments);
};

dop.core.node.prototype.unsubscribe = function(object) {
    return dop.protocol.unsubscribe(this, object);
};




//////////  src/core/constructors/observer.js

dop.core.observer = function(callback, id) {
    this.callback = callback;
    this.id = id;
    this.objects = [];
    this.properties = {};
};


dop.core.observer.prototype.observe = function(object) {
    dop.util.invariant(dop.isRegistered(object), 'observer.observe needs a registered object as first parameter');
    var object_dop = dop.getObjectDop(object);
    if (object_dop.om[this.id] === undefined) {
        // Storing in object
        object_dop.om[this.id] = true;
        // Storing in observer
        this.objects.push(object); // using for .destroy()
    }
};
dop.core.observer.prototype.unobserve = function(object) {
    dop.util.invariant(dop.isRegistered(object), 'observer.unobserve needs a registered object as first parameter');
    // Removing from object
    delete dop.getObjectDop(object).om[this.id];
    // Removing from observer
    var index = this.objects.indexOf(object);  // using for .destroy()
    if (index > -1)
        this.objects.splice(index,1); // using for .destroy()
};



dop.core.observer.prototype.observeProperty = function(object, property) {
    dop.util.invariant(dop.isRegistered(object), 'observer.observeProperty needs a registered object as first parameter');
    // Storing in object
    var object_dop = dop.getObjectDop(object);
    if (object_dop.omp[property] === undefined)
        object_dop.omp[property] = {};
    if (object_dop.omp[property][this.id] === undefined) {
        object_dop.omp[property][this.id] = true;
        // Storing in observer
        if (this.properties[property] === undefined)
            this.properties[property] = [];
        this.properties[property].push(object); // using for .destroy()
    }
};
dop.core.observer.prototype.unobserveProperty = function(object, property) {
    dop.util.invariant(dop.isRegistered(object), 'observer.unobserveProperty needs a registered object as first parameter');
    var object_dop = dop.getObjectDop(object),
        properties = this.properties[property],
        index;
    // Removing from object
    if (object_dop.omp[property] !== undefined)
        delete object_dop.omp[property][this.id];
    // Removing from observer
    if (properties !== undefined) {
        index = properties.indexOf(object);  // using for .destroy()
        if (index > -1)
            properties.splice(index,1); // using for .destroy()
    }
};


dop.core.observer.prototype.destroy = function() {
    var index=0,
        objectsandproperties = this.objects,
        total=objectsandproperties.length,
        property;
    
    // Deleting objects
    for (;index<total; ++index)
        delete dop.getObjectDop(objectsandproperties[index]).om[this.id];

    // Deleting properties
    objectsandproperties = this.properties;
    for (property in objectsandproperties)
        for (index=0,total=objectsandproperties[property].length; index<total; ++index)
            delete dop.getObjectDop(objectsandproperties[property][index]).omp[property][this.id];

    // Deleting from dop.data
    delete dop.data.observers[this.id];
};






//////////  src/core/error.js

dop.core.error = {

    // warning: {
    //     TOKEN_REJECTED: 'User disconnected because is rejecting too many times the token assigned'
    // },

    reject_local: {
        OBJECT_NOT_FOUND: 'Object not found',
        NODE_NOT_FOUND: 'Node not found',
        TIMEOUT_REQUEST: 'Timeout waiting for response'
    },

    // Remote rejects
    reject_remote: {
        OBJECT_NOT_FOUND: 1,
        1: 'Remote object not found or not permissions to use it',
        SUBSCRIPTION_NOT_FOUND: 2,
        2: 'Subscription not found to unsubscribe this object',
        FUNCTION_NOT_FOUND: 3,
        3: 'Remote function not found to be called',
        CUSTOM_REJECTION: 4,
        // 4: ''
    }

};





//////////  src/core/mutators/delete.js

dop.core.delete = function(object, property) {
    var descriptor = Object.getOwnPropertyDescriptor(object, property);
    if (descriptor && descriptor.configurable) {
        
        var objectTarget = dop.getObjectTarget(object),
            objectProxy = dop.getObjectProxy(object);

        if (objectTarget===objectProxy || object===objectProxy) {
            var mutation = {
                object:dop.getObjectProxy(objectTarget),
                name:property,
                oldValue:objectTarget[property]
            };
            dop.core.storeMutation(mutation);
        }

        return delete objectTarget[property];
    }
};




//////////  src/core/mutators/pop.js

dop.core.pop = function(array) {
    if (array.length === 0)
        return undefined;
    var spliced = dop.core.splice(array, [array.length-1, 1]);
    return spliced[0];
};




//////////  src/core/mutators/push.js
// https://jsperf.com/push-against-splice OR https://jsperf.com/push-vs-splice
dop.core.push = function(array, items) {
    if (items.length === 0)
        return array.length;
    items.unshift(array.length, 0);
    var spliced = dop.core.splice(array, items);
    return array.length;
};




//////////  src/core/mutators/reverse.js
// https://jsperf.com/array-reverse-algorithm
dop.core.reverse = function(array) {
    var objectTarget = dop.getObjectTarget(array),
        objectProxy = dop.getObjectProxy(array),
        total = objectTarget.length/2,
        index = 0,
        indexr,
        swaps = [],
        shallWeStore = (objectTarget===objectProxy || array===objectProxy);

    for (;index<total; ++index) {
        indexr = objectTarget.length-index-1;
        if (index !== indexr) {
            tempItem = objectTarget[indexr];
            objectTarget[indexr] = objectTarget[index];
            objectTarget[index] = tempItem;
            if (shallWeStore)
                swaps.push(index, indexr);

            // Updating path
            dop.core.updatePathArray(objectTarget, index);
            dop.core.updatePathArray(objectTarget, indexr);
        }
    }

    if (shallWeStore && swaps.length>0)
        dop.core.storeMutation({
            object:objectProxy,
            swaps:swaps
        });

    return array;
};













// dop.core.swap = function() {
//     var items = Array.prototype.slice.call(arguments, 0),
//         array = this,
//         objectTarget = dop.getObjectTarget(array),
//         objectProxy = dop.getObjectProxy(array),
//         swaps = [],
//         shallWeStore = (objectTarget===objectProxy || array===objectProxy),
//         index=0, length=items.length, one, two, tempItem;

//     for (;index<length; index+=2) {
//         one = Number(items[index]);
//         two = Number(items[index+1]);
//         if (!isNaN(two) && one!==two) {
//             // if (objectTarget===objectProxy || array===objectProxy) {}
//             tempItem = objectTarget[two];
//             objectTarget[two] = objectTarget[one];
//             objectTarget[one] = tempItem;
//             swaps.push(one,two);
//         }
//     }

//     if (shallWeStore && swaps.length>0)
//         dop.core.storeMutation({
//             object:objectProxy,
//             swaps:swaps
//         });

//     return swaps;
// };


// var arr = ['Hola', 'Mundo', 'Cruel', 'Te', 'Odio', 'Mucho'];
// swap.call(arr, 2,1,3,'5','1','0');
// console.log( arr );

// swap.call(arr, '0','1','5',3,1,2);
// console.log( arr );





//////////  src/core/mutators/set.js

dop.core.set = function(object, property, value) {

    if (object[property] !== value) {

        var descriptor = Object.getOwnPropertyDescriptor(object, property);

        if (!descriptor || (descriptor && descriptor.writable)) {
            var objectTarget = dop.getObjectTarget(object),
                objectProxy = dop.getObjectProxy(object),
                oldValue = objectTarget[property],
                length = objectTarget.length,
                hasOwnProperty = objectTarget.hasOwnProperty(property);

            // Setting
            objectTarget[property] = value;
            if (dop.isObjectRegistrable(value)) {
                // var object_dop = dop.getObjectDop(value);
                // if (dop.isRegistered(value) && isArray(object_dop._) && object_dop._ === objectTarget)
                //     object_dop[object_dop.length-1] = property;
                // else {
                    // var shallWeProxy = dop.data.object_data[dop.getObjectId(objectTarget)].options.proxy;
                    objectTarget[property] = dop.core.configureObject(value, dop.getObjectDop(objectTarget).concat(property), objectTarget);
                // }
            }

            if ((objectTarget===objectProxy || object===objectProxy) && !(isFunction(object[property]) && isFunction(value))) {
                var mutation = {object:objectProxy, name:property, value:value};
                if (hasOwnProperty)
                    mutation.oldValue = oldValue;
                if (isArray(objectTarget)) // if is array we must store the length in order to revert it with setUnaction
                    mutation.length = length;
                if (isArray(value)) // We cant store the original array cuz when we inject the mutation into the action object could be different from the original
                    mutation.valueOriginal = dop.util.merge([], value);

                dop.core.storeMutation(mutation);

                return mutation;
            }
        }
    }
};




//////////  src/core/mutators/shift.js

dop.core.shift = function(array) {
    if (array.length === 0)
        return undefined;
    var spliced = dop.core.splice(array, [0, 1]);
    return spliced[0];
};




//////////  src/core/mutators/sort.js
// http://stackoverflow.com/a/234777/1469219 http://stackoverflow.com/a/38905402/1469219
// https://en.wikipedia.org/wiki/Sorting_algorithm#Stability
// http://khan4019.github.io/front-end-Interview-Questions/sort.html#bubbleSort
// https://github.com/benoitvallon/computer-science-in-javascript/tree/master/sorting-algorithms-in-javascript
dop.core.sort = function(array, compareFunction) {
    var objectTarget = dop.getObjectTarget(array),
        objectProxy = dop.getObjectProxy(array),
        copy = objectTarget.slice(0),
        output, swaps;

    output = Array.prototype.sort.call(objectTarget, compareFunction);
    swaps = dop.core.sortDiff(objectTarget, copy);
    if (swaps.length>1 && (objectTarget===objectProxy || array===objectProxy))
        dop.core.storeMutation({
            object:objectProxy,
            swaps:swaps
        });
    return output;
};


dop.core.sortDiff = function (array, copy) {

    var total = copy.length,
        swaps = [],
        index1 = 0,
        index2, tmp;

    for (;index1<total; ++index1) {
        if (array[index1] !== copy[index1]) {
            index2 = copy.indexOf(array[index1]);
            tmp = copy[index1];
            copy[index1] = copy[index2];
            copy[index2] = tmp;
            swaps.push(index1, index2);
            // Updating path
            dop.core.updatePathArray(copy, index1);
            dop.core.updatePathArray(copy, index2);
        }
    }

    return swaps;
}




// function diffArray(array) {
//     var copy = array.slice(0),
//         swaps = [],
//         index = 0,
//         total = copy.length,
//         indexNew, tmp;

//     array.sort();

//     for (;index<total; ++index) {
//         if (copy[index] !== array[index]) {
//             indexNew = copy.indexOf(array[index]);
//             tmp = copy[index];
//             copy[index] = copy[indexNew];
//             copy[indexNew] = tmp;
//             swaps.push([index, indexNew]);
            
//             console.log([index, indexNew], copy );
//             if (indexNew < index) {
//                 console.log( 'lol' );
//             }
            
//             // swapeds[indexNew] = true;
//             // if (indexCache!==indexNew && indexCache !== index) {
//             //     swapeds[indexCache] = true;
//             //     swap(copy, indexNew, indexCache);
//             //     swaps.push([indexNew, indexCache]);
//             //     console.log([indexNew, indexCache], copy, swapeds );
//             // }
//         }
//     }

//     return swaps;
// }




//////////  src/core/mutators/splice.js

dop.core.splice = function(array, args) {

    var originallength = array.length,
        objectTarget = dop.getObjectTarget(array),
        objectProxy = dop.getObjectProxy(array),
        spliced;



    // Splicing!!
    spliced = Array.prototype.splice.apply(objectTarget, args);

    // If enviroment do not allow proxies (objectTarget and objectProxy are same object in that case) 
    // or if the array is the proxy itself
    if (objectTarget===objectProxy || array===objectProxy) {

        var argslength = args.length,
            length = objectTarget.length,
            start = Number(args[0]),
            deleteCount = (Number(args[1])>0) ? args[1] : 0,
            itemslength = (args.length>2) ? (args.length-2) : 0,
            end, item, object_dop;


        // Defaults for start
        if (isNaN(start))
            start = 0;
        else if (start<0)
            start = (length+start < 0) ? 0 : length+start;
        else if (start>originallength)
            start = originallength;


        // We dont need update becase no items remaining after splice
        end = (argslength===1) ? 0 :
            // If deleteCount is the same of items to add means the new lengh is the same and we only need to update the new elements
            (argslength>2 && deleteCount===itemslength) ?
                start+deleteCount
            :
                objectTarget.length;



        for (;start<end; ++start) {
            item = objectTarget[start];
            if (dop.isObjectRegistrable(item)) {

                object_dop = dop.getObjectDop(item);

                if (object_dop!==undefined && object_dop._ === objectTarget)
                    object_dop[object_dop.length-1] = start;

                else
                    objectTarget[start] = dop.core.configureObject(
                        item,
                        dop.getObjectDop(objectTarget).concat(start),
                        // dop.data.object_data[dop.getObjectId(objectTarget)].options.proxy,
                        objectTarget
                    );
            }
        }


        if (originallength!==length || itemslength>0) {
            if (args[0]<0)
                args[0] = array.length+args[0];
            var mutation = {
                object:objectProxy,
                splice:args
            };
            if (spliced.length > 0)
                mutation.spliced = spliced;
            dop.core.storeMutation(mutation);
        }

    }

    return spliced;
};





//////////  src/core/mutators/swap.js

dop.core.swap = function(array, swaps) {

    if (swaps.length>1) {

        var objectTarget = dop.getObjectTarget(array),
            objectProxy = dop.getObjectProxy(array),
            index = 0,
            total = swaps.length-1,
            tempItem, swapA, swapB;

        for (;index<total; index+=2) {
            swapA = swaps[index];
            swapB = swaps[index+1];
            tempItem = objectTarget[swapA];
            objectTarget[swapA] = objectTarget[swapB];
            objectTarget[swapB] = tempItem;
            // Updating path
            dop.core.updatePathArray(objectTarget, swapA);
            dop.core.updatePathArray(objectTarget, swapB);
        }


        if (objectTarget===objectProxy || array===objectProxy)
            dop.core.storeMutation({
                object:objectProxy,
                swaps:swaps
            });

        return array;
    }

};




//////////  src/core/mutators/unshift.js

dop.core.unshift = function(array, items) {
    if (items.length === 0)
        return array.length;
    items.unshift(0, 0);
    var spliced = dop.core.splice(array, items);
    return array.length;
};





//////////  src/core/objects/configureObject.js

var canWeProxy = typeof Proxy == 'function';
dop.core.configureObject = function(object, path, parent) {

    // Creating a copy if is another object registered
    if (dop.isRegistered(object))
        return dop.core.configureObject(
            dop.util.merge(isArray(object)?[]:{}, object),
            path,
            parent
        );

    // Removing fake dop property
    delete object[dop.cons.DOP];

    // Recursion
    var property, value, object_dop;
    for (property in object) {
        value = object[property];
        if (isFunction(value) && value.name==dop.core.createRemoteFunction.name)
            object[property] = value(path[0], path.slice(1).concat(property));
        else if (dop.isObjectRegistrable(value))
            object[property] = dop.core.configureObject(value, path.concat(property), object);
    }

    // Setting ~DOP object
    Object.defineProperty(object, dop.cons.DOP, {value:path.slice(0)});
    object_dop = dop.getObjectDop(object);
    object_dop.m = []; // mutations
    object_dop.o = []; // observers
    object_dop.op = {}; // observers by property
    object_dop.om = {}; // observers multiple
    object_dop.omp = {}; // observers multiple


    if (isObject(parent))
        object_dop._ = (dop.isRegistered(parent)) ? dop.getObjectTarget(parent) : parent;


    // Making proxy object
    if (canWeProxy) {
        var target = object;
        object = new Proxy(object, dop.core.proxyObjectHandler);
        // Adding proxy and target alias
        object_dop.p = object;
        object_dop.t = target;
    }
    else
        object_dop.p = object_dop.t = object;


    // Adding traps for mutations methods of arrays
    if (dop.util.typeof(object) == 'array')
        Object.defineProperties(object, dop.core.proxyArrayHandler);


    return object;
};




//////////  src/core/objects/createCollector.js

dop.core.createCollector = function(queue, index, filter) {
    var collector = new dop.core.collector(queue, index);
    collector.filter = filter;
    return collector;
};




//////////  src/core/objects/emitObservers.js

dop.core.emitObservers = function(mutations) {

    var mutation,
        objects = [],
        object,
        index = 0,
        index2,
        total = mutations.length,
        total2,
        object_dop,
        observersMultiples = {}, // from dop.core.observer() && dop.createObserverMultiple()
        observersProperties,
        observers,
        observer_id,
        mutationsWithSubscribers = false;

    for (;index<total; ++index) {
        mutation = mutations[index];
        object = mutation.object;
        object_dop = dop.getObjectDop(object);

        if (!mutationsWithSubscribers && isObject(dop.data.object[object_dop[0]]))
            mutationsWithSubscribers = true;

        // Storing mutations that will be emited to observeMultiples aka observers
        for (observer_id in object_dop.om) {
            if (observersMultiples[observer_id] === undefined)
                observersMultiples[observer_id] = [];
            observersMultiples[observer_id].push(mutation); 
        }
        if (object_dop.omp[mutation.name] !== undefined) {
            for (observer_id in object_dop.omp[mutation.name]) {
                // If it hasn't been stored yet
                if (object_dop.om[observer_id] === undefined) { 
                    if (observersMultiples[observer_id] === undefined)
                        observersMultiples[observer_id] = [];
                    observersMultiples[observer_id].push(mutation); 
                }
            }  
        }

        // Emiting mutations to observerProperties
        observersProperties = object_dop.op[mutation.name];
        if (dop.util.typeof(observersProperties) == 'array' &&  observersProperties.length>0)
            for (index2=0,total2=observersProperties.length; index2<total2; ++index2)
                observersProperties[index2](mutation);

        if (objects.indexOf(object) === -1) {
            objects.push(object);

            // Emiting mutations to observers
            observers = object_dop.o;
            for (index2 = 0, total2 = observers.length;index2<total2; ++index2)
                observers[index2](object_dop.m.slice(0));

            object_dop.m = [];
        }
    }

    // Emiting to observeMultiples
    for (observer_id in observersMultiples)
        dop.data.observers[observer_id].callback(observersMultiples[observer_id]);

    return mutationsWithSubscribers;
};




//////////  src/core/objects/injectMutationInAction.js

dop.core.injectMutationInAction = function(action, mutation, isUnaction) {

    var isMutationArray = mutation.splice!==undefined || mutation.swaps!==undefined,
        path = dop.getObjectDop(mutation.object).slice(0),
        prop = mutation.name,
        value = (isUnaction) ? mutation.oldValue : mutation.value,
        typeofValue = dop.util.typeof(value),
        index = 1,
        parent;


    if (!isMutationArray)
        path.push(prop);

    for (;index<path.length-1; ++index) {
        parent = action;
        prop = path[index];
        action = isObject(action[prop]) ? action[prop] : action[prop]={};
    }

    prop = path[index];

    if (isMutationArray || isArray(mutation.object)) {

        if (path.length>1) {
            if (isMutationArray && !isObject(action[prop])) 
                action[prop] = {};

            if (isMutationArray)
                action = action[prop];
        }

        if (!isObject(action[dop.cons.DOP]))
            action[dop.cons.DOP] = [];
            
        var mutations = action[dop.cons.DOP];

        // swap
        if (mutation.swaps!==undefined) {
            var swaps = mutation.swaps.slice(0);
            if (isUnaction)
                swaps.reverse();
            // var tochange = (swaps[0]>0) ? 0 : 1;
            // swaps[tochange] = swaps[tochange]*-1;
            swaps.unshift(0); // 0 mean swap
            mutations.push(swaps);
        }

        // splice
        else if (mutation.splice!==undefined) {
            var splice;
            if (isUnaction) {
                splice = (mutation.spliced) ? mutation.spliced.slice(0) : [];
                splice.unshift(mutation.splice[0], mutation.splice.length-2);
            }
            else
                splice = mutation.splice.slice(0);
            
            splice.unshift(1); // 1 mean splice
            mutations.push(splice);
        }

        // set
        else
            mutations.push([1, prop, 1, value]);

        // We have to update the length of the array in case that is lower than before
        if (isUnaction && mutation.length!==undefined && mutation.length!==mutation.object.length)
            action.length = mutation.length;
    }

    // set
    else
        action[prop] = (typeofValue=='object' || typeofValue=='array') ? dop.util.merge(typeofValue=='array'?[]:{},value) : value;
};




//////////  src/core/objects/objectIsStillStoredOnPath.js

dop.core.objectIsStillStoredOnPath = function(object) {

    var path = dop.getObjectDop(object),
        index = path.length-1,
        parent;

    for (;index>0; --index) {
        // parent = (index>1) ? dop.getObjectDop(object)._ : dop.data.object[path[0]];
        if (index>1) {
            parent = dop.getObjectParent(object);
            if (parent[path[index]] !== object)
                return false;
            object = dop.getObjectProxy(parent);
        }
        // else
            // return false;
    }

    return true;
};




//////////  src/core/objects/proxyArrayHandler.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/prototype#Mutator_methods
dop.core.proxyArrayHandler = {
    splice: {value:function() {
        return dop.core.splice(this, Array.prototype.slice.call(arguments,0));
    }},
    shift: {value: function() {
        return dop.core.shift(this, Array.prototype.slice.call(arguments,0));
    }},
    pop: {value:function() {
        return dop.core.pop(this, Array.prototype.slice.call(arguments,0));
    }},
    push: {value:function() {
        return dop.core.push(this, Array.prototype.slice.call(arguments,0));
    }},
    unshift: {value:function() {
        return dop.core.unshift(this, Array.prototype.slice.call(arguments,0));
    }},
    reverse: {value:function() {
        return dop.core.reverse(this);
    }},
    sort: {value:function(compareFunction) {
        return dop.core.sort(this, compareFunction);
    }},
    /*fill: {value:function() {
        return dop.core.fill.apply(this, arguments);
    }},
    copyWithin: {value:function() {
        return dop.core.copyWithin.apply(this, arguments);
    }},*/
};




//////////  src/core/objects/proxyObjectHandler.js

dop.core.proxyObjectHandler = {
    set: function(object, property, value) {
        dop.core.set(dop.getObjectProxy(object), property, value);
        return true;
    },
    deleteProperty: function(object, property) {
        return dop.core.delete(dop.getObjectProxy(object), property) !== undefined;
    },
    /*get: function(object, property) {
        dop.data.lastGet.object = object;
        dop.data.lastGet.property = property;
        return object[property];
    }*/
};





//////////  src/core/objects/setAction.js

dop.core.setAction = function(object, action) {
    dop.util.path({a:action}, null, {a:object}, dop.core.setActionMutator);
    return object;
};




//////////  src/core/objects/setActionFunction.js

dop.core.setActionFunction = function(object, action) {
    dop.util.path({a:action}, null, {a:object}, function(destiny, prop, value, typeofValue, path){
        if (isFunction(value) && value.name==dop.core.createRemoteFunction.name)
            dop.set(destiny, prop, value(dop.getObjectDop(object)[0], path.slice(1)));
        else
            return dop.core.setActionMutator(destiny, prop, value, typeofValue, path);
    });
    return object;
};




//////////  src/core/objects/setActionMutator.js

dop.core.setActionMutator = function(destiny, prop, value, typeofValue, path) {

    // if (path.length > 1) {

        var typeofDestiny = dop.util.typeof(destiny[prop]);

        // Array mutations
        if (typeofValue=='object' && typeofDestiny=='array' && value.hasOwnProperty(dop.cons.DOP)) {

            var mutations = value[dop.cons.DOP],
                mutation,
                index=0,
                total=mutations.length,
                typeArrayMutation;

            // if (typeofDestiny!='array')
            //     dop.set(destiny, prop, []);

            for (;index<total; ++index) {
                typeArrayMutation = mutations[index][0]; // 0=swaps 1=splices
                mutation = mutations[index].slice(1);
                // swap
                if (typeArrayMutation===0) {
                    // mutation = mutation.slice(0);
                    // (mutation[0]<0) ? mutation[0] = mutation[0]*-1 : mutation[1] = mutation[1]*-1;
                    dop.core.swap(destiny[prop], mutation);
                }
                // set
                else {
                    // We have to update the length of the array in case that is lower than before
                    if (destiny[prop].length<mutation[0])
                        dop.getObjectTarget(destiny[prop]).length = mutation[0];
                    // set
                    if (mutation.length===3 && mutation[1]===1) {
                        (mutation[2] === undefined) ?
                            dop.del(destiny[prop], mutation[0])
                        :
                            dop.set(destiny[prop], mutation[0], mutation[2]);
                    }
                    // splice
                    else
                        dop.core.splice(destiny[prop], mutation);
                }
            }

            if (typeof value.length == 'number' && value.length>-1)
                destiny[prop].length = value.length;


            return true; // Skiping to dont go inside of {~dop:...}
        }

        else {

            // Deeply
            if (typeofValue=='object' && !destiny.hasOwnProperty(prop))
                dop.set(destiny, prop, {});

            // Delete
            else if (typeofValue=='undefined')
                dop.del(destiny, prop);

            // Set array and skip path deep
            else if (typeofValue=='array') {
                dop.set(destiny, prop, dop.util.merge([], value));
                return true; // Skiping to dont go inside
            }

            // Set array and skip path deep
            else if (typeofValue=='object' && typeofDestiny!='object' && typeofDestiny!='array') {
                dop.set(destiny, prop, dop.util.merge({}, value));
                return true; // Skiping to dont go inside
            }

            // Set value
            else if (typeofValue!='object')
                dop.set(destiny, prop, value);

        }
    // }
};
// dop.core.setActionLoop = function() {
//     if (prop === dop.cons.DOP)
//         return true;
// };





//////////  src/core/objects/storeMutation.js

dop.core.storeMutation = function(mutation) {

    var collectors = dop.data.collectors,
        index=0, total=collectors.length, index2=0, total2;

    // Storing mutation on the object
    dop.getObjectDop(mutation.object).m.push(mutation);

    // Running collectors
    for (;index<total; index++)
        if (collectors[index].length > 0)
            for (index2=0,total2=collectors[index].length; index2<total2; index2++)
                if (collectors[index][index2].add(mutation))
                    return;

    return dop.emit([mutation]);        
};




//////////  src/core/objects/updatePathArray.js

dop.core.updatePathArray = function (array, newIndex) {
    var item = array[newIndex];
    if (dop.isRegistered(item)) {

        var object_dop = dop.getObjectDop(item),
            index = object_dop.length-1;

        if (object_dop[index] !== newIndex) {
            object_dop[index] = newIndex;

            // Updating neested objects
            dop.util.path(item, function(source, prop, value) {
                if (isObject(value))
                    dop.getObjectDop(value)[index] = newIndex;
            });
        }

    }
    return false;
};





//////////  src/core/protocol/connector.js

dop.core.connector = function(args) {
    var node = new dop.core.node();
    args.unshift(dop, node);
    node.options = args[2];
    node.transport = node.options.transport;
    node.options.transport.apply(this, args);
    return node;
};





//////////  src/core/protocol/createRemoteFunction.js

dop.core.createRemoteFunction = function $DOP_REMOTE_FUNCTION_UNSETUP(node) {
    return function $DOP_REMOTE_FUNCTION_UNSETUP(object_id, path) {
        // // http://jsperf.com/dynamic-name-of-functions
        // return new Function(
        //     "var a=arguments;return function " + path[path.length-1] + "(){return a[0](a[1], a[2], a[3], arguments)}"
        // )(dop.protocol.call, node, object_id, path)
        return function $DOP_REMOTE_FUNCTION() {
            return dop.protocol.call(node, object_id, path, arguments);
        }
    }
};





//////////  src/core/protocol/createRequest.js

dop.core.createRequest = function(node, instruction) {
    var request_id = node.request_inc++,
        request = Array.prototype.slice.call(arguments, 1);

    node.requests[request_id] = request;
    request.unshift(request_id);
    request.promise = dop.createAsync();

    return request;
};




//////////  src/core/protocol/createResponse.js

dop.core.createResponse = function() {
    arguments[0] = arguments[0]*-1;
    return Array.prototype.slice.call(arguments, 0);
};




//////////  src/core/protocol/decode.js
var regexpdate = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\dZ$/,
    regexpsplit = /\/(.+)\/([gimuy]{0,5})/;

dop.core.decode = function(property, value, node, undefineds) {

    if (typeof value == 'string') {

        if (value === '~F')
            return dop.core.createRemoteFunction(node);

        if (value == '~U' && isObject(undefineds)) {
            undefineds.push([this, property]); // http://stackoverflow.com/questions/17648150/how-does-json-parse-manage-undefined
            return undefined;
        }

        if (value === '~I')
            return Infinity;

        if (value === '~i')
            return -Infinity;

        if (value === '~N')
            return NaN;

        if (regexpdate.exec(value))
            return new Date(value);

        if (value.substr(0,2) == '~R') {
            var split = regexpsplit.exec(value.substr(2)); // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/RegExp
            return new RegExp(split[1], split[2]);
        }

        if (value[0] === '~') // https://jsperf.com/charat-vs-index/5
            return value.substring(1);


    }

    return value;

};






//////////  src/core/protocol/deleteRequest.js

dop.core.deleteRequest = function(node, request_id) {
    clearTimeout(node.requests[request_id].timeout);
    delete node.requests[request_id];
};





//////////  src/core/protocol/emitNodes.js

dop.core.emitNodes = function(action) {
    var object_id, node_token, node, object_data;
    for (object_id in action) {
        if (isObject(dop.data.object[object_id])) {
            object_data = dop.data.object[object_id];
            for (node_token in object_data.node) {
                if (object_data.node[node_token].subscriber===1) {
                    node = dop.data.node[node_token];
                    dop.protocol.patch(node, Number(object_id), action[object_id].action);
                }
            }
        }
    }
};




//////////  src/core/protocol/encode.js

dop.core.encode = function(property, value) {

    var tof = typeof value;

    if (tof == 'undefined') // http://stackoverflow.com/questions/17648150/how-does-json-parse-manage-undefined
        return '~U';

    if (tof == 'string' && value[0] == '~')
        return '~'+value;
    
    if (tof == 'number' && isNaN(value))
        return '~N';

    if (tof == 'object' && value instanceof RegExp)
        return '~R' + value.toString();

    if (value === Infinity)
        return '~I';

    if (value === -Infinity)
        return '~i';

    return value;
};


// // Extending example
// var encode = dop.core.encodeUtil;
// dop.core.encodeUtil = function(property, value) {
//     if (typeof value == 'boolean')
//         return '~BOOL';
//     return encode(property, value);
// };






//////////  src/core/protocol/encodeFunction.js

dop.core.encodeFunction = function(property, value) {
    return (isFunction(value) && !dop.isBroadcastFunction(value)) ? '~F' : dop.core.encode(property, value);
};




//////////  src/core/protocol/getRejectError.js

dop.core.getRejectError = function(error) {
    if (typeof error == 'number' && dop.core.error.reject_remote[error] !== undefined) {
        var args = Array.prototype.slice.call(arguments, 1);
        args.unshift(dop.core.error.reject_remote[error]);
        return dop.util.sprintf.apply(this, args);
    }
    return error;  
};




//////////  src/core/protocol/localProcedureCall.js

dop.core.localProcedureCall = function(f, args, resolve, reject, configureReq, scope) {
    var req = dop.createAsync(), output;
    if (isFunction(configureReq))
        req = configureReq(req);

    args.push(req);
    req.then(resolve).catch(reject);
    output = f.apply(scope||req, args);

    // Is sync
    if (output !== req)
        req.resolve(output);
};




//////////  src/core/protocol/multiEncode.js

// dop.core.multiEncode = function() {
//     var encoders = arguments,
//         length = encoders.length, v;
//     return function recursion(property, value, index) {
//         if (index>=length)
//             return value;
//         else if (index === undefined) {
//             v = value;
//             index = 0;
//         }
//         v = encoders[index](property, value);
//         return (v!==value) ? v : recursion(property, value, index+1);
//     }
// };




//////////  src/core/protocol/registerNode.js

dop.core.registerNode = function(node) {
    dop.data.node[node.token] = node;
};




//////////  src/core/protocol/registerObjectToNode.js

dop.core.registerObjectToNode = function(node, object) {

    var object_id = dop.getObjectId(object), object_data;

    if (dop.data.object[object_id] === undefined)
        dop.data.object[object_id] = {
            object: object,
            nodes_total: 0,
            node: {}
        };
    
    object_data = dop.data.object[object_id];

    if (object_data.node[node.token] === undefined) {
        object_data.nodes_total += 1;
        object_data.node[node.token] = {
            subscriber: 0, // 0 or 1 || false true 
            owner: 0, // object_id_owner || 0 === false
            version: 0, // incremental integer for new patches
            pending: [],
            applied_version: 0, // last patch version applied correctly
            applied: {}
        };
    }

    return object_data;
};




//////////  src/core/protocol/registerOwner.js

dop.core.registerOwner = function(node, object, object_owner_id) {
    var object_data = dop.core.registerObjectToNode(node, object),
        object_id = dop.getObjectId(object_data.object);
    object_data.node[node.token].owner = object_owner_id;
    node.owner[object_owner_id] = object_id;
};




//////////  src/core/protocol/registerSubscriber.js

dop.core.registerSubscriber = function(node, object) {
    var object_data = dop.core.registerObjectToNode(node, object),
        object_id = dop.getObjectId(object_data.object);
    node.subscriber[object_id] = true;
    if (object_data.node[node.token].subscriber)
        return false;
    else {
        object_data.node[node.token].subscriber = 1;
        return true;
    }
};




//////////  src/core/protocol/sendMessages.js

dop.core.sendMessages = function(node) {
    var total = node.message_queue.length;
    if (total>0 && node.connected) {
        var index = 0,
            messages_wrapped = [],
            message_string,
            message,
            request_id;
        
        for (;index<total; ++index) {
            message = node.message_queue[index][0];
            messages_wrapped.push( node.message_queue[index][1](message) );
            request_id = message[0]
            // If is a request (not a response) we set a timeout
            if (request_id>0) {
                var nameinstruction = dop.protocol.instructions[message[1]];
                message.timeout = setTimeout(function() {
                    // if (node.requests[request_id] !== undefined) {
                        dop.protocol['on'+nameinstruction+'timeout'](node, request_id, message);
                        delete node.requests[request_id];
                    // }
                }, dop.protocol.timeouts[nameinstruction]);
            }
        }

        
        message_string = (index>1) ? '['+messages_wrapped.join(',')+']' : messages_wrapped[0];

        node.message_queue = [];
        node.send(message_string);
    }
};




//////////  src/core/protocol/setSocketToNode.js

dop.core.setSocketToNode = function(node, socket) {
    node.socket = socket;
    socket[dop.cons.TOKEN] = node.token;
};




//////////  src/core/protocol/storeMessage.js

dop.core.storeMessage = function(node, message, wrapper) {
    if (typeof wrapper != 'function')
        wrapper = dop.encode;
    node.message_queue.push([message, wrapper]);
};




//////////  src/core/protocol/storeSendMessages.js

dop.core.storeSendMessages = function(node, message, wrapper) {
    dop.core.storeMessage(node, message, wrapper);
    dop.core.sendMessages(node);
};




//////////  src/core/protocol/unregisterNode.js

dop.core.unregisterNode = function(node) {
    var object_id, object_owner_id, object_data;
    // Removing subscriber objects
    for (object_id in node.subscriber) {
        object_data = dop.data.object[object_id];
        if (object_data !== undefined && object_data.node[node.token] !== undefined) {
            object_data.nodes_total -= 1;
            delete object_data.node[node.token];
        }
    }
    // Removing owner objects
    for (object_owner_id in node.owner) {
        object_id = node.owner[object_owner_id];
        object_data = dop.data.object[object_id];
        if (object_data !== undefined && object_data.node[node.token] !== undefined) {
            object_data.nodes_total -= 1;
            delete object_data.node[node.token];
        }
    }
    // Deleting object data if not more nodes are depending
    if (object_data!==undefined && object_data.nodes_total === 0)
        delete dop.data.object[object_id];
    delete dop.data.node[node.token];
};




//////////  src/protocol/_onbroadcast.js

dop.protocol._onbroadcast = function(node, request_id, request, response) {
    dop.protocol._oncall(node, request_id, request, response);
};




//////////  src/protocol/_oncall.js

dop.protocol._oncall = function(node, request_id, request, response) {
    var rejection = response[0],
        promise = request.promise;
    if (rejection !== undefined) {
        if (rejection === 0)
            promise.resolve(response[1]);
        else if (rejection===dop.core.error.reject_remote.CUSTOM_REJECTION)
            promise.reject(response[1]);
        else
            promise.reject(dop.core.getRejectError(rejection));
    }
};




//////////  src/protocol/_onpatch.js

dop.protocol._onpatch = function(node, request_id, request, response) {
    var rejection = response[0],
        object_id = request[2],
        object_node = dop.data.object[object_id].node[node.token],
        version = request[3],
        pending_list = object_node.pending,
        promise = request.promise,
        index = 0,
        total = pending_list.length,
        version_item;


    if (rejection !== undefined) {
        if (rejection === 0) {
            for (;index<total; index++) {
                version_item = pending_list[index][0];
                // Removing from pending because its been received correctly
                if (version_item >= version) {
                    if (version_item === version)
                        pending_list.splice(index, 1);
                    break;
                }
                // Resending
                else
                    dop.protocol.patchSend(node, object_id, version_item, pending_list[index][1]);
            }
            promise.resolve(response[1]);
        }
        else
            promise.reject(dop.core.getRejectError(rejection));
    }
};




//////////  src/protocol/_onsubscribe.js

dop.protocol._onsubscribe = function(node, request_id, request, response) {

    if (response[0] !== undefined) {

        if (response[0] !== 0)
            request.promise.reject(dop.core.getRejectError(response[0]));

        else {
            var object_path = typeof response[1]=='number' ? [response[1]] : response[1],
                object_owner_id = object_path[0],
                object_owner = response[2],
                object, collector;
            
            if (!isArray(object_path) || typeof object_owner_id!='number')
                request.promise.reject(dop.core.error.reject_local.OBJECT_NOT_FOUND);

            else {
                if (node.owner[object_owner_id] === undefined) {
                    collector = dop.collectFirst();
                    if (dop.isRegistered(request.into))
                        object = dop.core.setActionFunction(request.into, object_owner);
                    else
                        object = dop.register((request.into===undefined) ? 
                            object_owner
                        :
                            dop.core.setAction(request.into, object_owner)
                        );
                    dop.core.registerOwner(node, object, object_owner_id);
                    collector.emitAndDestroy();
                }
                else
                    object = dop.data.object[node.owner[object_owner_id]].object;

                object = dop.util.get(object, object_path.slice(1));

                if (!isObject(object))
                    request.promise.reject(dop.core.error.reject_local.OBJECT_NOT_FOUND);
                else
                    request.promise.resolve(dop.getObjectProxy(object));
            }
        }
    }
};




//////////  src/protocol/_onunsubscribe.js

dop.protocol._onunsubscribe = function(node, request_id, request, response) {

    if (response[0] !== undefined) {
        if (response[0] !== 0)
            request.promise.reject(response[0]);
        else {
            var object_owner_id = request[2],
                object_id = node.owner[object_owner_id],
                object_data = dop.data.object[object_id];

            if (isObject(object_data) && isObject(object_data.node[node.token]) && object_data.node[node.token].owner===object_owner_id) {
                var roles = object_data.node[node.token];
                roles.owner = 0;

                if (roles.subscriber === 0)
                    object_data.nodes_total -= 1;

                if (object_data.nodes_total === 0)
                    delete dop.data.object[object_id];
                
                request.promise.resolve();
            }
        }
    }
};




//////////  src/protocol/broadcast.js

dop.protocol.broadcast = function(object_id, path, params) {

    var object_data = dop.data.object[object_id],
        promises = [];

    if (isObject(object_data) && isObject(object_data.node)) {
        var token, node, request, 
            nodes = object_data.node;
        params = Array.prototype.slice.call(params, 0);
        for (token in nodes) {
            if (nodes[token].subscriber === 1) {
                node = dop.data.node[token];
                request = dop.core.createRequest(
                    node,
                    dop.protocol.instructions.broadcast,
                    object_id,
                    path,
                    params
                );
                request.promise.node = node;
                dop.core.storeSendMessages(node, request);
                promises.push(request.promise);
            }
        }
    }
    
    return promises;
};




//////////  src/protocol/call.js

dop.protocol.call = function(node, object_id, path, params) {

    var object_data = dop.data.object[object_id];

    if (isObject(object_data) && isObject(object_data.node[node.token]) && object_data.node[node.token].owner>0) {
        params = Array.prototype.slice.call(params, 0);
        var request = dop.core.createRequest(
            node,
            dop.protocol.instructions.call,
            object_data.node[node.token].owner,
            path,
            params
        );
        dop.core.storeSendMessages(node, request);
        return request.promise;
    }
    else
        return Promise.reject(dop.core.error.reject_local.NODE_NOT_FOUND);
};




//////////  src/protocol/instructions.js

dop.protocol.instructions = {


    // [<request_id>, <instruction>, <params...>]
    // If <request_id> it's greater than 0 is a request, if is less than 0 then is the response of the request.

    // Is possible send multiple requests in one message, just wrapping it in an Array. But the order of the responses is not determined. Which means the response of request_idTwo could be resolved before request_idOne
    // [[<request_id1>, <instruction>, <params...>], [<request_id2>, <instruction>, <params...>]]

    // Is possible send one request with multiple instructions. The response will be recieved when all the requests are resolved. The response could be only one. But if the response is multiple has to respect the order
    // [<request_id>, [<instruction>, <params...>], [<instruction>, <params...>]]

    // If the response has a 0 as second parameter, means the response it's fulfilled. Any other value is an error
    // [-1234, 0, <params...>]

    // Also the error response could be custom as string
    // [-1234, 'My custom message error']

    // Response with instructions, if the second parameter of the response is an array it means is an instruction that could be (set, delete or merge)
    // [-<request_id>, [<instruction>, <params...>], [<instruction>, <params...>]]

    // Sending the same request without parameters means a cancel/abort of the request
    // [1234]

                        // Subscriptor -> Owner
    subscribe: 1,       // [ 1234, <instruction>, <params...>]
                        // [-1234, 0, <object_id>, <data_object>]
                        // [-1234, 0, [<object_id>, 'path']]

                        // Subscriptor -> Owner
    unsubscribe: 2,     // [ 1234, <instruction>, <object_id>]
                        // [-1234, 0]

                        // Subscriptor -> Owner
    call: 3,            // [ 1234, <instruction>, <object_id>, ['path','path'], [<params...>]]
                        // [-1234, 0, <return>]

                        // Owner -> Subscriptor
    broadcast: 4,       // [ 1234, <instruction>, <object_id>, ['path','path'], [<params...>]]
                        // [-1234, 0, <return>]

                        // Owner -> Subscriptor
    patch: 5,           // [ 1234, <instruction>, <object_id>, <version>, <patch>]
                        // [-1234, 0]
};

for (var instruction in dop.protocol.instructions)
    dop.protocol.instructions[ dop.protocol.instructions[instruction] ] = instruction;





//////////  src/protocol/onbroadcast.js

dop.protocol.onbroadcast = function(node, request_id, request) {
    dop.protocol.onfunction(node, request_id, request, node.owner[request[1]], function(permission) {
        return permission.owner===request[1];
    });
};




//////////  src/protocol/oncall.js

dop.protocol.oncall = function(node, request_id, request) {
    dop.protocol.onfunction(node, request_id, request, request[1], function(permission) {
        return permission.subscriber===1;
    });
}




//////////  src/protocol/onfunction.js
// Used by dop.protocol.oncall && dop.protocol.onbroadcast
dop.protocol.onfunction = function(node, request_id, request, object_id, validator) {
    var path = request[2],
        params = request[3],
        object_data = dop.data.object[object_id];

    if (isObject(object_data) && isObject(object_data.node[node.token]) && validator(object_data.node[node.token])) {
        var functionName = path.pop(),
            object = dop.util.get(object_data.object, path),
            f = object[functionName];
        if (isFunction(f) && !dop.isBroadcastFunction(f)) {
            function resolve(value) {
                var response = dop.core.createResponse(request_id, 0);
                if (value !== undefined)
                    response.push(value);
                dop.core.storeSendMessages(node, response);
                return value;
            }
            function reject(err){
                dop.core.storeSendMessages(node, dop.core.createResponse(request_id, dop.core.error.reject_remote.CUSTOM_REJECTION, err));
            }

            if (dop.isRemoteFunction(f))
                f.apply(null, params).then(resolve).catch(reject);
            else
                dop.core.localProcedureCall(f, params, resolve, reject, function(req) {
                    req.node = node;
                    return req;
                }, object);

            return;
        }
    }
    
    dop.core.storeSendMessages(node, dop.core.createResponse(request_id, dop.core.error.reject_remote.FUNCTION_NOT_FOUND));
};




//////////  src/protocol/onpatch.js

dop.protocol.onpatch = function(node, request_id, request) {
    var object_id_owner = request[1],
        object_id = node.owner[object_id_owner],
        version = request[2],
        patch = request[3],
        response = dop.core.createResponse(request_id),
        object_data = dop.data.object[object_id],
        object_node,
        collector;
    
    if (isObject(object_data) && isObject(object_data.node[node.token]) && object_data.node[node.token].owner===object_id_owner) {
        object_node = object_data.node[node.token];
        // Storing patch
        if (object_node.applied_version < version && object_node.applied[version]===undefined) {
            // Storing patch
            object_node.applied[version] = patch;
            // Applying
            collector = dop.collectFirst();
            while (object_node.applied[object_node.applied_version+1]) {
                object_node.applied_version += 1;
                dop.core.setActionFunction(object_data.object, object_node.applied[object_node.applied_version]);
                delete object_node.applied[object_node.applied_version];
            }
            collector.emitAndDestroy();
        }
        response.push(0);
    }
    else
        response.push(dop.core.error.reject_remote.OBJECT_NOT_FOUND);
    
    dop.core.storeSendMessages(node, response);
};




//////////  src/protocol/onpatchtimeout.js

dop.protocol.onpatchtimeout = function(node, request_id, request) {
    dop.protocol.patchSend(node, request[2], request[3], request[4]);
};




//////////  src/protocol/onsubscribe.js

dop.protocol.onsubscribe = function(node, request_id, request) {

    if (isFunction(dop.data.onsubscribe)) {

        var params = Array.prototype.slice.call(request, 1);

        dop.core.localProcedureCall(dop.data.onsubscribe, params, function resolve(value) {
            if (isObject(value)) {
                var object = dop.register(value),
                    object_id = dop.getObjectId(object),
                    object_root = dop.getObjectRoot(object),
                    object_dop = dop.getObjectDop(object),
                    response = dop.core.createResponse(request_id, 0, object_dop.length==1 ? object_dop[0] : object_dop);

                if (dop.core.registerSubscriber(node, object_root))
                    response.push(object_root);
                dop.core.storeSendMessages(node, response, dop.encodeFunction);
                return object;
            }
            else if (value === undefined)
                return Promise.reject(dop.core.error.reject_remote.OBJECT_NOT_FOUND);
            else
                // http://www.2ality.com/2016/03/promise-rejections-vs-exceptions.html
                // http://stackoverflow.com/questions/41254636/catch-an-error-inside-of-promise-resolver
                dop.util.invariant(false, 'dop.onsubscribe callback must return or resolve a regular object');


        }, reject, function(req) {
            req.node = node;
            return req;
        });

    }
    else
        reject(dop.core.error.reject_remote.OBJECT_NOT_FOUND);

    function reject(error) {
        var response = dop.core.createResponse(request_id);
        (error instanceof Error) ? console.log(error.stack) : response.push(error);
        dop.core.storeSendMessages(node, response, JSON.stringify);
    }
};




//////////  src/protocol/ontimeout.js
dop.protocol.onsubscribetimeout = 
dop.protocol.onunsubscribetimeout = 
dop.protocol.oncalltimeout = 
dop.protocol.onbroadcasttimeout = function(node, request_id, request) {
    request.promise.reject(dop.core.error.reject_local.TIMEOUT_REQUEST);
};




//////////  src/protocol/onunsubscribe.js

dop.protocol.onunsubscribe = function(node, request_id, request) {
    var object_id = request[1],
        object_data = dop.data.object[object_id],
        response = dop.core.createResponse(request_id);

    if (isObject(object_data) && isObject(object_data.node[node.token]) && object_data.node[node.token].subscriber) {
        
        var roles = object_data.node[node.token];
        roles.subscriber = 0;

        if (roles.owner === 0)
            object_data.nodes_total -= 1;

        if (object_data.nodes_total === 0)
            delete dop.data.object[object_id];

        response.push(0);
    }
    else
        response.push(dop.core.error.reject_remote.SUBSCRIPTION_NOT_FOUND);

    dop.core.storeSendMessages(node, response);
};




//////////  src/protocol/patch.js

dop.protocol.patch = function(node, object_id, patch) {
    var object_node = dop.data.object[object_id].node[node.token],
        version = ++object_node.version;
    object_node.pending.push([version, dop.util.merge({}, patch)]); // Making a copy because this object is exposed to the api users and can be mutated
    return dop.protocol.patchSend(node, object_id, version, patch);
};

// Also used by dop.protocol._onpatch
dop.protocol.patchSend = function(node, object_id, version, patch) {
    var request = dop.core.createRequest( node, dop.protocol.instructions.patch, object_id, version, patch);
    dop.core.storeSendMessages(node, request, dop.encodeFunction);
    return request.promise;
};




//////////  src/protocol/subscribe.js

dop.protocol.subscribe = function(node, params) {
    params = Array.prototype.slice.call(params, 0);
    params.unshift(node, dop.protocol.instructions.subscribe);
    var request = dop.core.createRequest.apply(node, params);
    request.promise.into = function(object) {
        if (dop.isObjectRegistrable(object))
            request.into = (dop.isRegistered(object)) ? dop.getObjectProxy(object) : object;
        return request.promise;
    };
    dop.core.storeSendMessages(node, request);
    return request.promise;
};




//////////  src/protocol/timeouts.js
// Default timeouts
dop.protocol.timeouts = {
    subscribe: 5000,
    unsubscribe: 5000,
    call: 10000,  
    broadcast: 10000,
    patch: 1000    
};




//////////  src/protocol/unsubscribe.js

dop.protocol.unsubscribe = function(node, object) {
    var object_id = dop.getObjectId(object),
        object_data = dop.data.object[object_id];

    if (isObject(object_data) && isObject(object_data.node[node.token]) && object_data.node[node.token].owner>0) {
        var request = dop.core.createRequest(
            node,
            dop.protocol.instructions.unsubscribe,
            object_data.node[node.token].owner
        );
        dop.core.storeSendMessages(node, request);
        return request.promise;
    }
    else
        return Promise.reject(dop.core.error.reject_remote[2]);
};





//////////  src/umd.js
// Factory
if (root === undefined)
    return dop;

// AMD
if (typeof define === 'function' && define.amd)
    define([], function() { return dop });

// Node
else if (typeof module == 'object' && module.exports)
    module.exports = dop;

// Browser
else if (typeof window == 'object' && window)
    window.dop = dop;

else
    root.dop = dop;

})(this);


