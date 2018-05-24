const debug = require('debug')('libp2p:rpc')
const libp2p = require('libp2p')
const spdy = require('libp2p-spdy')
const secio = require('libp2p-secio')
const pull = require('pull-stream')
const lp = require('pull-length-prefixed')
const protobuf = require('protobufjs')
const fs = require('fs')
const uuid = require('uuid')

const MulticastDNS = require('libp2p-mdns')
const DHT = require('libp2p-kad-dht')
const Railing = require('libp2p-railing')
const PeerInfo = require('peer-info')
const Pushable = require('pull-pushable')
const PeerBook = require('peer-book')
const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')

class Node extends libp2p {
    constructor(peerInfo, root, options) {

        options = Object.assign({
            name: 'libp2p-rpc',
            version: '1.0.0',
            service: 'Protocol',
            bootstrapers: [],
            multicastDNS: {
                interval: 10000   
            }
        }, options)

        const modules = {
            transport: [
                new TCP(),
                new WS()
            ],
            connection: {
                muxer: [
                    spdy
                ],
                crypto: [
                    secio
                ]
            },
            discovery: [
                new Railing(options.bootstrapers),
                new MulticastDNS(peerInfo, options.multicastDNS || {})
            ],
            dht: DHT
        }

        const peerBook = new PeerBook()

        peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0')
        peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0/ws')

        super(modules, peerInfo, peerBook, options)
        this._options = options
        this._handlers = {}
        this._requests = {}
        this._root = root 
        this._protocol = undefined 
        this._packet = undefined 
    }

    start() {
        return new Promise((resolve, reject) => {
            super.start((err) => {
                if (err) {
                    debug('error starting node', err)
                    return reject(err)
                }
    
                this._protocol = this._root[this._options.service]
                this._packet = new protobuf.Type('Packet')
                    .add(new protobuf.Field('key', 1, 'string'))
                    .add(new protobuf.Field('method', 2, 'string'))
                    .add(new protobuf.Field('type', 3, 'string'))
                    .add(new protobuf.Field('dataType', 4, 'string'))

                let index = 5;

                for(var key in this._root) {
                    if (!(this._root[key] instanceof protobuf.Type)) 
                        continue;

                    this._packet = this._packet.add(new protobuf.Field(key, index, key))
                    index++
                }

                this._root = this._root.add(this._packet);

                debug('node listening on:')
                this.peerInfo.multiaddrs.forEach((item) => debug(item.toString()))
    
                debug('methods:', Object.keys(this._protocol.methods))

                this.on('peer:discovery', (peer) => {
                    if (this.peerBook.has(peer)) return
    
                    debug('peer discovered:', peer.id.toB58String())
    
                    this.dialProtocol(peer, `/${this._options.name}/${this._options.version}`, (err, conn) => {
                        if( err ) debug('error during dialProtocol', err)
                        else return this._connection(conn, peer, 'outgoing')
                    })
                })
    
                this.on('peer:connect', (peer) => debug('peer connection:', peer.id.toB58String()))
                super.handle(`/${this._options.name}/${this._options.version}`, (protocol, conn) => {
                    return this._connection(conn, null, 'incoming')
                })

                resolve()
            })
        })
    }

    handle(method, handler) {
        this._handlers[method] = handler
    }

    _connection(conn, peer, type) {
        try {
            let push = Pushable((err) => {
                if (err) debug('push stream error', err)  
            })
    
            let send = (message) => {
                debug('sending', message)
                push.push(this._packet.encode(message).finish())
            }
    
            pull(
                push,
                lp.encode(),
                conn
            )
    
            pull(
                conn,
                lp.decode(),
                pull.map((message) => this._packet.decode(message)),
                pull.map((message) => this._query(message, peer, send)),
                pull.drain()
            )
        
            if (peer) {
                peer.rpc = this._rpc(send)
                this.emit('peer:connection', conn, peer, type)
            }   
        } catch(error) {
            debug('socket error', error)
        }
    }

    _query(message, peer, send) {
        debug('received', message)

        if (message.type == 'res')
            return this._response(message, peer)
        else
            return this._request(message, peer, send)
    }

    _response(response, peer) {
        if (!response.key || !this._requests[response.key])
            return debug('invalid response', response)
        
        return this._requests[response.key](response[this._protocol.methods[response.method].responseType], peer);
    }

    _request(request, peer, response) {
        if (!this._handlers[request.method]) return debug('invalid request', request)
        
        return this._handlers[request.method](request[request.dataType], peer, (res) => {
            let packet = {}
            packet.key = request.key
            packet.method = request.method
            packet.type = 'res'
            packet.dataType = this._protocol.methods[request.method].responseType
            packet[packet.dataType] = res
            response(packet)
        })
    }

    _rpc(send) {
        return this._protocol.create((method, requestData, callback) => {
            debug('rpc call', requestData)
            let packet = {}
            packet.key = uuid()
            packet.method = method.name
            packet.type = 'req'
            packet.dataType = this._protocol.methods[method.name].requestType
            packet[packet.dataType] = this._root.lookupType(packet.dataType).decode(requestData)
            send(packet)
            this._requests[packet.key] = callback
        }, false, false)
    }
}

module.exports = Node