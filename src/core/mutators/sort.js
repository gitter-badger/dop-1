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