
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