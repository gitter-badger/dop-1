
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