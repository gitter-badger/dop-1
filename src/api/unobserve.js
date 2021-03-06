
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