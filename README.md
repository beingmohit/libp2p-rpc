# libp2p-rpc

libp2p-rpc provides peer to peer RPC built on top of [`LibP2P`](https://github.com/libp2p/js-libp2p/). It takes care of everything you need to do to build peer 2 peer application, from peer discovery to protocol handshake. Simply define your protocol in protocol buffers .proto file and get started. 

libp2p-rpc is essentially a [`libp2p-node`](https://github.com/libp2p/js-libp2p/). It connects to peers on tcp and websocket, discovers peers by railing and multicast dns. Then it establishes end to end encrypted connection with peers and does protocol handshake. [`Protocol Buffers`](https://developers.google.com/protocol-buffers/) is used for serialization & messsage validation.

#### Install
```
npm install libp2p-rpc --save
```
#### Getting Started

Define your RPC protocol in .proto file. Checkout [`Protocol Buffers`](https://developers.google.com/protocol-buffers/)  for more info.
```
syntax = "proto3";

service Protocol {
    rpc sayHello (HelloRequest) returns (HelloReply) {}
}

message HelloRequest {
    string name = 1;
}

message HelloReply {
    string message = 1;
}
```

Javascript Code

```
const fs = require('fs')
const path = require('path')
const protobuf = require('protobufjs')
const PeerInfo = require('peer-info')
const Node = require('libp2p-rpc')

const config = {
    name: 'your-protocol-name',  // Protocol name used for handshake
    version: '1.0.0',            // Protocol version used for handshake
    service: 'Protocol',         // Name of service in .proto file
    bootstrapers: [],            // Bootstrapping nodes 
    multicastDNS: {  
        // multicastDNS options
        interval: 1000   
    }
}

// PeerInfo creates public-private keypair used for connection encryption and peer identity.
PeerInfo.create((err, peerInfo) => {
    if (err) 
        throw new Error(err)
    
    // Load your .proto file
    protobuf.load(path.join(__dirname, './protocol.proto')).then((root) => {
    
        // Create Node
        const node = new Node(peerInfo, root, config)
        
        // Event fires when a peer connects
        node.on('peer:connection', (conn, peer, type) => {
            console.log('peer:connection')
    
            // Make RPC call to peer
            peer.rpc.sayHello({name: 'Foo'}, (response, peer) => {
                console.log('Response', response)
            })
        })
        
        // Define RPC handlers
        node.handle('sayHello', (message, peer, respond) => {
            console.log('Request', message)
            respond({ message: 'heyThere' })
        })
        
        // Lets starts node
        node.start().then(console.log, console.error) 
        
    }, console.error)
})
```

Checkout [`https://github.com/libp2p/js-libp2p/`](https://github.com/libp2p/js-libp2p/) for more into
### LibP2P Modules Used

| Package |
|---------|
| **Transports**|
| [`libp2p-tcp`](//github.com/libp2p/js-libp2p-tcp) | 
| [`libp2p-websockets`](//github.com/libp2p/js-libp2p-websockets) | 
| **Stream Muxers**|
| [`libp2p-spdy`](//github.com/libp2p/js-libp2p-spdy) | 
| **Discovery**|
| [`libp2p-mdns-discovery`](//github.com/libp2p/js-libp2p-mdns-discovery) | 
| [`libp2p-railing`](//github.com/libp2p/js-libp2p-railing) | 
| **Crypto Channels** |
| [`libp2p-secio`](//github.com/libp2p/js-libp2p-secio) | 
| **Peer & Content Routing** |
| [`libp2p-kad-dht`](//github.com/libp2p/js-libp2p-kad-dht) | 

### Contributions

All contributions are welcome. Create Issue, Discuss, Submit PR.
