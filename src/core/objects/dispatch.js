
dop.dispatch = function() {
    var args=arguments, total=args.length;
    for ( var index=0, object_id; index<total; ++index ) {
        object_id = dop.getObjectId(args[index]);
        if (dop.isRegistered(args[index])) {
            dop.data.object[object_id].collecting = false;
            dop.core.emitMutations(object_id);
        }
    }
};