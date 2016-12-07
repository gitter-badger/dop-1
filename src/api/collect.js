
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