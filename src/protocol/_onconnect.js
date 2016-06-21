

dop.protocol._onconnect = function ( node, request_id, request, response ) {

    var token = request[2];

    // Node is connected correctly
    if ( response[0]===0 ) {
        node.is_connected = true;
        node.listener.emit('connect', node, token);
        node.emit('connect', token);
    }

    // Resending token
    else if ( node.try_connects-- > 0 ) {
        delete dop.node[token];
        dop.protocol.connect( node );
    }

    // We disconnect the node because is rejecting too many times the token assigned
    else {
        delete dop.node[token];
        node.listener.emit('warning', dop.core.error.warning.TOKEN_REJECTED);
        node.socket.close();
    }

};