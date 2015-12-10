window.___browserSync___oldSocketIo = window.io;
! function(e) {
    if ("object" == typeof exports && "undefined" != typeof module) module.exports = e();
    else {
        var f;
        "undefined" != typeof window ? f = window : "undefined" != typeof global ? f = global : "undefined" != typeof self && (f = self), f.io = e()
    }
}(function() {
    var define, module, exports;
    return function e(t, n, r) {
        function s(o, u) {
            if (!n[o]) {
                if (!t[o]) {
                    var a = typeof require == "function" && require;
                    if (!u && a) return a(o, !0);
                    if (i) return i(o, !0);
                    throw new Error("Cannot find module '" + o + "'")
                }
                var f = n[o] = {
                    exports: {}
                };
                t[o][0].call(f.exports, function(e) {
                    var n = t[o][1][e];
                    return s(n ? n : e)
                }, f, f.exports, e, t, n, r)
            }
            return n[o].exports
        }
        var i = typeof require == "function" && require;
        for (var o = 0; o < r.length; o++) s(r[o]);
        return s
    }({
        1: [function(_dereq_, module, exports) {
            module.exports = _dereq_("./lib/")
        }, {
            "./lib/": 2
        }],
        2: [function(_dereq_, module, exports) {
            var url = _dereq_("./url");
            var parser = _dereq_("socket.io-parser");
            var Manager = _dereq_("./manager");
            var debug = _dereq_("debug")("socket.io-client");
            module.exports = exports = lookup;
            var cache = exports.managers = {};

            function lookup(uri, opts) {
                if (typeof uri == "object") {
                    opts = uri;
                    uri = undefined
                }
                opts = opts || {};
                var parsed = url(uri);
                var source = parsed.source;
                var id = parsed.id;
                var io;
                if (opts.forceNew || opts["force new connection"] || false === opts.multiplex) {
                    debug("ignoring socket cache for %s", source);
                    io = Manager(source, opts)
                } else {
                    if (!cache[id]) {
                        debug("new io instance for %s", source);
                        cache[id] = Manager(source, opts)
                    }
                    io = cache[id]
                }
                return io.socket(parsed.path)
            }
            exports.protocol = parser.protocol;
            exports.connect = lookup;
            exports.Manager = _dereq_("./manager");
            exports.Socket = _dereq_("./socket")
        }, {
            "./manager": 3,
            "./socket": 5,
            "./url": 6,
            debug: 10,
            "socket.io-parser": 44
        }],
        3: [function(_dereq_, module, exports) {
            var url = _dereq_("./url");
            var eio = _dereq_("engine.io-client");
            var Socket = _dereq_("./socket");
            var Emitter = _dereq_("component-emitter");
            var parser = _dereq_("socket.io-parser");
            var on = _dereq_("./on");
            var bind = _dereq_("component-bind");
            var object = _dereq_("object-component");
            var debug = _dereq_("debug")("socket.io-client:manager");
            var indexOf = _dereq_("indexof");
            var Backoff = _dereq_("backo2");
            module.exports = Manager;

            function Manager(uri, opts) {
                if (!(this instanceof Manager)) return new Manager(uri, opts);
                if (uri && "object" == typeof uri) {
                    opts = uri;
                    uri = undefined
                }
                opts = opts || {};
                opts.path = opts.path || "/socket.io";
                this.nsps = {};
                this.subs = [];
                this.opts = opts;
                this.reconnection(opts.reconnection !== false);
                this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
                this.reconnectionDelay(opts.reconnectionDelay || 1e3);
                this.reconnectionDelayMax(opts.reconnectionDelayMax || 5e3);
                this.randomizationFactor(opts.randomizationFactor || .5);
                this.backoff = new Backoff({
                    min: this.reconnectionDelay(),
                    max: this.reconnectionDelayMax(),
                    jitter: this.randomizationFactor()
                });
                this.timeout(null == opts.timeout ? 2e4 : opts.timeout);
                this.readyState = "closed";
                this.uri = uri;
                this.connected = [];
                this.encoding = false;
                this.packetBuffer = [];
                this.encoder = new parser.Encoder;
                this.decoder = new parser.Decoder;
                this.autoConnect = opts.autoConnect !== false;
                if (this.autoConnect) this.open()
            }
            Manager.prototype.emitAll = function() {
                this.emit.apply(this, arguments);
                for (var nsp in this.nsps) {
                    this.nsps[nsp].emit.apply(this.nsps[nsp], arguments)
                }
            };
            Manager.prototype.updateSocketIds = function() {
                for (var nsp in this.nsps) {
                    this.nsps[nsp].id = this.engine.id
                }
            };
            Emitter(Manager.prototype);
            Manager.prototype.reconnection = function(v) {
                if (!arguments.length) return this._reconnection;
                this._reconnection = !!v;
                return this
            };
            Manager.prototype.reconnectionAttempts = function(v) {
                if (!arguments.length) return this._reconnectionAttempts;
                this._reconnectionAttempts = v;
                return this
            };
            Manager.prototype.reconnectionDelay = function(v) {
                if (!arguments.length) return this._reconnectionDelay;
                this._reconnectionDelay = v;
                this.backoff && this.backoff.setMin(v);
                return this
            };
            Manager.prototype.randomizationFactor = function(v) {
                if (!arguments.length) return this._randomizationFactor;
                this._randomizationFactor = v;
                this.backoff && this.backoff.setJitter(v);
                return this
            };
            Manager.prototype.reconnectionDelayMax = function(v) {
                if (!arguments.length) return this._reconnectionDelayMax;
                this._reconnectionDelayMax = v;
                this.backoff && this.backoff.setMax(v);
                return this
            };
            Manager.prototype.timeout = function(v) {
                if (!arguments.length) return this._timeout;
                this._timeout = v;
                return this
            };
            Manager.prototype.maybeReconnectOnOpen = function() {
                if (!this.reconnecting && this._reconnection && this.backoff.attempts === 0) {
                    this.reconnect()
                }
            };
            Manager.prototype.open = Manager.prototype.connect = function(fn) {
                debug("readyState %s", this.readyState);
                if (~this.readyState.indexOf("open")) return this;
                debug("opening %s", this.uri);
                this.engine = eio(this.uri, this.opts);
                var socket = this.engine;
                var self = this;
                this.readyState = "opening";
                this.skipReconnect = false;
                var openSub = on(socket, "open", function() {
                    self.onopen();
                    fn && fn()
                });
                var errorSub = on(socket, "error", function(data) {
                    debug("connect_error");
                    self.cleanup();
                    self.readyState = "closed";
                    self.emitAll("connect_error", data);
                    if (fn) {
                        var err = new Error("Connection error");
                        err.data = data;
                        fn(err)
                    } else {
                        self.maybeReconnectOnOpen()
                    }
                });
                if (false !== this._timeout) {
                    var timeout = this._timeout;
                    debug("connect attempt will timeout after %d", timeout);
                    var timer = setTimeout(function() {
                        debug("connect attempt timed out after %d", timeout);
                        openSub.destroy();
                        socket.close();
                        socket.emit("error", "timeout");
                        self.emitAll("connect_timeout", timeout)
                    }, timeout);
                    this.subs.push({
                        destroy: function() {
                            clearTimeout(timer)
                        }
                    })
                }
                this.subs.push(openSub);
                this.subs.push(errorSub);
                return this
            };
            Manager.prototype.onopen = function() {
                debug("open");
                this.cleanup();
                this.readyState = "open";
                this.emit("open");
                var socket = this.engine;
                this.subs.push(on(socket, "data", bind(this, "ondata")));
                this.subs.push(on(this.decoder, "decoded", bind(this, "ondecoded")));
                this.subs.push(on(socket, "error", bind(this, "onerror")));
                this.subs.push(on(socket, "close", bind(this, "onclose")))
            };
            Manager.prototype.ondata = function(data) {
                this.decoder.add(data)
            };
            Manager.prototype.ondecoded = function(packet) {
                this.emit("packet", packet)
            };
            Manager.prototype.onerror = function(err) {
                debug("error", err);
                this.emitAll("error", err)
            };
            Manager.prototype.socket = function(nsp) {
                var socket = this.nsps[nsp];
                if (!socket) {
                    socket = new Socket(this, nsp);
                    this.nsps[nsp] = socket;
                    var self = this;
                    socket.on("connect", function() {
                        socket.id = self.engine.id;
                        if (!~indexOf(self.connected, socket)) {
                            self.connected.push(socket)
                        }
                    })
                }
                return socket
            };
            Manager.prototype.destroy = function(socket) {
                var index = indexOf(this.connected, socket);
                if (~index) this.connected.splice(index, 1);
                if (this.connected.length) return;
                this.close()
            };
            Manager.prototype.packet = function(packet) {
                debug("writing packet %j", packet);
                var self = this;
                if (!self.encoding) {
                    self.encoding = true;
                    this.encoder.encode(packet, function(encodedPackets) {
                        for (var i = 0; i < encodedPackets.length; i++) {
                            self.engine.write(encodedPackets[i])
                        }
                        self.encoding = false;
                        self.processPacketQueue()
                    })
                } else {
                    self.packetBuffer.push(packet)
                }
            };
            Manager.prototype.processPacketQueue = function() {
                if (this.packetBuffer.length > 0 && !this.encoding) {
                    var pack = this.packetBuffer.shift();
                    this.packet(pack)
                }
            };
            Manager.prototype.cleanup = function() {
                var sub;
                while (sub = this.subs.shift()) sub.destroy();
                this.packetBuffer = [];
                this.encoding = false;
                this.decoder.destroy()
            };
            Manager.prototype.close = Manager.prototype.disconnect = function() {
                this.skipReconnect = true;
                this.backoff.reset();
                this.readyState = "closed";
                this.engine && this.engine.close()
            };
            Manager.prototype.onclose = function(reason) {
                debug("close");
                this.cleanup();
                this.backoff.reset();
                this.readyState = "closed";
                this.emit("close", reason);
                if (this._reconnection && !this.skipReconnect) {
                    this.reconnect()
                }
            };
            Manager.prototype.reconnect = function() {
                if (this.reconnecting || this.skipReconnect) return this;
                var self = this;
                if (this.backoff.attempts >= this._reconnectionAttempts) {
                    debug("reconnect failed");
                    this.backoff.reset();
                    this.emitAll("reconnect_failed");
                    this.reconnecting = false
                } else {
                    var delay = this.backoff.duration();
                    debug("will wait %dms before reconnect attempt", delay);
                    this.reconnecting = true;
                    var timer = setTimeout(function() {
                        if (self.skipReconnect) return;
                        debug("attempting reconnect");
                        self.emitAll("reconnect_attempt", self.backoff.attempts);
                        self.emitAll("reconnecting", self.backoff.attempts);
                        if (self.skipReconnect) return;
                        self.open(function(err) {
                            if (err) {
                                debug("reconnect attempt error");
                                self.reconnecting = false;
                                self.reconnect();
                                self.emitAll("reconnect_error", err.data)
                            } else {
                                debug("reconnect success");
                                self.onreconnect()
                            }
                        })
                    }, delay);
                    this.subs.push({
                        destroy: function() {
                            clearTimeout(timer)
                        }
                    })
                }
            };
            Manager.prototype.onreconnect = function() {
                var attempt = this.backoff.attempts;
                this.reconnecting = false;
                this.backoff.reset();
                this.updateSocketIds();
                this.emitAll("reconnect", attempt)
            }
        }, {
            "./on": 4,
            "./socket": 5,
            "./url": 6,
            backo2: 7,
            "component-bind": 8,
            "component-emitter": 9,
            debug: 10,
            "engine.io-client": 11,
            indexof: 40,
            "object-component": 41,
            "socket.io-parser": 44
        }],
        4: [function(_dereq_, module, exports) {
            module.exports = on;

            function on(obj, ev, fn) {
                obj.on(ev, fn);
                return {
                    destroy: function() {
                        obj.removeListener(ev, fn)
                    }
                }
            }
        }, {}],
        5: [function(_dereq_, module, exports) {
            var parser = _dereq_("socket.io-parser");
            var Emitter = _dereq_("component-emitter");
            var toArray = _dereq_("to-array");
            var on = _dereq_("./on");
            var bind = _dereq_("component-bind");
            var debug = _dereq_("debug")("socket.io-client:socket");
            var hasBin = _dereq_("has-binary");
            module.exports = exports = Socket;
            var events = {
                connect: 1,
                connect_error: 1,
                connect_timeout: 1,
                disconnect: 1,
                error: 1,
                reconnect: 1,
                reconnect_attempt: 1,
                reconnect_failed: 1,
                reconnect_error: 1,
                reconnecting: 1
            };
            var emit = Emitter.prototype.emit;

            function Socket(io, nsp) {
                this.io = io;
                this.nsp = nsp;
                this.json = this;
                this.ids = 0;
                this.acks = {};
                if (this.io.autoConnect) this.open();
                this.receiveBuffer = [];
                this.sendBuffer = [];
                this.connected = false;
                this.disconnected = true
            }
            Emitter(Socket.prototype);
            Socket.prototype.subEvents = function() {
                if (this.subs) return;
                var io = this.io;
                this.subs = [on(io, "open", bind(this, "onopen")), on(io, "packet", bind(this, "onpacket")), on(io, "close", bind(this, "onclose"))]
            };
            Socket.prototype.open = Socket.prototype.connect = function() {
                if (this.connected) return this;
                this.subEvents();
                this.io.open();
                if ("open" == this.io.readyState) this.onopen();
                return this
            };
            Socket.prototype.send = function() {
                var args = toArray(arguments);
                args.unshift("message");
                this.emit.apply(this, args);
                return this
            };
            Socket.prototype.emit = function(ev) {
                if (events.hasOwnProperty(ev)) {
                    emit.apply(this, arguments);
                    return this
                }
                var args = toArray(arguments);
                var parserType = parser.EVENT;
                if (hasBin(args)) {
                    parserType = parser.BINARY_EVENT
                }
                var packet = {
                    type: parserType,
                    data: args
                };
                if ("function" == typeof args[args.length - 1]) {
                    debug("emitting packet with ack id %d", this.ids);
                    this.acks[this.ids] = args.pop();
                    packet.id = this.ids++
                }
                if (this.connected) {
                    this.packet(packet)
                } else {
                    this.sendBuffer.push(packet)
                }
                return this
            };
            Socket.prototype.packet = function(packet) {
                packet.nsp = this.nsp;
                this.io.packet(packet)
            };
            Socket.prototype.onopen = function() {
                debug("transport is open - connecting");
                if ("/" != this.nsp) {
                    this.packet({
                        type: parser.CONNECT
                    })
                }
            };
            Socket.prototype.onclose = function(reason) {
                debug("close (%s)", reason);
                this.connected = false;
                this.disconnected = true;
                delete this.id;
                this.emit("disconnect", reason)
            };
            Socket.prototype.onpacket = function(packet) {
                if (packet.nsp != this.nsp) return;
                switch (packet.type) {
                    case parser.CONNECT:
                        this.onconnect();
                        break;
                    case parser.EVENT:
                        this.onevent(packet);
                        break;
                    case parser.BINARY_EVENT:
                        this.onevent(packet);
                        break;
                    case parser.ACK:
                        this.onack(packet);
                        break;
                    case parser.BINARY_ACK:
                        this.onack(packet);
                        break;
                    case parser.DISCONNECT:
                        this.ondisconnect();
                        break;
                    case parser.ERROR:
                        this.emit("error", packet.data);
                        break
                }
            };
            Socket.prototype.onevent = function(packet) {
                var args = packet.data || [];
                debug("emitting event %j", args);
                if (null != packet.id) {
                    debug("attaching ack callback to event");
                    args.push(this.ack(packet.id))
                }
                if (this.connected) {
                    emit.apply(this, args)
                } else {
                    this.receiveBuffer.push(args)
                }
            };
            Socket.prototype.ack = function(id) {
                var self = this;
                var sent = false;
                return function() {
                    if (sent) return;
                    sent = true;
                    var args = toArray(arguments);
                    debug("sending ack %j", args);
                    var type = hasBin(args) ? parser.BINARY_ACK : parser.ACK;
                    self.packet({
                        type: type,
                        id: id,
                        data: args
                    })
                }
            };
            Socket.prototype.onack = function(packet) {
                debug("calling ack %s with %j", packet.id, packet.data);
                var fn = this.acks[packet.id];
                fn.apply(this, packet.data);
                delete this.acks[packet.id]
            };
            Socket.prototype.onconnect = function() {
                this.connected = true;
                this.disconnected = false;
                this.emit("connect");
                this.emitBuffered()
            };
            Socket.prototype.emitBuffered = function() {
                var i;
                for (i = 0; i < this.receiveBuffer.length; i++) {
                    emit.apply(this, this.receiveBuffer[i])
                }
                this.receiveBuffer = [];
                for (i = 0; i < this.sendBuffer.length; i++) {
                    this.packet(this.sendBuffer[i])
                }
                this.sendBuffer = []
            };
            Socket.prototype.ondisconnect = function() {
                debug("server disconnect (%s)", this.nsp);
                this.destroy();
                this.onclose("io server disconnect")
            };
            Socket.prototype.destroy = function() {
                if (this.subs) {
                    for (var i = 0; i < this.subs.length; i++) {
                        this.subs[i].destroy()
                    }
                    this.subs = null
                }
                this.io.destroy(this)
            };
            Socket.prototype.close = Socket.prototype.disconnect = function() {
                if (this.connected) {
                    debug("performing disconnect (%s)", this.nsp);
                    this.packet({
                        type: parser.DISCONNECT
                    })
                }
                this.destroy();
                if (this.connected) {
                    this.onclose("io client disconnect")
                }
                return this
            }
        }, {
            "./on": 4,
            "component-bind": 8,
            "component-emitter": 9,
            debug: 10,
            "has-binary": 36,
            "socket.io-parser": 44,
            "to-array": 48
        }],
        6: [function(_dereq_, module, exports) {
            (function(global) {
                var parseuri = _dereq_("parseuri");
                var debug = _dereq_("debug")("socket.io-client:url");
                module.exports = url;

                function url(uri, loc) {
                    var obj = uri;
                    var loc = loc || global.location;
                    if (null == uri) uri = loc.protocol + "//" + loc.host;
                    if ("string" == typeof uri) {
                        if ("/" == uri.charAt(0)) {
                            if ("/" == uri.charAt(1)) {
                                uri = loc.protocol + uri
                            } else {
                                uri = loc.hostname + uri
                            }
                        }
                        if (!/^(https?|wss?):\/\//.test(uri)) {
                            debug("protocol-less url %s", uri);
                            if ("undefined" != typeof loc) {
                                uri = loc.protocol + "//" + uri
                            } else {
                                uri = "https://" + uri
                            }
                        }
                        debug("parse %s", uri);
                        obj = parseuri(uri)
                    }
                    if (!obj.port) {
                        if (/^(http|ws)$/.test(obj.protocol)) {
                            obj.port = "80"
                        } else if (/^(http|ws)s$/.test(obj.protocol)) {
                            obj.port = "443"
                        }
                    }
                    obj.path = obj.path || "/";
                    obj.id = obj.protocol + "://" + obj.host + ":" + obj.port;
                    obj.href = obj.protocol + "://" + obj.host + (loc && loc.port == obj.port ? "" : ":" + obj.port);
                    return obj
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            debug: 10,
            parseuri: 42
        }],
        7: [function(_dereq_, module, exports) {
            module.exports = Backoff;

            function Backoff(opts) {
                opts = opts || {};
                this.ms = opts.min || 100;
                this.max = opts.max || 1e4;
                this.factor = opts.factor || 2;
                this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
                this.attempts = 0
            }
            Backoff.prototype.duration = function() {
                var ms = this.ms * Math.pow(this.factor, this.attempts++);
                if (this.jitter) {
                    var rand = Math.random();
                    var deviation = Math.floor(rand * this.jitter * ms);
                    ms = (Math.floor(rand * 10) & 1) == 0 ? ms - deviation : ms + deviation
                }
                return Math.min(ms, this.max) | 0
            };
            Backoff.prototype.reset = function() {
                this.attempts = 0
            };
            Backoff.prototype.setMin = function(min) {
                this.ms = min
            };
            Backoff.prototype.setMax = function(max) {
                this.max = max
            };
            Backoff.prototype.setJitter = function(jitter) {
                this.jitter = jitter
            }
        }, {}],
        8: [function(_dereq_, module, exports) {
            var slice = [].slice;
            module.exports = function(obj, fn) {
                if ("string" == typeof fn) fn = obj[fn];
                if ("function" != typeof fn) throw new Error("bind() requires a function");
                var args = slice.call(arguments, 2);
                return function() {
                    return fn.apply(obj, args.concat(slice.call(arguments)))
                }
            }
        }, {}],
        9: [function(_dereq_, module, exports) {
            module.exports = Emitter;

            function Emitter(obj) {
                if (obj) return mixin(obj)
            }

            function mixin(obj) {
                for (var key in Emitter.prototype) {
                    obj[key] = Emitter.prototype[key]
                }
                return obj
            }
            Emitter.prototype.on = Emitter.prototype.addEventListener = function(event, fn) {
                this._callbacks = this._callbacks || {};
                (this._callbacks[event] = this._callbacks[event] || []).push(fn);
                return this
            };
            Emitter.prototype.once = function(event, fn) {
                var self = this;
                this._callbacks = this._callbacks || {};

                function on() {
                    self.off(event, on);
                    fn.apply(this, arguments)
                }
                on.fn = fn;
                this.on(event, on);
                return this
            };
            Emitter.prototype.off = Emitter.prototype.removeListener = Emitter.prototype.removeAllListeners = Emitter.prototype.removeEventListener = function(event, fn) {
                this._callbacks = this._callbacks || {};
                if (0 == arguments.length) {
                    this._callbacks = {};
                    return this
                }
                var callbacks = this._callbacks[event];
                if (!callbacks) return this;
                if (1 == arguments.length) {
                    delete this._callbacks[event];
                    return this
                }
                var cb;
                for (var i = 0; i < callbacks.length; i++) {
                    cb = callbacks[i];
                    if (cb === fn || cb.fn === fn) {
                        callbacks.splice(i, 1);
                        break
                    }
                }
                return this
            };
            Emitter.prototype.emit = function(event) {
                this._callbacks = this._callbacks || {};
                var args = [].slice.call(arguments, 1),
                    callbacks = this._callbacks[event];
                if (callbacks) {
                    callbacks = callbacks.slice(0);
                    for (var i = 0, len = callbacks.length; i < len; ++i) {
                        callbacks[i].apply(this, args)
                    }
                }
                return this
            };
            Emitter.prototype.listeners = function(event) {
                this._callbacks = this._callbacks || {};
                return this._callbacks[event] || []
            };
            Emitter.prototype.hasListeners = function(event) {
                return !!this.listeners(event).length
            }
        }, {}],
        10: [function(_dereq_, module, exports) {
            module.exports = debug;

            function debug(name) {
                if (!debug.enabled(name)) return function() {};
                return function(fmt) {
                    fmt = coerce(fmt);
                    var curr = new Date;
                    var ms = curr - (debug[name] || curr);
                    debug[name] = curr;
                    fmt = name + " " + fmt + " +" + debug.humanize(ms);
                    window.console && console.log && Function.prototype.apply.call(console.log, console, arguments)
                }
            }
            debug.names = [];
            debug.skips = [];
            debug.enable = function(name) {
                try {
                    localStorage.debug = name
                } catch (e) {}
                var split = (name || "").split(/[\s,]+/),
                    len = split.length;
                for (var i = 0; i < len; i++) {
                    name = split[i].replace("*", ".*?");
                    if (name[0] === "-") {
                        debug.skips.push(new RegExp("^" + name.substr(1) + "$"))
                    } else {
                        debug.names.push(new RegExp("^" + name + "$"))
                    }
                }
            };
            debug.disable = function() {
                debug.enable("")
            };
            debug.humanize = function(ms) {
                var sec = 1e3,
                    min = 60 * 1e3,
                    hour = 60 * min;
                if (ms >= hour) return (ms / hour).toFixed(1) + "h";
                if (ms >= min) return (ms / min).toFixed(1) + "m";
                if (ms >= sec) return (ms / sec | 0) + "s";
                return ms + "ms"
            };
            debug.enabled = function(name) {
                for (var i = 0, len = debug.skips.length; i < len; i++) {
                    if (debug.skips[i].test(name)) {
                        return false
                    }
                }
                for (var i = 0, len = debug.names.length; i < len; i++) {
                    if (debug.names[i].test(name)) {
                        return true
                    }
                }
                return false
            };

            function coerce(val) {
                if (val instanceof Error) return val.stack || val.message;
                return val
            }
            try {
                if (window.localStorage) debug.enable(localStorage.debug)
            } catch (e) {}
        }, {}],
        11: [function(_dereq_, module, exports) {
            module.exports = _dereq_("./lib/")
        }, {
            "./lib/": 12
        }],
        12: [function(_dereq_, module, exports) {
            module.exports = _dereq_("./socket");
            module.exports.parser = _dereq_("engine.io-parser")
        }, {
            "./socket": 13,
            "engine.io-parser": 25
        }],
        13: [function(_dereq_, module, exports) {
            (function(global) {
                var transports = _dereq_("./transports");
                var Emitter = _dereq_("component-emitter");
                var debug = _dereq_("debug")("engine.io-client:socket");
                var index = _dereq_("indexof");
                var parser = _dereq_("engine.io-parser");
                var parseuri = _dereq_("parseuri");
                var parsejson = _dereq_("parsejson");
                var parseqs = _dereq_("parseqs");
                module.exports = Socket;

                function noop() {}

                function Socket(uri, opts) {
                    if (!(this instanceof Socket)) return new Socket(uri, opts);
                    opts = opts || {};
                    if (uri && "object" == typeof uri) {
                        opts = uri;
                        uri = null
                    }
                    if (uri) {
                        uri = parseuri(uri);
                        opts.host = uri.host;
                        opts.secure = uri.protocol == "https" || uri.protocol == "wss";
                        opts.port = uri.port;
                        if (uri.query) opts.query = uri.query
                    }
                    this.secure = null != opts.secure ? opts.secure : global.location && "https:" == location.protocol;
                    if (opts.host) {
                        var pieces = opts.host.split(":");
                        opts.hostname = pieces.shift();
                        if (pieces.length) {
                            opts.port = pieces.pop()
                        } else if (!opts.port) {
                            opts.port = this.secure ? "443" : "80"
                        }
                    }
                    this.agent = opts.agent || false;
                    this.hostname = opts.hostname || (global.location ? location.hostname : "localhost");
                    this.port = opts.port || (global.location && location.port ? location.port : this.secure ? 443 : 80);
                    this.query = opts.query || {};
                    if ("string" == typeof this.query) this.query = parseqs.decode(this.query);
                    this.upgrade = false !== opts.upgrade;
                    this.path = (opts.path || "/engine.io").replace(/\/$/, "") + "/";
                    this.forceJSONP = !!opts.forceJSONP;
                    this.jsonp = false !== opts.jsonp;
                    this.forceBase64 = !!opts.forceBase64;
                    this.enablesXDR = !!opts.enablesXDR;
                    this.timestampParam = opts.timestampParam || "t";
                    this.timestampRequests = opts.timestampRequests;
                    this.transports = opts.transports || ["polling", "websocket"];
                    this.readyState = "";
                    this.writeBuffer = [];
                    this.callbackBuffer = [];
                    this.policyPort = opts.policyPort || 843;
                    this.rememberUpgrade = opts.rememberUpgrade || false;
                    this.binaryType = null;
                    this.onlyBinaryUpgrades = opts.onlyBinaryUpgrades;
                    this.pfx = opts.pfx || null;
                    this.key = opts.key || null;
                    this.passphrase = opts.passphrase || null;
                    this.cert = opts.cert || null;
                    this.ca = opts.ca || null;
                    this.ciphers = opts.ciphers || null;
                    this.rejectUnauthorized = opts.rejectUnauthorized || null;
                    this.open()
                }
                Socket.priorWebsocketSuccess = false;
                Emitter(Socket.prototype);
                Socket.protocol = parser.protocol;
                Socket.Socket = Socket;
                Socket.Transport = _dereq_("./transport");
                Socket.transports = _dereq_("./transports");
                Socket.parser = _dereq_("engine.io-parser");
                Socket.prototype.createTransport = function(name) {
                    debug('creating transport "%s"', name);
                    var query = clone(this.query);
                    query.EIO = parser.protocol;
                    query.transport = name;
                    if (this.id) query.sid = this.id;
                    var transport = new transports[name]({
                        agent: this.agent,
                        hostname: this.hostname,
                        port: this.port,
                        secure: this.secure,
                        path: this.path,
                        query: query,
                        forceJSONP: this.forceJSONP,
                        jsonp: this.jsonp,
                        forceBase64: this.forceBase64,
                        enablesXDR: this.enablesXDR,
                        timestampRequests: this.timestampRequests,
                        timestampParam: this.timestampParam,
                        policyPort: this.policyPort,
                        socket: this,
                        pfx: this.pfx,
                        key: this.key,
                        passphrase: this.passphrase,
                        cert: this.cert,
                        ca: this.ca,
                        ciphers: this.ciphers,
                        rejectUnauthorized: this.rejectUnauthorized
                    });
                    return transport
                };

                function clone(obj) {
                    var o = {};
                    for (var i in obj) {
                        if (obj.hasOwnProperty(i)) {
                            o[i] = obj[i]
                        }
                    }
                    return o
                }
                Socket.prototype.open = function() {
                    var transport;
                    if (this.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf("websocket") != -1) {
                        transport = "websocket"
                    } else if (0 == this.transports.length) {
                        var self = this;
                        setTimeout(function() {
                            self.emit("error", "No transports available")
                        }, 0);
                        return
                    } else {
                        transport = this.transports[0]
                    }
                    this.readyState = "opening";
                    var transport;
                    try {
                        transport = this.createTransport(transport)
                    } catch (e) {
                        this.transports.shift();
                        this.open();
                        return
                    }
                    transport.open();
                    this.setTransport(transport)
                };
                Socket.prototype.setTransport = function(transport) {
                    debug("setting transport %s", transport.name);
                    var self = this;
                    if (this.transport) {
                        debug("clearing existing transport %s", this.transport.name);
                        this.transport.removeAllListeners()
                    }
                    this.transport = transport;
                    transport.on("drain", function() {
                        self.onDrain()
                    }).on("packet", function(packet) {
                        self.onPacket(packet)
                    }).on("error", function(e) {
                        self.onError(e)
                    }).on("close", function() {
                        self.onClose("transport close")
                    })
                };
                Socket.prototype.probe = function(name) {
                    debug('probing transport "%s"', name);
                    var transport = this.createTransport(name, {
                            probe: 1
                        }),
                        failed = false,
                        self = this;
                    Socket.priorWebsocketSuccess = false;

                    function onTransportOpen() {
                        if (self.onlyBinaryUpgrades) {
                            var upgradeLosesBinary = !this.supportsBinary && self.transport.supportsBinary;
                            failed = failed || upgradeLosesBinary
                        }
                        if (failed) return;
                        debug('probe transport "%s" opened', name);
                        transport.send([{
                            type: "ping",
                            data: "probe"
                        }]);
                        transport.once("packet", function(msg) {
                            if (failed) return;
                            if ("pong" == msg.type && "probe" == msg.data) {
                                debug('probe transport "%s" pong', name);
                                self.upgrading = true;
                                self.emit("upgrading", transport);
                                if (!transport) return;
                                Socket.priorWebsocketSuccess = "websocket" == transport.name;
                                debug('pausing current transport "%s"', self.transport.name);
                                self.transport.pause(function() {
                                    if (failed) return;
                                    if ("closed" == self.readyState) return;
                                    debug("changing transport and sending upgrade packet");
                                    cleanup();
                                    self.setTransport(transport);
                                    transport.send([{
                                        type: "upgrade"
                                    }]);
                                    self.emit("upgrade", transport);
                                    transport = null;
                                    self.upgrading = false;
                                    self.flush()
                                })
                            } else {
                                debug('probe transport "%s" failed', name);
                                var err = new Error("probe error");
                                err.transport = transport.name;
                                self.emit("upgradeError", err)
                            }
                        })
                    }

                    function freezeTransport() {
                        if (failed) return;
                        failed = true;
                        cleanup();
                        transport.close();
                        transport = null
                    }

                    function onerror(err) {
                        var error = new Error("probe error: " + err);
                        error.transport = transport.name;
                        freezeTransport();
                        debug('probe transport "%s" failed because of error: %s', name, err);
                        self.emit("upgradeError", error)
                    }

                    function onTransportClose() {
                        onerror("transport closed")
                    }

                    function onclose() {
                        onerror("socket closed")
                    }

                    function onupgrade(to) {
                        if (transport && to.name != transport.name) {
                            debug('"%s" works - aborting "%s"', to.name, transport.name);
                            freezeTransport()
                        }
                    }

                    function cleanup() {
                        transport.removeListener("open", onTransportOpen);
                        transport.removeListener("error", onerror);
                        transport.removeListener("close", onTransportClose);
                        self.removeListener("close", onclose);
                        self.removeListener("upgrading", onupgrade)
                    }
                    transport.once("open", onTransportOpen);
                    transport.once("error", onerror);
                    transport.once("close", onTransportClose);
                    this.once("close", onclose);
                    this.once("upgrading", onupgrade);
                    transport.open()
                };
                Socket.prototype.onOpen = function() {
                    debug("socket open");
                    this.readyState = "open";
                    Socket.priorWebsocketSuccess = "websocket" == this.transport.name;
                    this.emit("open");
                    this.flush();
                    if ("open" == this.readyState && this.upgrade && this.transport.pause) {
                        debug("starting upgrade probes");
                        for (var i = 0, l = this.upgrades.length; i < l; i++) {
                            this.probe(this.upgrades[i])
                        }
                    }
                };
                Socket.prototype.onPacket = function(packet) {
                    if ("opening" == this.readyState || "open" == this.readyState) {
                        debug('socket receive: type "%s", data "%s"', packet.type, packet.data);
                        this.emit("packet", packet);
                        this.emit("heartbeat");
                        switch (packet.type) {
                            case "open":
                                this.onHandshake(parsejson(packet.data));
                                break;
                            case "pong":
                                this.setPing();
                                break;
                            case "error":
                                var err = new Error("server error");
                                err.code = packet.data;
                                this.emit("error", err);
                                break;
                            case "message":
                                this.emit("data", packet.data);
                                this.emit("message", packet.data);
                                break
                        }
                    } else {
                        debug('packet received with socket readyState "%s"', this.readyState)
                    }
                };
                Socket.prototype.onHandshake = function(data) {
                    this.emit("handshake", data);
                    this.id = data.sid;
                    this.transport.query.sid = data.sid;
                    this.upgrades = this.filterUpgrades(data.upgrades);
                    this.pingInterval = data.pingInterval;
                    this.pingTimeout = data.pingTimeout;
                    this.onOpen();
                    if ("closed" == this.readyState) return;
                    this.setPing();
                    this.removeListener("heartbeat", this.onHeartbeat);
                    this.on("heartbeat", this.onHeartbeat)
                };
                Socket.prototype.onHeartbeat = function(timeout) {
                    clearTimeout(this.pingTimeoutTimer);
                    var self = this;
                    self.pingTimeoutTimer = setTimeout(function() {
                        if ("closed" == self.readyState) return;
                        self.onClose("ping timeout")
                    }, timeout || self.pingInterval + self.pingTimeout)
                };
                Socket.prototype.setPing = function() {
                    var self = this;
                    clearTimeout(self.pingIntervalTimer);
                    self.pingIntervalTimer = setTimeout(function() {
                        debug("writing ping packet - expecting pong within %sms", self.pingTimeout);
                        self.ping();
                        self.onHeartbeat(self.pingTimeout)
                    }, self.pingInterval)
                };
                Socket.prototype.ping = function() {
                    this.sendPacket("ping")
                };
                Socket.prototype.onDrain = function() {
                    for (var i = 0; i < this.prevBufferLen; i++) {
                        if (this.callbackBuffer[i]) {
                            this.callbackBuffer[i]()
                        }
                    }
                    this.writeBuffer.splice(0, this.prevBufferLen);
                    this.callbackBuffer.splice(0, this.prevBufferLen);
                    this.prevBufferLen = 0;
                    if (this.writeBuffer.length == 0) {
                        this.emit("drain")
                    } else {
                        this.flush()
                    }
                };
                Socket.prototype.flush = function() {
                    if ("closed" != this.readyState && this.transport.writable && !this.upgrading && this.writeBuffer.length) {
                        debug("flushing %d packets in socket", this.writeBuffer.length);
                        this.transport.send(this.writeBuffer);
                        this.prevBufferLen = this.writeBuffer.length;
                        this.emit("flush")
                    }
                };
                Socket.prototype.write = Socket.prototype.send = function(msg, fn) {
                    this.sendPacket("message", msg, fn);
                    return this
                };
                Socket.prototype.sendPacket = function(type, data, fn) {
                    if ("closing" == this.readyState || "closed" == this.readyState) {
                        return
                    }
                    var packet = {
                        type: type,
                        data: data
                    };
                    this.emit("packetCreate", packet);
                    this.writeBuffer.push(packet);
                    this.callbackBuffer.push(fn);
                    this.flush()
                };
                Socket.prototype.close = function() {
                    if ("opening" == this.readyState || "open" == this.readyState) {
                        this.readyState = "closing";
                        var self = this;

                        function close() {
                            self.onClose("forced close");
                            debug("socket closing - telling transport to close");
                            self.transport.close()
                        }

                        function cleanupAndClose() {
                            self.removeListener("upgrade", cleanupAndClose);
                            self.removeListener("upgradeError", cleanupAndClose);
                            close()
                        }

                        function waitForUpgrade() {
                            self.once("upgrade", cleanupAndClose);
                            self.once("upgradeError", cleanupAndClose)
                        }
                        if (this.writeBuffer.length) {
                            this.once("drain", function() {
                                if (this.upgrading) {
                                    waitForUpgrade()
                                } else {
                                    close()
                                }
                            })
                        } else if (this.upgrading) {
                            waitForUpgrade()
                        } else {
                            close()
                        }
                    }
                    return this
                };
                Socket.prototype.onError = function(err) {
                    debug("socket error %j", err);
                    Socket.priorWebsocketSuccess = false;
                    this.emit("error", err);
                    this.onClose("transport error", err)
                };
                Socket.prototype.onClose = function(reason, desc) {
                    if ("opening" == this.readyState || "open" == this.readyState || "closing" == this.readyState) {
                        debug('socket close with reason: "%s"', reason);
                        var self = this;
                        clearTimeout(this.pingIntervalTimer);
                        clearTimeout(this.pingTimeoutTimer);
                        setTimeout(function() {
                            self.writeBuffer = [];
                            self.callbackBuffer = [];
                            self.prevBufferLen = 0
                        }, 0);
                        this.transport.removeAllListeners("close");
                        this.transport.close();
                        this.transport.removeAllListeners();
                        this.readyState = "closed";
                        this.id = null;
                        this.emit("close", reason, desc)
                    }
                };
                Socket.prototype.filterUpgrades = function(upgrades) {
                    var filteredUpgrades = [];
                    for (var i = 0, j = upgrades.length; i < j; i++) {
                        if (~index(this.transports, upgrades[i])) filteredUpgrades.push(upgrades[i])
                    }
                    return filteredUpgrades
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./transport": 14,
            "./transports": 15,
            "component-emitter": 9,
            debug: 22,
            "engine.io-parser": 25,
            indexof: 40,
            parsejson: 32,
            parseqs: 33,
            parseuri: 34
        }],
        14: [function(_dereq_, module, exports) {
            var parser = _dereq_("engine.io-parser");
            var Emitter = _dereq_("component-emitter");
            module.exports = Transport;

            function Transport(opts) {
                this.path = opts.path;
                this.hostname = opts.hostname;
                this.port = opts.port;
                this.secure = opts.secure;
                this.query = opts.query;
                this.timestampParam = opts.timestampParam;
                this.timestampRequests = opts.timestampRequests;
                this.readyState = "";
                this.agent = opts.agent || false;
                this.socket = opts.socket;
                this.enablesXDR = opts.enablesXDR;
                this.pfx = opts.pfx;
                this.key = opts.key;
                this.passphrase = opts.passphrase;
                this.cert = opts.cert;
                this.ca = opts.ca;
                this.ciphers = opts.ciphers;
                this.rejectUnauthorized = opts.rejectUnauthorized
            }
            Emitter(Transport.prototype);
            Transport.timestamps = 0;
            Transport.prototype.onError = function(msg, desc) {
                var err = new Error(msg);
                err.type = "TransportError";
                err.description = desc;
                this.emit("error", err);
                return this
            };
            Transport.prototype.open = function() {
                if ("closed" == this.readyState || "" == this.readyState) {
                    this.readyState = "opening";
                    this.doOpen()
                }
                return this
            };
            Transport.prototype.close = function() {
                if ("opening" == this.readyState || "open" == this.readyState) {
                    this.doClose();
                    this.onClose()
                }
                return this
            };
            Transport.prototype.send = function(packets) {
                if ("open" == this.readyState) {
                    this.write(packets)
                } else {
                    throw new Error("Transport not open")
                }
            };
            Transport.prototype.onOpen = function() {
                this.readyState = "open";
                this.writable = true;
                this.emit("open")
            };
            Transport.prototype.onData = function(data) {
                var packet = parser.decodePacket(data, this.socket.binaryType);
                this.onPacket(packet)
            };
            Transport.prototype.onPacket = function(packet) {
                this.emit("packet", packet)
            };
            Transport.prototype.onClose = function() {
                this.readyState = "closed";
                this.emit("close")
            }
        }, {
            "component-emitter": 9,
            "engine.io-parser": 25
        }],
        15: [function(_dereq_, module, exports) {
            (function(global) {
                var XMLHttpRequest = _dereq_("xmlhttprequest");
                var XHR = _dereq_("./polling-xhr");
                var JSONP = _dereq_("./polling-jsonp");
                var websocket = _dereq_("./websocket");
                exports.polling = polling;
                exports.websocket = websocket;

                function polling(opts) {
                    var xhr;
                    var xd = false;
                    var xs = false;
                    var jsonp = false !== opts.jsonp;
                    if (global.location) {
                        var isSSL = "https:" == location.protocol;
                        var port = location.port;
                        if (!port) {
                            port = isSSL ? 443 : 80
                        }
                        xd = opts.hostname != location.hostname || port != opts.port;
                        xs = opts.secure != isSSL
                    }
                    opts.xdomain = xd;
                    opts.xscheme = xs;
                    xhr = new XMLHttpRequest(opts);
                    if ("open" in xhr && !opts.forceJSONP) {
                        return new XHR(opts)
                    } else {
                        if (!jsonp) throw new Error("JSONP disabled");
                        return new JSONP(opts)
                    }
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./polling-jsonp": 16,
            "./polling-xhr": 17,
            "./websocket": 19,
            xmlhttprequest: 20
        }],
        16: [function(_dereq_, module, exports) {
            (function(global) {
                var Polling = _dereq_("./polling");
                var inherit = _dereq_("component-inherit");
                module.exports = JSONPPolling;
                var rNewline = /\n/g;
                var rEscapedNewline = /\\n/g;
                var callbacks;
                var index = 0;

                function empty() {}

                function JSONPPolling(opts) {
                    Polling.call(this, opts);
                    this.query = this.query || {};
                    if (!callbacks) {
                        if (!global.___eio) global.___eio = [];
                        callbacks = global.___eio
                    }
                    this.index = callbacks.length;
                    var self = this;
                    callbacks.push(function(msg) {
                        self.onData(msg)
                    });
                    this.query.j = this.index;
                    if (global.document && global.addEventListener) {
                        global.addEventListener("beforeunload", function() {
                            if (self.script) self.script.onerror = empty
                        }, false)
                    }
                }
                inherit(JSONPPolling, Polling);
                JSONPPolling.prototype.supportsBinary = false;
                JSONPPolling.prototype.doClose = function() {
                    if (this.script) {
                        this.script.parentNode.removeChild(this.script);
                        this.script = null
                    }
                    if (this.form) {
                        this.form.parentNode.removeChild(this.form);
                        this.form = null;
                        this.iframe = null
                    }
                    Polling.prototype.doClose.call(this)
                };
                JSONPPolling.prototype.doPoll = function() {
                    var self = this;
                    var script = document.createElement("script");
                    if (this.script) {
                        this.script.parentNode.removeChild(this.script);
                        this.script = null
                    }
                    script.async = true;
                    script.src = this.uri();
                    script.onerror = function(e) {
                        self.onError("jsonp poll error", e)
                    };
                    var insertAt = document.getElementsByTagName("script")[0];
                    insertAt.parentNode.insertBefore(script, insertAt);
                    this.script = script;
                    var isUAgecko = "undefined" != typeof navigator && /gecko/i.test(navigator.userAgent);
                    if (isUAgecko) {
                        setTimeout(function() {
                            var iframe = document.createElement("iframe");
                            document.body.appendChild(iframe);
                            document.body.removeChild(iframe)
                        }, 100)
                    }
                };
                JSONPPolling.prototype.doWrite = function(data, fn) {
                    var self = this;
                    if (!this.form) {
                        var form = document.createElement("form");
                        var area = document.createElement("textarea");
                        var id = this.iframeId = "eio_iframe_" + this.index;
                        var iframe;
                        form.className = "socketio";
                        form.style.position = "absolute";
                        form.style.top = "-1000px";
                        form.style.left = "-1000px";
                        form.target = id;
                        form.method = "POST";
                        form.setAttribute("accept-charset", "utf-8");
                        area.name = "d";
                        form.appendChild(area);
                        document.body.appendChild(form);
                        this.form = form;
                        this.area = area
                    }
                    this.form.action = this.uri();

                    function complete() {
                        initIframe();
                        fn()
                    }

                    function initIframe() {
                        if (self.iframe) {
                            try {
                                self.form.removeChild(self.iframe)
                            } catch (e) {
                                self.onError("jsonp polling iframe removal error", e)
                            }
                        }
                        try {
                            var html = '<iframe src="javascript:0" name="' + self.iframeId + '">';
                            iframe = document.createElement(html)
                        } catch (e) {
                            iframe = document.createElement("iframe");
                            iframe.name = self.iframeId;
                            iframe.src = "javascript:0"
                        }
                        iframe.id = self.iframeId;
                        self.form.appendChild(iframe);
                        self.iframe = iframe
                    }
                    initIframe();
                    data = data.replace(rEscapedNewline, "\\\n");
                    this.area.value = data.replace(rNewline, "\\n");
                    try {
                        this.form.submit()
                    } catch (e) {}
                    if (this.iframe.attachEvent) {
                        this.iframe.onreadystatechange = function() {
                            if (self.iframe.readyState == "complete") {
                                complete()
                            }
                        }
                    } else {
                        this.iframe.onload = complete
                    }
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./polling": 18,
            "component-inherit": 21
        }],
        17: [function(_dereq_, module, exports) {
            (function(global) {
                var XMLHttpRequest = _dereq_("xmlhttprequest");
                var Polling = _dereq_("./polling");
                var Emitter = _dereq_("component-emitter");
                var inherit = _dereq_("component-inherit");
                var debug = _dereq_("debug")("engine.io-client:polling-xhr");
                module.exports = XHR;
                module.exports.Request = Request;

                function empty() {}

                function XHR(opts) {
                    Polling.call(this, opts);
                    if (global.location) {
                        var isSSL = "https:" == location.protocol;
                        var port = location.port;
                        if (!port) {
                            port = isSSL ? 443 : 80
                        }
                        this.xd = opts.hostname != global.location.hostname || port != opts.port;
                        this.xs = opts.secure != isSSL
                    }
                }
                inherit(XHR, Polling);
                XHR.prototype.supportsBinary = true;
                XHR.prototype.request = function(opts) {
                    opts = opts || {};
                    opts.uri = this.uri();
                    opts.xd = this.xd;
                    opts.xs = this.xs;
                    opts.agent = this.agent || false;
                    opts.supportsBinary = this.supportsBinary;
                    opts.enablesXDR = this.enablesXDR;
                    opts.pfx = this.pfx;
                    opts.key = this.key;
                    opts.passphrase = this.passphrase;
                    opts.cert = this.cert;
                    opts.ca = this.ca;
                    opts.ciphers = this.ciphers;
                    opts.rejectUnauthorized = this.rejectUnauthorized;
                    return new Request(opts)
                };
                XHR.prototype.doWrite = function(data, fn) {
                    var isBinary = typeof data !== "string" && data !== undefined;
                    var req = this.request({
                        method: "POST",
                        data: data,
                        isBinary: isBinary
                    });
                    var self = this;
                    req.on("success", fn);
                    req.on("error", function(err) {
                        self.onError("xhr post error", err)
                    });
                    this.sendXhr = req
                };
                XHR.prototype.doPoll = function() {
                    debug("xhr poll");
                    var req = this.request();
                    var self = this;
                    req.on("data", function(data) {
                        self.onData(data)
                    });
                    req.on("error", function(err) {
                        self.onError("xhr poll error", err)
                    });
                    this.pollXhr = req
                };

                function Request(opts) {
                    this.method = opts.method || "GET";
                    this.uri = opts.uri;
                    this.xd = !!opts.xd;
                    this.xs = !!opts.xs;
                    this.async = false !== opts.async;
                    this.data = undefined != opts.data ? opts.data : null;
                    this.agent = opts.agent;
                    this.isBinary = opts.isBinary;
                    this.supportsBinary = opts.supportsBinary;
                    this.enablesXDR = opts.enablesXDR;
                    this.pfx = opts.pfx;
                    this.key = opts.key;
                    this.passphrase = opts.passphrase;
                    this.cert = opts.cert;
                    this.ca = opts.ca;
                    this.ciphers = opts.ciphers;
                    this.rejectUnauthorized = opts.rejectUnauthorized;
                    this.create()
                }
                Emitter(Request.prototype);
                Request.prototype.create = function() {
                    var opts = {
                        agent: this.agent,
                        xdomain: this.xd,
                        xscheme: this.xs,
                        enablesXDR: this.enablesXDR
                    };
                    opts.pfx = this.pfx;
                    opts.key = this.key;
                    opts.passphrase = this.passphrase;
                    opts.cert = this.cert;
                    opts.ca = this.ca;
                    opts.ciphers = this.ciphers;
                    opts.rejectUnauthorized = this.rejectUnauthorized;
                    var xhr = this.xhr = new XMLHttpRequest(opts);
                    var self = this;
                    try {
                        debug("xhr open %s: %s", this.method, this.uri);
                        xhr.open(this.method, this.uri, this.async);
                        if (this.supportsBinary) {
                            xhr.responseType = "arraybuffer"
                        }
                        if ("POST" == this.method) {
                            try {
                                if (this.isBinary) {
                                    xhr.setRequestHeader("Content-type", "application/octet-stream")
                                } else {
                                    xhr.setRequestHeader("Content-type", "text/plain;charset=UTF-8")
                                }
                            } catch (e) {}
                        }
                        if ("withCredentials" in xhr) {
                            xhr.withCredentials = true
                        }
                        if (this.hasXDR()) {
                            xhr.onload = function() {
                                self.onLoad()
                            };
                            xhr.onerror = function() {
                                self.onError(xhr.responseText)
                            }
                        } else {
                            xhr.onreadystatechange = function() {
                                if (4 != xhr.readyState) return;
                                if (200 == xhr.status || 1223 == xhr.status) {
                                    self.onLoad()
                                } else {
                                    setTimeout(function() {
                                        self.onError(xhr.status)
                                    }, 0)
                                }
                            }
                        }
                        debug("xhr data %s", this.data);
                        xhr.send(this.data)
                    } catch (e) {
                        setTimeout(function() {
                            self.onError(e)
                        }, 0);
                        return
                    }
                    if (global.document) {
                        this.index = Request.requestsCount++;
                        Request.requests[this.index] = this
                    }
                };
                Request.prototype.onSuccess = function() {
                    this.emit("success");
                    this.cleanup()
                };
                Request.prototype.onData = function(data) {
                    this.emit("data", data);
                    this.onSuccess()
                };
                Request.prototype.onError = function(err) {
                    this.emit("error", err);
                    this.cleanup(true)
                };
                Request.prototype.cleanup = function(fromError) {
                    if ("undefined" == typeof this.xhr || null === this.xhr) {
                        return
                    }
                    if (this.hasXDR()) {
                        this.xhr.onload = this.xhr.onerror = empty
                    } else {
                        this.xhr.onreadystatechange = empty
                    }
                    if (fromError) {
                        try {
                            this.xhr.abort()
                        } catch (e) {}
                    }
                    if (global.document) {
                        delete Request.requests[this.index]
                    }
                    this.xhr = null
                };
                Request.prototype.onLoad = function() {
                    var data;
                    try {
                        var contentType;
                        try {
                            contentType = this.xhr.getResponseHeader("Content-Type").split(";")[0]
                        } catch (e) {}
                        if (contentType === "application/octet-stream") {
                            data = this.xhr.response
                        } else {
                            if (!this.supportsBinary) {
                                data = this.xhr.responseText
                            } else {
                                data = "ok"
                            }
                        }
                    } catch (e) {
                        this.onError(e)
                    }
                    if (null != data) {
                        this.onData(data)
                    }
                };
                Request.prototype.hasXDR = function() {
                    return "undefined" !== typeof global.XDomainRequest && !this.xs && this.enablesXDR
                };
                Request.prototype.abort = function() {
                    this.cleanup()
                };
                if (global.document) {
                    Request.requestsCount = 0;
                    Request.requests = {};
                    if (global.attachEvent) {
                        global.attachEvent("onunload", unloadHandler)
                    } else if (global.addEventListener) {
                        global.addEventListener("beforeunload", unloadHandler, false)
                    }
                }

                function unloadHandler() {
                    for (var i in Request.requests) {
                        if (Request.requests.hasOwnProperty(i)) {
                            Request.requests[i].abort()
                        }
                    }
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./polling": 18,
            "component-emitter": 9,
            "component-inherit": 21,
            debug: 22,
            xmlhttprequest: 20
        }],
        18: [function(_dereq_, module, exports) {
            var Transport = _dereq_("../transport");
            var parseqs = _dereq_("parseqs");
            var parser = _dereq_("engine.io-parser");
            var inherit = _dereq_("component-inherit");
            var debug = _dereq_("debug")("engine.io-client:polling");
            module.exports = Polling;
            var hasXHR2 = function() {
                var XMLHttpRequest = _dereq_("xmlhttprequest");
                var xhr = new XMLHttpRequest({
                    xdomain: false
                });
                return null != xhr.responseType
            }();

            function Polling(opts) {
                var forceBase64 = opts && opts.forceBase64;
                if (!hasXHR2 || forceBase64) {
                    this.supportsBinary = false
                }
                Transport.call(this, opts)
            }
            inherit(Polling, Transport);
            Polling.prototype.name = "polling";
            Polling.prototype.doOpen = function() {
                this.poll()
            };
            Polling.prototype.pause = function(onPause) {
                var pending = 0;
                var self = this;
                this.readyState = "pausing";

                function pause() {
                    debug("paused");
                    self.readyState = "paused";
                    onPause()
                }
                if (this.polling || !this.writable) {
                    var total = 0;
                    if (this.polling) {
                        debug("we are currently polling - waiting to pause");
                        total++;
                        this.once("pollComplete", function() {
                            debug("pre-pause polling complete");
                            --total || pause()
                        })
                    }
                    if (!this.writable) {
                        debug("we are currently writing - waiting to pause");
                        total++;
                        this.once("drain", function() {
                            debug("pre-pause writing complete");
                            --total || pause()
                        })
                    }
                } else {
                    pause()
                }
            };
            Polling.prototype.poll = function() {
                debug("polling");
                this.polling = true;
                this.doPoll();
                this.emit("poll")
            };
            Polling.prototype.onData = function(data) {
                var self = this;
                debug("polling got data %s", data);
                var callback = function(packet, index, total) {
                    if ("opening" == self.readyState) {
                        self.onOpen()
                    }
                    if ("close" == packet.type) {
                        self.onClose();
                        return false
                    }
                    self.onPacket(packet)
                };
                parser.decodePayload(data, this.socket.binaryType, callback);
                if ("closed" != this.readyState) {
                    this.polling = false;
                    this.emit("pollComplete");
                    if ("open" == this.readyState) {
                        this.poll()
                    } else {
                        debug('ignoring poll - transport state "%s"', this.readyState)
                    }
                }
            };
            Polling.prototype.doClose = function() {
                var self = this;

                function close() {
                    debug("writing close packet");
                    self.write([{
                        type: "close"
                    }])
                }
                if ("open" == this.readyState) {
                    debug("transport open - closing");
                    close()
                } else {
                    debug("transport not open - deferring close");
                    this.once("open", close)
                }
            };
            Polling.prototype.write = function(packets) {
                var self = this;
                this.writable = false;
                var callbackfn = function() {
                    self.writable = true;
                    self.emit("drain")
                };
                var self = this;
                parser.encodePayload(packets, this.supportsBinary, function(data) {
                    self.doWrite(data, callbackfn)
                })
            };
            Polling.prototype.uri = function() {
                var query = this.query || {};
                var schema = this.secure ? "https" : "http";
                var port = "";
                if (false !== this.timestampRequests) {
                    query[this.timestampParam] = +new Date + "-" + Transport.timestamps++
                }
                if (!this.supportsBinary && !query.sid) {
                    query.b64 = 1
                }
                query = parseqs.encode(query);
                if (this.port && ("https" == schema && this.port != 443 || "http" == schema && this.port != 80)) {
                    port = ":" + this.port
                }
                if (query.length) {
                    query = "?" + query
                }
                return schema + "://" + this.hostname + port + this.path + query
            }
        }, {
            "../transport": 14,
            "component-inherit": 21,
            debug: 22,
            "engine.io-parser": 25,
            parseqs: 33,
            xmlhttprequest: 20
        }],
        19: [function(_dereq_, module, exports) {
            var Transport = _dereq_("../transport");
            var parser = _dereq_("engine.io-parser");
            var parseqs = _dereq_("parseqs");
            var inherit = _dereq_("component-inherit");
            var debug = _dereq_("debug")("engine.io-client:websocket");
            var WebSocket = _dereq_("ws");
            module.exports = WS;

            function WS(opts) {
                var forceBase64 = opts && opts.forceBase64;
                if (forceBase64) {
                    this.supportsBinary = false
                }
                Transport.call(this, opts)
            }
            inherit(WS, Transport);
            WS.prototype.name = "websocket";
            WS.prototype.supportsBinary = true;
            WS.prototype.doOpen = function() {
                if (!this.check()) {
                    return
                }
                var self = this;
                var uri = this.uri();
                var protocols = void 0;
                var opts = {
                    agent: this.agent
                };
                opts.pfx = this.pfx;
                opts.key = this.key;
                opts.passphrase = this.passphrase;
                opts.cert = this.cert;
                opts.ca = this.ca;
                opts.ciphers = this.ciphers;
                opts.rejectUnauthorized = this.rejectUnauthorized;
                this.ws = new WebSocket(uri, protocols, opts);
                if (this.ws.binaryType === undefined) {
                    this.supportsBinary = false
                }
                this.ws.binaryType = "arraybuffer";
                this.addEventListeners()
            };
            WS.prototype.addEventListeners = function() {
                var self = this;
                this.ws.onopen = function() {
                    self.onOpen()
                };
                this.ws.onclose = function() {
                    self.onClose()
                };
                this.ws.onmessage = function(ev) {
                    self.onData(ev.data)
                };
                this.ws.onerror = function(e) {
                    self.onError("websocket error", e)
                }
            };
            if ("undefined" != typeof navigator && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
                WS.prototype.onData = function(data) {
                    var self = this;
                    setTimeout(function() {
                        Transport.prototype.onData.call(self, data)
                    }, 0)
                }
            }
            WS.prototype.write = function(packets) {
                var self = this;
                this.writable = false;
                for (var i = 0, l = packets.length; i < l; i++) {
                    parser.encodePacket(packets[i], this.supportsBinary, function(data) {
                        try {
                            self.ws.send(data)
                        } catch (e) {
                            debug("websocket closed before onclose event")
                        }
                    })
                }

                function ondrain() {
                    self.writable = true;
                    self.emit("drain")
                }
                setTimeout(ondrain, 0)
            };
            WS.prototype.onClose = function() {
                Transport.prototype.onClose.call(this)
            };
            WS.prototype.doClose = function() {
                if (typeof this.ws !== "undefined") {
                    this.ws.close()
                }
            };
            WS.prototype.uri = function() {
                var query = this.query || {};
                var schema = this.secure ? "wss" : "ws";
                var port = "";
                if (this.port && ("wss" == schema && this.port != 443 || "ws" == schema && this.port != 80)) {
                    port = ":" + this.port
                }
                if (this.timestampRequests) {
                    query[this.timestampParam] = +new Date
                }
                if (!this.supportsBinary) {
                    query.b64 = 1
                }
                query = parseqs.encode(query);
                if (query.length) {
                    query = "?" + query
                }
                return schema + "://" + this.hostname + port + this.path + query
            };
            WS.prototype.check = function() {
                return !!WebSocket && !("__initialize" in WebSocket && this.name === WS.prototype.name)
            }
        }, {
            "../transport": 14,
            "component-inherit": 21,
            debug: 22,
            "engine.io-parser": 25,
            parseqs: 33,
            ws: 35
        }],
        20: [function(_dereq_, module, exports) {
            var hasCORS = _dereq_("has-cors");
            module.exports = function(opts) {
                var xdomain = opts.xdomain;
                var xscheme = opts.xscheme;
                var enablesXDR = opts.enablesXDR;
                try {
                    if ("undefined" != typeof XMLHttpRequest && (!xdomain || hasCORS)) {
                        return new XMLHttpRequest
                    }
                } catch (e) {}
                try {
                    if ("undefined" != typeof XDomainRequest && !xscheme && enablesXDR) {
                        return new XDomainRequest
                    }
                } catch (e) {}
                if (!xdomain) {
                    try {
                        return new ActiveXObject("Microsoft.XMLHTTP")
                    } catch (e) {}
                }
            }
        }, {
            "has-cors": 38
        }],
        21: [function(_dereq_, module, exports) {
            module.exports = function(a, b) {
                var fn = function() {};
                fn.prototype = b.prototype;
                a.prototype = new fn;
                a.prototype.constructor = a
            }
        }, {}],
        22: [function(_dereq_, module, exports) {
            exports = module.exports = _dereq_("./debug");
            exports.log = log;
            exports.formatArgs = formatArgs;
            exports.save = save;
            exports.load = load;
            exports.useColors = useColors;
            exports.colors = ["lightseagreen", "forestgreen", "goldenrod", "dodgerblue", "darkorchid", "crimson"];

            function useColors() {
                return "WebkitAppearance" in document.documentElement.style || window.console && (console.firebug || console.exception && console.table) || navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31
            }
            exports.formatters.j = function(v) {
                return JSON.stringify(v)
            };

            function formatArgs() {
                var args = arguments;
                var useColors = this.useColors;
                args[0] = (useColors ? "%c" : "") + this.namespace + (useColors ? " %c" : " ") + args[0] + (useColors ? "%c " : " ") + "+" + exports.humanize(this.diff);
                if (!useColors) return args;
                var c = "color: " + this.color;
                args = [args[0], c, "color: inherit"].concat(Array.prototype.slice.call(args, 1));
                var index = 0;
                var lastC = 0;
                args[0].replace(/%[a-z%]/g, function(match) {
                    if ("%" === match) return;
                    index++;
                    if ("%c" === match) {
                        lastC = index
                    }
                });
                args.splice(lastC, 0, c);
                return args
            }

            function log() {
                return "object" == typeof console && "function" == typeof console.log && Function.prototype.apply.call(console.log, console, arguments)
            }

            function save(namespaces) {
                try {
                    if (null == namespaces) {
                        localStorage.removeItem("debug")
                    } else {
                        localStorage.debug = namespaces
                    }
                } catch (e) {}
            }

            function load() {
                var r;
                try {
                    r = localStorage.debug
                } catch (e) {}
                return r
            }
            exports.enable(load())
        }, {
            "./debug": 23
        }],
        23: [function(_dereq_, module, exports) {
            exports = module.exports = debug;
            exports.coerce = coerce;
            exports.disable = disable;
            exports.enable = enable;
            exports.enabled = enabled;
            exports.humanize = _dereq_("ms");
            exports.names = [];
            exports.skips = [];
            exports.formatters = {};
            var prevColor = 0;
            var prevTime;

            function selectColor() {
                return exports.colors[prevColor++ % exports.colors.length]
            }

            function debug(namespace) {
                function disabled() {}
                disabled.enabled = false;

                function enabled() {
                    var self = enabled;
                    var curr = +new Date;
                    var ms = curr - (prevTime || curr);
                    self.diff = ms;
                    self.prev = prevTime;
                    self.curr = curr;
                    prevTime = curr;
                    if (null == self.useColors) self.useColors = exports.useColors();
                    if (null == self.color && self.useColors) self.color = selectColor();
                    var args = Array.prototype.slice.call(arguments);
                    args[0] = exports.coerce(args[0]);
                    if ("string" !== typeof args[0]) {
                        args = ["%o"].concat(args)
                    }
                    var index = 0;
                    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
                        if (match === "%") return match;
                        index++;
                        var formatter = exports.formatters[format];
                        if ("function" === typeof formatter) {
                            var val = args[index];
                            match = formatter.call(self, val);
                            args.splice(index, 1);
                            index--
                        }
                        return match
                    });
                    if ("function" === typeof exports.formatArgs) {
                        args = exports.formatArgs.apply(self, args)
                    }
                    var logFn = enabled.log || exports.log || console.log.bind(console);
                    logFn.apply(self, args)
                }
                enabled.enabled = true;
                var fn = exports.enabled(namespace) ? enabled : disabled;
                fn.namespace = namespace;
                return fn
            }

            function enable(namespaces) {
                exports.save(namespaces);
                var split = (namespaces || "").split(/[\s,]+/);
                var len = split.length;
                for (var i = 0; i < len; i++) {
                    if (!split[i]) continue;
                    namespaces = split[i].replace(/\*/g, ".*?");
                    if (namespaces[0] === "-") {
                        exports.skips.push(new RegExp("^" + namespaces.substr(1) + "$"))
                    } else {
                        exports.names.push(new RegExp("^" + namespaces + "$"))
                    }
                }
            }

            function disable() {
                exports.enable("")
            }

            function enabled(name) {
                var i, len;
                for (i = 0, len = exports.skips.length; i < len; i++) {
                    if (exports.skips[i].test(name)) {
                        return false
                    }
                }
                for (i = 0, len = exports.names.length; i < len; i++) {
                    if (exports.names[i].test(name)) {
                        return true
                    }
                }
                return false
            }

            function coerce(val) {
                if (val instanceof Error) return val.stack || val.message;
                return val
            }
        }, {
            ms: 24
        }],
        24: [function(_dereq_, module, exports) {
            var s = 1e3;
            var m = s * 60;
            var h = m * 60;
            var d = h * 24;
            var y = d * 365.25;
            module.exports = function(val, options) {
                options = options || {};
                if ("string" == typeof val) return parse(val);
                return options.long ? long(val) : short(val)
            };

            function parse(str) {
                var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
                if (!match) return;
                var n = parseFloat(match[1]);
                var type = (match[2] || "ms").toLowerCase();
                switch (type) {
                    case "years":
                    case "year":
                    case "y":
                        return n * y;
                    case "days":
                    case "day":
                    case "d":
                        return n * d;
                    case "hours":
                    case "hour":
                    case "h":
                        return n * h;
                    case "minutes":
                    case "minute":
                    case "m":
                        return n * m;
                    case "seconds":
                    case "second":
                    case "s":
                        return n * s;
                    case "ms":
                        return n
                }
            }

            function short(ms) {
                if (ms >= d) return Math.round(ms / d) + "d";
                if (ms >= h) return Math.round(ms / h) + "h";
                if (ms >= m) return Math.round(ms / m) + "m";
                if (ms >= s) return Math.round(ms / s) + "s";
                return ms + "ms"
            }

            function long(ms) {
                return plural(ms, d, "day") || plural(ms, h, "hour") || plural(ms, m, "minute") || plural(ms, s, "second") || ms + " ms"
            }

            function plural(ms, n, name) {
                if (ms < n) return;
                if (ms < n * 1.5) return Math.floor(ms / n) + " " + name;
                return Math.ceil(ms / n) + " " + name + "s"
            }
        }, {}],
        25: [function(_dereq_, module, exports) {
            (function(global) {
                var keys = _dereq_("./keys");
                var hasBinary = _dereq_("has-binary");
                var sliceBuffer = _dereq_("arraybuffer.slice");
                var base64encoder = _dereq_("base64-arraybuffer");
                var after = _dereq_("after");
                var utf8 = _dereq_("utf8");
                var isAndroid = navigator.userAgent.match(/Android/i);
                var isPhantomJS = /PhantomJS/i.test(navigator.userAgent);
                var dontSendBlobs = isAndroid || isPhantomJS;
                exports.protocol = 3;
                var packets = exports.packets = {
                    open: 0,
                    close: 1,
                    ping: 2,
                    pong: 3,
                    message: 4,
                    upgrade: 5,
                    noop: 6
                };
                var packetslist = keys(packets);
                var err = {
                    type: "error",
                    data: "parser error"
                };
                var Blob = _dereq_("blob");
                exports.encodePacket = function(packet, supportsBinary, utf8encode, callback) {
                    if ("function" == typeof supportsBinary) {
                        callback = supportsBinary;
                        supportsBinary = false
                    }
                    if ("function" == typeof utf8encode) {
                        callback = utf8encode;
                        utf8encode = null
                    }
                    var data = packet.data === undefined ? undefined : packet.data.buffer || packet.data;
                    if (global.ArrayBuffer && data instanceof ArrayBuffer) {
                        return encodeArrayBuffer(packet, supportsBinary, callback)
                    } else if (Blob && data instanceof global.Blob) {
                        return encodeBlob(packet, supportsBinary, callback)
                    }
                    if (data && data.base64) {
                        return encodeBase64Object(packet, callback)
                    }
                    var encoded = packets[packet.type];
                    if (undefined !== packet.data) {
                        encoded += utf8encode ? utf8.encode(String(packet.data)) : String(packet.data)
                    }
                    return callback("" + encoded)
                };

                function encodeBase64Object(packet, callback) {
                    var message = "b" + exports.packets[packet.type] + packet.data.data;
                    return callback(message)
                }

                function encodeArrayBuffer(packet, supportsBinary, callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, callback)
                    }
                    var data = packet.data;
                    var contentArray = new Uint8Array(data);
                    var resultBuffer = new Uint8Array(1 + data.byteLength);
                    resultBuffer[0] = packets[packet.type];
                    for (var i = 0; i < contentArray.length; i++) {
                        resultBuffer[i + 1] = contentArray[i]
                    }
                    return callback(resultBuffer.buffer)
                }

                function encodeBlobAsArrayBuffer(packet, supportsBinary, callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, callback)
                    }
                    var fr = new FileReader;
                    fr.onload = function() {
                        packet.data = fr.result;
                        exports.encodePacket(packet, supportsBinary, true, callback)
                    };
                    return fr.readAsArrayBuffer(packet.data)
                }

                function encodeBlob(packet, supportsBinary, callback) {
                    if (!supportsBinary) {
                        return exports.encodeBase64Packet(packet, callback)
                    }
                    if (dontSendBlobs) {
                        return encodeBlobAsArrayBuffer(packet, supportsBinary, callback)
                    }
                    var length = new Uint8Array(1);
                    length[0] = packets[packet.type];
                    var blob = new Blob([length.buffer, packet.data]);
                    return callback(blob)
                }
                exports.encodeBase64Packet = function(packet, callback) {
                    var message = "b" + exports.packets[packet.type];
                    if (Blob && packet.data instanceof Blob) {
                        var fr = new FileReader;
                        fr.onload = function() {
                            var b64 = fr.result.split(",")[1];
                            callback(message + b64)
                        };
                        return fr.readAsDataURL(packet.data)
                    }
                    var b64data;
                    try {
                        b64data = String.fromCharCode.apply(null, new Uint8Array(packet.data))
                    } catch (e) {
                        var typed = new Uint8Array(packet.data);
                        var basic = new Array(typed.length);
                        for (var i = 0; i < typed.length; i++) {
                            basic[i] = typed[i]
                        }
                        b64data = String.fromCharCode.apply(null, basic)
                    }
                    message += global.btoa(b64data);
                    return callback(message)
                };
                exports.decodePacket = function(data, binaryType, utf8decode) {
                    if (typeof data == "string" || data === undefined) {
                        if (data.charAt(0) == "b") {
                            return exports.decodeBase64Packet(data.substr(1), binaryType)
                        }
                        if (utf8decode) {
                            try {
                                data = utf8.decode(data)
                            } catch (e) {
                                return err
                            }
                        }
                        var type = data.charAt(0);
                        if (Number(type) != type || !packetslist[type]) {
                            return err
                        }
                        if (data.length > 1) {
                            return {
                                type: packetslist[type],
                                data: data.substring(1)
                            }
                        } else {
                            return {
                                type: packetslist[type]
                            }
                        }
                    }
                    var asArray = new Uint8Array(data);
                    var type = asArray[0];
                    var rest = sliceBuffer(data, 1);
                    if (Blob && binaryType === "blob") {
                        rest = new Blob([rest])
                    }
                    return {
                        type: packetslist[type],
                        data: rest
                    }
                };
                exports.decodeBase64Packet = function(msg, binaryType) {
                    var type = packetslist[msg.charAt(0)];
                    if (!global.ArrayBuffer) {
                        return {
                            type: type,
                            data: {
                                base64: true,
                                data: msg.substr(1)
                            }
                        }
                    }
                    var data = base64encoder.decode(msg.substr(1));
                    if (binaryType === "blob" && Blob) {
                        data = new Blob([data])
                    }
                    return {
                        type: type,
                        data: data
                    }
                };
                exports.encodePayload = function(packets, supportsBinary, callback) {
                    if (typeof supportsBinary == "function") {
                        callback = supportsBinary;
                        supportsBinary = null
                    }
                    var isBinary = hasBinary(packets);
                    if (supportsBinary && isBinary) {
                        if (Blob && !dontSendBlobs) {
                            return exports.encodePayloadAsBlob(packets, callback)
                        }
                        return exports.encodePayloadAsArrayBuffer(packets, callback)
                    }
                    if (!packets.length) {
                        return callback("0:")
                    }

                    function setLengthHeader(message) {
                        return message.length + ":" + message
                    }

                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, !isBinary ? false : supportsBinary, true, function(message) {
                            doneCallback(null, setLengthHeader(message))
                        })
                    }
                    map(packets, encodeOne, function(err, results) {
                        return callback(results.join(""))
                    })
                };

                function map(ary, each, done) {
                    var result = new Array(ary.length);
                    var next = after(ary.length, done);
                    var eachWithIndex = function(i, el, cb) {
                        each(el, function(error, msg) {
                            result[i] = msg;
                            cb(error, result)
                        })
                    };
                    for (var i = 0; i < ary.length; i++) {
                        eachWithIndex(i, ary[i], next)
                    }
                }
                exports.decodePayload = function(data, binaryType, callback) {
                    if (typeof data != "string") {
                        return exports.decodePayloadAsBinary(data, binaryType, callback)
                    }
                    if (typeof binaryType === "function") {
                        callback = binaryType;
                        binaryType = null
                    }
                    var packet;
                    if (data == "") {
                        return callback(err, 0, 1)
                    }
                    var length = "",
                        n, msg;
                    for (var i = 0, l = data.length; i < l; i++) {
                        var chr = data.charAt(i);
                        if (":" != chr) {
                            length += chr
                        } else {
                            if ("" == length || length != (n = Number(length))) {
                                return callback(err, 0, 1)
                            }
                            msg = data.substr(i + 1, n);
                            if (length != msg.length) {
                                return callback(err, 0, 1)
                            }
                            if (msg.length) {
                                packet = exports.decodePacket(msg, binaryType, true);
                                if (err.type == packet.type && err.data == packet.data) {
                                    return callback(err, 0, 1)
                                }
                                var ret = callback(packet, i + n, l);
                                if (false === ret) return
                            }
                            i += n;
                            length = ""
                        }
                    }
                    if (length != "") {
                        return callback(err, 0, 1)
                    }
                };
                exports.encodePayloadAsArrayBuffer = function(packets, callback) {
                    if (!packets.length) {
                        return callback(new ArrayBuffer(0))
                    }

                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, true, true, function(data) {
                            return doneCallback(null, data)
                        })
                    }
                    map(packets, encodeOne, function(err, encodedPackets) {
                        var totalLength = encodedPackets.reduce(function(acc, p) {
                            var len;
                            if (typeof p === "string") {
                                len = p.length
                            } else {
                                len = p.byteLength
                            }
                            return acc + len.toString().length + len + 2
                        }, 0);
                        var resultArray = new Uint8Array(totalLength);
                        var bufferIndex = 0;
                        encodedPackets.forEach(function(p) {
                            var isString = typeof p === "string";
                            var ab = p;
                            if (isString) {
                                var view = new Uint8Array(p.length);
                                for (var i = 0; i < p.length; i++) {
                                    view[i] = p.charCodeAt(i)
                                }
                                ab = view.buffer
                            }
                            if (isString) {
                                resultArray[bufferIndex++] = 0
                            } else {
                                resultArray[bufferIndex++] = 1
                            }
                            var lenStr = ab.byteLength.toString();
                            for (var i = 0; i < lenStr.length; i++) {
                                resultArray[bufferIndex++] = parseInt(lenStr[i])
                            }
                            resultArray[bufferIndex++] = 255;
                            var view = new Uint8Array(ab);
                            for (var i = 0; i < view.length; i++) {
                                resultArray[bufferIndex++] = view[i]
                            }
                        });
                        return callback(resultArray.buffer)
                    })
                };
                exports.encodePayloadAsBlob = function(packets, callback) {
                    function encodeOne(packet, doneCallback) {
                        exports.encodePacket(packet, true, true, function(encoded) {
                            var binaryIdentifier = new Uint8Array(1);
                            binaryIdentifier[0] = 1;
                            if (typeof encoded === "string") {
                                var view = new Uint8Array(encoded.length);
                                for (var i = 0; i < encoded.length; i++) {
                                    view[i] = encoded.charCodeAt(i)
                                }
                                encoded = view.buffer;
                                binaryIdentifier[0] = 0
                            }
                            var len = encoded instanceof ArrayBuffer ? encoded.byteLength : encoded.size;
                            var lenStr = len.toString();
                            var lengthAry = new Uint8Array(lenStr.length + 1);
                            for (var i = 0; i < lenStr.length; i++) {
                                lengthAry[i] = parseInt(lenStr[i])
                            }
                            lengthAry[lenStr.length] = 255;
                            if (Blob) {
                                var blob = new Blob([binaryIdentifier.buffer, lengthAry.buffer, encoded]);
                                doneCallback(null, blob)
                            }
                        })
                    }
                    map(packets, encodeOne, function(err, results) {
                        return callback(new Blob(results))
                    })
                };
                exports.decodePayloadAsBinary = function(data, binaryType, callback) {
                    if (typeof binaryType === "function") {
                        callback = binaryType;
                        binaryType = null
                    }
                    var bufferTail = data;
                    var buffers = [];
                    var numberTooLong = false;
                    while (bufferTail.byteLength > 0) {
                        var tailArray = new Uint8Array(bufferTail);
                        var isString = tailArray[0] === 0;
                        var msgLength = "";
                        for (var i = 1;; i++) {
                            if (tailArray[i] == 255) break;
                            if (msgLength.length > 310) {
                                numberTooLong = true;
                                break
                            }
                            msgLength += tailArray[i]
                        }
                        if (numberTooLong) return callback(err, 0, 1);
                        bufferTail = sliceBuffer(bufferTail, 2 + msgLength.length);
                        msgLength = parseInt(msgLength);
                        var msg = sliceBuffer(bufferTail, 0, msgLength);
                        if (isString) {
                            try {
                                msg = String.fromCharCode.apply(null, new Uint8Array(msg))
                            } catch (e) {
                                var typed = new Uint8Array(msg);
                                msg = "";
                                for (var i = 0; i < typed.length; i++) {
                                    msg += String.fromCharCode(typed[i])
                                }
                            }
                        }
                        buffers.push(msg);
                        bufferTail = sliceBuffer(bufferTail, msgLength)
                    }
                    var total = buffers.length;
                    buffers.forEach(function(buffer, i) {
                        callback(exports.decodePacket(buffer, binaryType, true), i, total)
                    })
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./keys": 26,
            after: 27,
            "arraybuffer.slice": 28,
            "base64-arraybuffer": 29,
            blob: 30,
            "has-binary": 36,
            utf8: 31
        }],
        26: [function(_dereq_, module, exports) {
            module.exports = Object.keys || function keys(obj) {
                var arr = [];
                var has = Object.prototype.hasOwnProperty;
                for (var i in obj) {
                    if (has.call(obj, i)) {
                        arr.push(i)
                    }
                }
                return arr
            }
        }, {}],
        27: [function(_dereq_, module, exports) {
            module.exports = after;

            function after(count, callback, err_cb) {
                var bail = false;
                err_cb = err_cb || noop;
                proxy.count = count;
                return count === 0 ? callback() : proxy;

                function proxy(err, result) {
                    if (proxy.count <= 0) {
                        throw new Error("after called too many times")
                    }--proxy.count;
                    if (err) {
                        bail = true;
                        callback(err);
                        callback = err_cb
                    } else if (proxy.count === 0 && !bail) {
                        callback(null, result)
                    }
                }
            }

            function noop() {}
        }, {}],
        28: [function(_dereq_, module, exports) {
            module.exports = function(arraybuffer, start, end) {
                var bytes = arraybuffer.byteLength;
                start = start || 0;
                end = end || bytes;
                if (arraybuffer.slice) {
                    return arraybuffer.slice(start, end)
                }
                if (start < 0) {
                    start += bytes
                }
                if (end < 0) {
                    end += bytes
                }
                if (end > bytes) {
                    end = bytes
                }
                if (start >= bytes || start >= end || bytes === 0) {
                    return new ArrayBuffer(0)
                }
                var abv = new Uint8Array(arraybuffer);
                var result = new Uint8Array(end - start);
                for (var i = start, ii = 0; i < end; i++, ii++) {
                    result[ii] = abv[i]
                }
                return result.buffer
            }
        }, {}],
        29: [function(_dereq_, module, exports) {
            (function(chars) {
                "use strict";
                exports.encode = function(arraybuffer) {
                    var bytes = new Uint8Array(arraybuffer),
                        i, len = bytes.length,
                        base64 = "";
                    for (i = 0; i < len; i += 3) {
                        base64 += chars[bytes[i] >> 2];
                        base64 += chars[(bytes[i] & 3) << 4 | bytes[i + 1] >> 4];
                        base64 += chars[(bytes[i + 1] & 15) << 2 | bytes[i + 2] >> 6];
                        base64 += chars[bytes[i + 2] & 63]
                    }
                    if (len % 3 === 2) {
                        base64 = base64.substring(0, base64.length - 1) + "="
                    } else if (len % 3 === 1) {
                        base64 = base64.substring(0, base64.length - 2) + "=="
                    }
                    return base64
                };
                exports.decode = function(base64) {
                    var bufferLength = base64.length * .75,
                        len = base64.length,
                        i, p = 0,
                        encoded1, encoded2, encoded3, encoded4;
                    if (base64[base64.length - 1] === "=") {
                        bufferLength--;
                        if (base64[base64.length - 2] === "=") {
                            bufferLength--
                        }
                    }
                    var arraybuffer = new ArrayBuffer(bufferLength),
                        bytes = new Uint8Array(arraybuffer);
                    for (i = 0; i < len; i += 4) {
                        encoded1 = chars.indexOf(base64[i]);
                        encoded2 = chars.indexOf(base64[i + 1]);
                        encoded3 = chars.indexOf(base64[i + 2]);
                        encoded4 = chars.indexOf(base64[i + 3]);
                        bytes[p++] = encoded1 << 2 | encoded2 >> 4;
                        bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
                        bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63
                    }
                    return arraybuffer
                }
            })("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
        }, {}],
        30: [function(_dereq_, module, exports) {
            (function(global) {
                var BlobBuilder = global.BlobBuilder || global.WebKitBlobBuilder || global.MSBlobBuilder || global.MozBlobBuilder;
                var blobSupported = function() {
                    try {
                        var a = new Blob(["hi"]);
                        return a.size === 2
                    } catch (e) {
                        return false
                    }
                }();
                var blobSupportsArrayBufferView = blobSupported && function() {
                    try {
                        var b = new Blob([new Uint8Array([1, 2])]);
                        return b.size === 2
                    } catch (e) {
                        return false
                    }
                }();
                var blobBuilderSupported = BlobBuilder && BlobBuilder.prototype.append && BlobBuilder.prototype.getBlob;

                function mapArrayBufferViews(ary) {
                    for (var i = 0; i < ary.length; i++) {
                        var chunk = ary[i];
                        if (chunk.buffer instanceof ArrayBuffer) {
                            var buf = chunk.buffer;
                            if (chunk.byteLength !== buf.byteLength) {
                                var copy = new Uint8Array(chunk.byteLength);
                                copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
                                buf = copy.buffer
                            }
                            ary[i] = buf
                        }
                    }
                }

                function BlobBuilderConstructor(ary, options) {
                    options = options || {};
                    var bb = new BlobBuilder;
                    mapArrayBufferViews(ary);
                    for (var i = 0; i < ary.length; i++) {
                        bb.append(ary[i])
                    }
                    return options.type ? bb.getBlob(options.type) : bb.getBlob()
                }

                function BlobConstructor(ary, options) {
                    mapArrayBufferViews(ary);
                    return new Blob(ary, options || {})
                }
                module.exports = function() {
                    if (blobSupported) {
                        return blobSupportsArrayBufferView ? global.Blob : BlobConstructor
                    } else if (blobBuilderSupported) {
                        return BlobBuilderConstructor
                    } else {
                        return undefined
                    }
                }()
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}],
        31: [function(_dereq_, module, exports) {
            (function(global) {
                (function(root) {
                    var freeExports = typeof exports == "object" && exports;
                    var freeModule = typeof module == "object" && module && module.exports == freeExports && module;
                    var freeGlobal = typeof global == "object" && global;
                    if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
                        root = freeGlobal
                    }
                    var stringFromCharCode = String.fromCharCode;

                    function ucs2decode(string) {
                        var output = [];
                        var counter = 0;
                        var length = string.length;
                        var value;
                        var extra;
                        while (counter < length) {
                            value = string.charCodeAt(counter++);
                            if (value >= 55296 && value <= 56319 && counter < length) {
                                extra = string.charCodeAt(counter++);
                                if ((extra & 64512) == 56320) {
                                    output.push(((value & 1023) << 10) + (extra & 1023) + 65536)
                                } else {
                                    output.push(value);
                                    counter--
                                }
                            } else {
                                output.push(value)
                            }
                        }
                        return output
                    }

                    function ucs2encode(array) {
                        var length = array.length;
                        var index = -1;
                        var value;
                        var output = "";
                        while (++index < length) {
                            value = array[index];
                            if (value > 65535) {
                                value -= 65536;
                                output += stringFromCharCode(value >>> 10 & 1023 | 55296);
                                value = 56320 | value & 1023
                            }
                            output += stringFromCharCode(value)
                        }
                        return output
                    }

                    function checkScalarValue(codePoint) {
                        if (codePoint >= 55296 && codePoint <= 57343) {
                            throw Error("Lone surrogate U+" + codePoint.toString(16).toUpperCase() + " is not a scalar value")
                        }
                    }

                    function createByte(codePoint, shift) {
                        return stringFromCharCode(codePoint >> shift & 63 | 128)
                    }

                    function encodeCodePoint(codePoint) {
                        if ((codePoint & 4294967168) == 0) {
                            return stringFromCharCode(codePoint)
                        }
                        var symbol = "";
                        if ((codePoint & 4294965248) == 0) {
                            symbol = stringFromCharCode(codePoint >> 6 & 31 | 192)
                        } else if ((codePoint & 4294901760) == 0) {
                            checkScalarValue(codePoint);
                            symbol = stringFromCharCode(codePoint >> 12 & 15 | 224);
                            symbol += createByte(codePoint, 6)
                        } else if ((codePoint & 4292870144) == 0) {
                            symbol = stringFromCharCode(codePoint >> 18 & 7 | 240);
                            symbol += createByte(codePoint, 12);
                            symbol += createByte(codePoint, 6)
                        }
                        symbol += stringFromCharCode(codePoint & 63 | 128);
                        return symbol
                    }

                    function utf8encode(string) {
                        var codePoints = ucs2decode(string);
                        var length = codePoints.length;
                        var index = -1;
                        var codePoint;
                        var byteString = "";
                        while (++index < length) {
                            codePoint = codePoints[index];
                            byteString += encodeCodePoint(codePoint)
                        }
                        return byteString
                    }

                    function readContinuationByte() {
                        if (byteIndex >= byteCount) {
                            throw Error("Invalid byte index")
                        }
                        var continuationByte = byteArray[byteIndex] & 255;
                        byteIndex++;
                        if ((continuationByte & 192) == 128) {
                            return continuationByte & 63
                        }
                        throw Error("Invalid continuation byte")
                    }

                    function decodeSymbol() {
                        var byte1;
                        var byte2;
                        var byte3;
                        var byte4;
                        var codePoint;
                        if (byteIndex > byteCount) {
                            throw Error("Invalid byte index")
                        }
                        if (byteIndex == byteCount) {
                            return false
                        }
                        byte1 = byteArray[byteIndex] & 255;
                        byteIndex++;
                        if ((byte1 & 128) == 0) {
                            return byte1
                        }
                        if ((byte1 & 224) == 192) {
                            var byte2 = readContinuationByte();
                            codePoint = (byte1 & 31) << 6 | byte2;
                            if (codePoint >= 128) {
                                return codePoint
                            } else {
                                throw Error("Invalid continuation byte")
                            }
                        }
                        if ((byte1 & 240) == 224) {
                            byte2 = readContinuationByte();
                            byte3 = readContinuationByte();
                            codePoint = (byte1 & 15) << 12 | byte2 << 6 | byte3;
                            if (codePoint >= 2048) {
                                checkScalarValue(codePoint);
                                return codePoint
                            } else {
                                throw Error("Invalid continuation byte")
                            }
                        }
                        if ((byte1 & 248) == 240) {
                            byte2 = readContinuationByte();
                            byte3 = readContinuationByte();
                            byte4 = readContinuationByte();
                            codePoint = (byte1 & 15) << 18 | byte2 << 12 | byte3 << 6 | byte4;
                            if (codePoint >= 65536 && codePoint <= 1114111) {
                                return codePoint
                            }
                        }
                        throw Error("Invalid UTF-8 detected")
                    }
                    var byteArray;
                    var byteCount;
                    var byteIndex;

                    function utf8decode(byteString) {
                        byteArray = ucs2decode(byteString);
                        byteCount = byteArray.length;
                        byteIndex = 0;
                        var codePoints = [];
                        var tmp;
                        while ((tmp = decodeSymbol()) !== false) {
                            codePoints.push(tmp)
                        }
                        return ucs2encode(codePoints)
                    }
                    var utf8 = {
                        version: "2.0.0",
                        encode: utf8encode,
                        decode: utf8decode
                    };
                    if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
                        define(function() {
                            return utf8
                        })
                    } else if (freeExports && !freeExports.nodeType) {
                        if (freeModule) {
                            freeModule.exports = utf8
                        } else {
                            var object = {};
                            var hasOwnProperty = object.hasOwnProperty;
                            for (var key in utf8) {
                                hasOwnProperty.call(utf8, key) && (freeExports[key] = utf8[key])
                            }
                        }
                    } else {
                        root.utf8 = utf8
                    }
                })(this)
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}],
        32: [function(_dereq_, module, exports) {
            (function(global) {
                var rvalidchars = /^[\],:{}\s]*$/;
                var rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
                var rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
                var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
                var rtrimLeft = /^\s+/;
                var rtrimRight = /\s+$/;
                module.exports = function parsejson(data) {
                    if ("string" != typeof data || !data) {
                        return null
                    }
                    data = data.replace(rtrimLeft, "").replace(rtrimRight, "");
                    if (global.JSON && JSON.parse) {
                        return JSON.parse(data)
                    }
                    if (rvalidchars.test(data.replace(rvalidescape, "@").replace(rvalidtokens, "]").replace(rvalidbraces, ""))) {
                        return new Function("return " + data)()
                    }
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}],
        33: [function(_dereq_, module, exports) {
            exports.encode = function(obj) {
                var str = "";
                for (var i in obj) {
                    if (obj.hasOwnProperty(i)) {
                        if (str.length) str += "&";
                        str += encodeURIComponent(i) + "=" + encodeURIComponent(obj[i])
                    }
                }
                return str
            };
            exports.decode = function(qs) {
                var qry = {};
                var pairs = qs.split("&");
                for (var i = 0, l = pairs.length; i < l; i++) {
                    var pair = pairs[i].split("=");
                    qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
                }
                return qry
            }
        }, {}],
        34: [function(_dereq_, module, exports) {
            var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
            var parts = ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"];
            module.exports = function parseuri(str) {
                var src = str,
                    b = str.indexOf("["),
                    e = str.indexOf("]");
                if (b != -1 && e != -1) {
                    str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ";") + str.substring(e, str.length)
                }
                var m = re.exec(str || ""),
                    uri = {},
                    i = 14;
                while (i--) {
                    uri[parts[i]] = m[i] || ""
                }
                if (b != -1 && e != -1) {
                    uri.source = src;
                    uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ":");
                    uri.authority = uri.authority.replace("[", "").replace("]", "").replace(/;/g, ":");
                    uri.ipv6uri = true
                }
                return uri
            }
        }, {}],
        35: [function(_dereq_, module, exports) {
            var global = function() {
                return this
            }();
            var WebSocket = global.WebSocket || global.MozWebSocket;
            module.exports = WebSocket ? ws : null;

            function ws(uri, protocols, opts) {
                var instance;
                if (protocols) {
                    instance = new WebSocket(uri, protocols)
                } else {
                    instance = new WebSocket(uri)
                }
                return instance
            }
            if (WebSocket) ws.prototype = WebSocket.prototype
        }, {}],
        36: [function(_dereq_, module, exports) {
            (function(global) {
                var isArray = _dereq_("isarray");
                module.exports = hasBinary;

                function hasBinary(data) {
                    function _hasBinary(obj) {
                        if (!obj) return false;
                        if (global.Buffer && global.Buffer.isBuffer(obj) || global.ArrayBuffer && obj instanceof ArrayBuffer || global.Blob && obj instanceof Blob || global.File && obj instanceof File) {
                            return true
                        }
                        if (isArray(obj)) {
                            for (var i = 0; i < obj.length; i++) {
                                if (_hasBinary(obj[i])) {
                                    return true
                                }
                            }
                        } else if (obj && "object" == typeof obj) {
                            if (obj.toJSON) {
                                obj = obj.toJSON()
                            }
                            for (var key in obj) {
                                if (Object.prototype.hasOwnProperty.call(obj, key) && _hasBinary(obj[key])) {
                                    return true
                                }
                            }
                        }
                        return false
                    }
                    return _hasBinary(data)
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            isarray: 37
        }],
        37: [function(_dereq_, module, exports) {
            module.exports = Array.isArray || function(arr) {
                return Object.prototype.toString.call(arr) == "[object Array]"
            }
        }, {}],
        38: [function(_dereq_, module, exports) {
            var global = _dereq_("global");
            try {
                module.exports = "XMLHttpRequest" in global && "withCredentials" in new global.XMLHttpRequest
            } catch (err) {
                module.exports = false
            }
        }, {
            global: 39
        }],
        39: [function(_dereq_, module, exports) {
            module.exports = function() {
                return this
            }()
        }, {}],
        40: [function(_dereq_, module, exports) {
            var indexOf = [].indexOf;
            module.exports = function(arr, obj) {
                if (indexOf) return arr.indexOf(obj);
                for (var i = 0; i < arr.length; ++i) {
                    if (arr[i] === obj) return i
                }
                return -1
            }
        }, {}],
        41: [function(_dereq_, module, exports) {
            var has = Object.prototype.hasOwnProperty;
            exports.keys = Object.keys || function(obj) {
                var keys = [];
                for (var key in obj) {
                    if (has.call(obj, key)) {
                        keys.push(key)
                    }
                }
                return keys
            };
            exports.values = function(obj) {
                var vals = [];
                for (var key in obj) {
                    if (has.call(obj, key)) {
                        vals.push(obj[key])
                    }
                }
                return vals
            };
            exports.merge = function(a, b) {
                for (var key in b) {
                    if (has.call(b, key)) {
                        a[key] = b[key]
                    }
                }
                return a
            };
            exports.length = function(obj) {
                return exports.keys(obj).length
            };
            exports.isEmpty = function(obj) {
                return 0 == exports.length(obj)
            }
        }, {}],
        42: [function(_dereq_, module, exports) {
            var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
            var parts = ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"];
            module.exports = function parseuri(str) {
                var m = re.exec(str || ""),
                    uri = {},
                    i = 14;
                while (i--) {
                    uri[parts[i]] = m[i] || ""
                }
                return uri
            }
        }, {}],
        43: [function(_dereq_, module, exports) {
            (function(global) {
                var isArray = _dereq_("isarray");
                var isBuf = _dereq_("./is-buffer");
                exports.deconstructPacket = function(packet) {
                    var buffers = [];
                    var packetData = packet.data;

                    function _deconstructPacket(data) {
                        if (!data) return data;
                        if (isBuf(data)) {
                            var placeholder = {
                                _placeholder: true,
                                num: buffers.length
                            };
                            buffers.push(data);
                            return placeholder
                        } else if (isArray(data)) {
                            var newData = new Array(data.length);
                            for (var i = 0; i < data.length; i++) {
                                newData[i] = _deconstructPacket(data[i])
                            }
                            return newData
                        } else if ("object" == typeof data && !(data instanceof Date)) {
                            var newData = {};
                            for (var key in data) {
                                newData[key] = _deconstructPacket(data[key])
                            }
                            return newData
                        }
                        return data
                    }
                    var pack = packet;
                    pack.data = _deconstructPacket(packetData);
                    pack.attachments = buffers.length;
                    return {
                        packet: pack,
                        buffers: buffers
                    }
                };
                exports.reconstructPacket = function(packet, buffers) {
                    var curPlaceHolder = 0;

                    function _reconstructPacket(data) {
                        if (data && data._placeholder) {
                            var buf = buffers[data.num];
                            return buf
                        } else if (isArray(data)) {
                            for (var i = 0; i < data.length; i++) {
                                data[i] = _reconstructPacket(data[i])
                            }
                            return data
                        } else if (data && "object" == typeof data) {
                            for (var key in data) {
                                data[key] = _reconstructPacket(data[key])
                            }
                            return data
                        }
                        return data
                    }
                    packet.data = _reconstructPacket(packet.data);
                    packet.attachments = undefined;
                    return packet
                };
                exports.removeBlobs = function(data, callback) {
                    function _removeBlobs(obj, curKey, containingObject) {
                        if (!obj) return obj;
                        if (global.Blob && obj instanceof Blob || global.File && obj instanceof File) {
                            pendingBlobs++;
                            var fileReader = new FileReader;
                            fileReader.onload = function() {
                                if (containingObject) {
                                    containingObject[curKey] = this.result
                                } else {
                                    bloblessData = this.result
                                }
                                if (!--pendingBlobs) {
                                    callback(bloblessData)
                                }
                            };
                            fileReader.readAsArrayBuffer(obj)
                        } else if (isArray(obj)) {
                            for (var i = 0; i < obj.length; i++) {
                                _removeBlobs(obj[i], i, obj)
                            }
                        } else if (obj && "object" == typeof obj && !isBuf(obj)) {
                            for (var key in obj) {
                                _removeBlobs(obj[key], key, obj)
                            }
                        }
                    }
                    var pendingBlobs = 0;
                    var bloblessData = data;
                    _removeBlobs(bloblessData);
                    if (!pendingBlobs) {
                        callback(bloblessData)
                    }
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {
            "./is-buffer": 45,
            isarray: 46
        }],
        44: [function(_dereq_, module, exports) {
            var debug = _dereq_("debug")("socket.io-parser");
            var json = _dereq_("json3");
            var isArray = _dereq_("isarray");
            var Emitter = _dereq_("component-emitter");
            var binary = _dereq_("./binary");
            var isBuf = _dereq_("./is-buffer");
            exports.protocol = 4;
            exports.types = ["CONNECT", "DISCONNECT", "EVENT", "BINARY_EVENT", "ACK", "BINARY_ACK", "ERROR"];
            exports.CONNECT = 0;
            exports.DISCONNECT = 1;
            exports.EVENT = 2;
            exports.ACK = 3;
            exports.ERROR = 4;
            exports.BINARY_EVENT = 5;
            exports.BINARY_ACK = 6;
            exports.Encoder = Encoder;
            exports.Decoder = Decoder;

            function Encoder() {}
            Encoder.prototype.encode = function(obj, callback) {
                debug("encoding packet %j", obj);
                if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
                    encodeAsBinary(obj, callback)
                } else {
                    var encoding = encodeAsString(obj);
                    callback([encoding])
                }
            };

            function encodeAsString(obj) {
                var str = "";
                var nsp = false;
                str += obj.type;
                if (exports.BINARY_EVENT == obj.type || exports.BINARY_ACK == obj.type) {
                    str += obj.attachments;
                    str += "-"
                }
                if (obj.nsp && "/" != obj.nsp) {
                    nsp = true;
                    str += obj.nsp
                }
                if (null != obj.id) {
                    if (nsp) {
                        str += ",";
                        nsp = false
                    }
                    str += obj.id
                }
                if (null != obj.data) {
                    if (nsp) str += ",";
                    str += json.stringify(obj.data)
                }
                debug("encoded %j as %s", obj, str);
                return str
            }

            function encodeAsBinary(obj, callback) {
                function writeEncoding(bloblessData) {
                    var deconstruction = binary.deconstructPacket(bloblessData);
                    var pack = encodeAsString(deconstruction.packet);
                    var buffers = deconstruction.buffers;
                    buffers.unshift(pack);
                    callback(buffers)
                }
                binary.removeBlobs(obj, writeEncoding)
            }

            function Decoder() {
                this.reconstructor = null
            }
            Emitter(Decoder.prototype);
            Decoder.prototype.add = function(obj) {
                var packet;
                if ("string" == typeof obj) {
                    packet = decodeString(obj);
                    if (exports.BINARY_EVENT == packet.type || exports.BINARY_ACK == packet.type) {
                        this.reconstructor = new BinaryReconstructor(packet);
                        if (this.reconstructor.reconPack.attachments === 0) {
                            this.emit("decoded", packet)
                        }
                    } else {
                        this.emit("decoded", packet)
                    }
                } else if (isBuf(obj) || obj.base64) {
                    if (!this.reconstructor) {
                        throw new Error("got binary data when not reconstructing a packet")
                    } else {
                        packet = this.reconstructor.takeBinaryData(obj);
                        if (packet) {
                            this.reconstructor = null;
                            this.emit("decoded", packet)
                        }
                    }
                } else {
                    throw new Error("Unknown type: " + obj)
                }
            };

            function decodeString(str) {
                var p = {};
                var i = 0;
                p.type = Number(str.charAt(0));
                if (null == exports.types[p.type]) return error();
                if (exports.BINARY_EVENT == p.type || exports.BINARY_ACK == p.type) {
                    var buf = "";
                    while (str.charAt(++i) != "-") {
                        buf += str.charAt(i);
                        if (i == str.length) break
                    }
                    if (buf != Number(buf) || str.charAt(i) != "-") {
                        throw new Error("Illegal attachments")
                    }
                    p.attachments = Number(buf)
                }
                if ("/" == str.charAt(i + 1)) {
                    p.nsp = "";
                    while (++i) {
                        var c = str.charAt(i);
                        if ("," == c) break;
                        p.nsp += c;
                        if (i == str.length) break
                    }
                } else {
                    p.nsp = "/"
                }
                var next = str.charAt(i + 1);
                if ("" !== next && Number(next) == next) {
                    p.id = "";
                    while (++i) {
                        var c = str.charAt(i);
                        if (null == c || Number(c) != c) {
                            --i;
                            break
                        }
                        p.id += str.charAt(i);
                        if (i == str.length) break
                    }
                    p.id = Number(p.id)
                }
                if (str.charAt(++i)) {
                    try {
                        p.data = json.parse(str.substr(i))
                    } catch (e) {
                        return error()
                    }
                }
                debug("decoded %s as %j", str, p);
                return p
            }
            Decoder.prototype.destroy = function() {
                if (this.reconstructor) {
                    this.reconstructor.finishedReconstruction()
                }
            };

            function BinaryReconstructor(packet) {
                this.reconPack = packet;
                this.buffers = []
            }
            BinaryReconstructor.prototype.takeBinaryData = function(binData) {
                this.buffers.push(binData);
                if (this.buffers.length == this.reconPack.attachments) {
                    var packet = binary.reconstructPacket(this.reconPack, this.buffers);
                    this.finishedReconstruction();
                    return packet
                }
                return null
            };
            BinaryReconstructor.prototype.finishedReconstruction = function() {
                this.reconPack = null;
                this.buffers = []
            };

            function error(data) {
                return {
                    type: exports.ERROR,
                    data: "parser error"
                }
            }
        }, {
            "./binary": 43,
            "./is-buffer": 45,
            "component-emitter": 9,
            debug: 10,
            isarray: 46,
            json3: 47
        }],
        45: [function(_dereq_, module, exports) {
            (function(global) {
                module.exports = isBuf;

                function isBuf(obj) {
                    return global.Buffer && global.Buffer.isBuffer(obj) || global.ArrayBuffer && obj instanceof ArrayBuffer
                }
            }).call(this, typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
        }, {}],
        46: [function(_dereq_, module, exports) {
            module.exports = _dereq_(37)
        }, {}],
        47: [function(_dereq_, module, exports) {
            (function(window) {
                var getClass = {}.toString,
                    isProperty, forEach, undef;
                var isLoader = typeof define === "function" && define.amd;
                var nativeJSON = typeof JSON == "object" && JSON;
                var JSON3 = typeof exports == "object" && exports && !exports.nodeType && exports;
                if (JSON3 && nativeJSON) {
                    JSON3.stringify = nativeJSON.stringify;
                    JSON3.parse = nativeJSON.parse
                } else {
                    JSON3 = window.JSON = nativeJSON || {}
                }
                var isExtended = new Date(-0xc782b5b800cec);
                try {
                    isExtended = isExtended.getUTCFullYear() == -109252 && isExtended.getUTCMonth() === 0 && isExtended.getUTCDate() === 1 && isExtended.getUTCHours() == 10 && isExtended.getUTCMinutes() == 37 && isExtended.getUTCSeconds() == 6 && isExtended.getUTCMilliseconds() == 708
                } catch (exception) {}

                function has(name) {
                    if (has[name] !== undef) {
                        return has[name]
                    }
                    var isSupported;
                    if (name == "bug-string-char-index") {
                        isSupported = "a" [0] != "a"
                    } else if (name == "json") {
                        isSupported = has("json-stringify") && has("json-parse")
                    } else {
                        var value, serialized = '{"a":[1,true,false,null,"\\u0000\\b\\n\\f\\r\\t"]}';
                        if (name == "json-stringify") {
                            var stringify = JSON3.stringify,
                                stringifySupported = typeof stringify == "function" && isExtended;
                            if (stringifySupported) {
                                (value = function() {
                                    return 1
                                }).toJSON = value;
                                try {
                                    stringifySupported = stringify(0) === "0" && stringify(new Number) === "0" && stringify(new String) == '""' && stringify(getClass) === undef && stringify(undef) === undef && stringify() === undef && stringify(value) === "1" && stringify([value]) == "[1]" && stringify([undef]) == "[null]" && stringify(null) == "null" && stringify([undef, getClass, null]) == "[null,null,null]" && stringify({
                                        a: [value, true, false, null, "\x00\b\n\f\r	"]
                                    }) == serialized && stringify(null, value) === "1" && stringify([1, 2], null, 1) == "[\n 1,\n 2\n]" && stringify(new Date(-864e13)) == '"-271821-04-20T00:00:00.000Z"' && stringify(new Date(864e13)) == '"+275760-09-13T00:00:00.000Z"' && stringify(new Date(-621987552e5)) == '"-000001-01-01T00:00:00.000Z"' && stringify(new Date(-1)) == '"1969-12-31T23:59:59.999Z"'
                                } catch (exception) {
                                    stringifySupported = false
                                }
                            }
                            isSupported = stringifySupported
                        }
                        if (name == "json-parse") {
                            var parse = JSON3.parse;
                            if (typeof parse == "function") {
                                try {
                                    if (parse("0") === 0 && !parse(false)) {
                                        value = parse(serialized);
                                        var parseSupported = value["a"].length == 5 && value["a"][0] === 1;
                                        if (parseSupported) {
                                            try {
                                                parseSupported = !parse('"	"')
                                            } catch (exception) {}
                                            if (parseSupported) {
                                                try {
                                                    parseSupported = parse("01") !== 1
                                                } catch (exception) {}
                                            }
                                            if (parseSupported) {
                                                try {
                                                    parseSupported = parse("1.") !== 1
                                                } catch (exception) {}
                                            }
                                        }
                                    }
                                } catch (exception) {
                                    parseSupported = false
                                }
                            }
                            isSupported = parseSupported
                        }
                    }
                    return has[name] = !!isSupported
                }
                if (!has("json")) {
                    var functionClass = "[object Function]";
                    var dateClass = "[object Date]";
                    var numberClass = "[object Number]";
                    var stringClass = "[object String]";
                    var arrayClass = "[object Array]";
                    var booleanClass = "[object Boolean]";
                    var charIndexBuggy = has("bug-string-char-index");
                    if (!isExtended) {
                        var floor = Math.floor;
                        var Months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
                        var getDay = function(year, month) {
                            return Months[month] + 365 * (year - 1970) + floor((year - 1969 + (month = +(month > 1))) / 4) - floor((year - 1901 + month) / 100) + floor((year - 1601 + month) / 400)
                        }
                    }
                    if (!(isProperty = {}.hasOwnProperty)) {
                        isProperty = function(property) {
                            var members = {},
                                constructor;
                            if ((members.__proto__ = null, members.__proto__ = {
                                    toString: 1
                                }, members).toString != getClass) {
                                isProperty = function(property) {
                                    var original = this.__proto__,
                                        result = property in (this.__proto__ = null, this);
                                    this.__proto__ = original;
                                    return result
                                }
                            } else {
                                constructor = members.constructor;
                                isProperty = function(property) {
                                    var parent = (this.constructor || constructor).prototype;
                                    return property in this && !(property in parent && this[property] === parent[property])
                                }
                            }
                            members = null;
                            return isProperty.call(this, property)
                        }
                    }
                    var PrimitiveTypes = {
                        "boolean": 1,
                        number: 1,
                        string: 1,
                        undefined: 1
                    };
                    var isHostType = function(object, property) {
                        var type = typeof object[property];
                        return type == "object" ? !!object[property] : !PrimitiveTypes[type]
                    };
                    forEach = function(object, callback) {
                        var size = 0,
                            Properties, members, property;
                        (Properties = function() {
                            this.valueOf = 0
                        }).prototype.valueOf = 0;
                        members = new Properties;
                        for (property in members) {
                            if (isProperty.call(members, property)) {
                                size++
                            }
                        }
                        Properties = members = null;
                        if (!size) {
                            members = ["valueOf", "toString", "toLocaleString", "propertyIsEnumerable", "isPrototypeOf", "hasOwnProperty", "constructor"];
                            forEach = function(object, callback) {
                                var isFunction = getClass.call(object) == functionClass,
                                    property, length;
                                var hasProperty = !isFunction && typeof object.constructor != "function" && isHostType(object, "hasOwnProperty") ? object.hasOwnProperty : isProperty;
                                for (property in object) {
                                    if (!(isFunction && property == "prototype") && hasProperty.call(object, property)) {
                                        callback(property)
                                    }
                                }
                                for (length = members.length; property = members[--length]; hasProperty.call(object, property) && callback(property));
                            }
                        } else if (size == 2) {
                            forEach = function(object, callback) {
                                var members = {},
                                    isFunction = getClass.call(object) == functionClass,
                                    property;
                                for (property in object) {
                                    if (!(isFunction && property == "prototype") && !isProperty.call(members, property) && (members[property] = 1) && isProperty.call(object, property)) {
                                        callback(property)
                                    }
                                }
                            }
                        } else {
                            forEach = function(object, callback) {
                                var isFunction = getClass.call(object) == functionClass,
                                    property, isConstructor;
                                for (property in object) {
                                    if (!(isFunction && property == "prototype") && isProperty.call(object, property) && !(isConstructor = property === "constructor")) {
                                        callback(property)
                                    }
                                }
                                if (isConstructor || isProperty.call(object, property = "constructor")) {
                                    callback(property)
                                }
                            }
                        }
                        return forEach(object, callback)
                    };
                    if (!has("json-stringify")) {
                        var Escapes = {
                            92: "\\\\",
                            34: '\\"',
                            8: "\\b",
                            12: "\\f",
                            10: "\\n",
                            13: "\\r",
                            9: "\\t"
                        };
                        var leadingZeroes = "000000";
                        var toPaddedString = function(width, value) {
                            return (leadingZeroes + (value || 0)).slice(-width)
                        };
                        var unicodePrefix = "\\u00";
                        var quote = function(value) {
                            var result = '"',
                                index = 0,
                                length = value.length,
                                isLarge = length > 10 && charIndexBuggy,
                                symbols;
                            if (isLarge) {
                                symbols = value.split("")
                            }
                            for (; index < length; index++) {
                                var charCode = value.charCodeAt(index);
                                switch (charCode) {
                                    case 8:
                                    case 9:
                                    case 10:
                                    case 12:
                                    case 13:
                                    case 34:
                                    case 92:
                                        result += Escapes[charCode];
                                        break;
                                    default:
                                        if (charCode < 32) {
                                            result += unicodePrefix + toPaddedString(2, charCode.toString(16));
                                            break
                                        }
                                        result += isLarge ? symbols[index] : charIndexBuggy ? value.charAt(index) : value[index]
                                }
                            }
                            return result + '"'
                        };
                        var serialize = function(property, object, callback, properties, whitespace, indentation, stack) {
                            var value, className, year, month, date, time, hours, minutes, seconds, milliseconds, results, element, index, length, prefix, result;
                            try {
                                value = object[property]
                            } catch (exception) {}
                            if (typeof value == "object" && value) {
                                className = getClass.call(value);
                                if (className == dateClass && !isProperty.call(value, "toJSON")) {
                                    if (value > -1 / 0 && value < 1 / 0) {
                                        if (getDay) {
                                            date = floor(value / 864e5);
                                            for (year = floor(date / 365.2425) + 1970 - 1; getDay(year + 1, 0) <= date; year++);
                                            for (month = floor((date - getDay(year, 0)) / 30.42); getDay(year, month + 1) <= date; month++);
                                            date = 1 + date - getDay(year, month);
                                            time = (value % 864e5 + 864e5) % 864e5;
                                            hours = floor(time / 36e5) % 24;
                                            minutes = floor(time / 6e4) % 60;
                                            seconds = floor(time / 1e3) % 60;
                                            milliseconds = time % 1e3
                                        } else {
                                            year = value.getUTCFullYear();
                                            month = value.getUTCMonth();
                                            date = value.getUTCDate();
                                            hours = value.getUTCHours();
                                            minutes = value.getUTCMinutes();
                                            seconds = value.getUTCSeconds();
                                            milliseconds = value.getUTCMilliseconds()
                                        }
                                        value = (year <= 0 || year >= 1e4 ? (year < 0 ? "-" : "+") + toPaddedString(6, year < 0 ? -year : year) : toPaddedString(4, year)) + "-" + toPaddedString(2, month + 1) + "-" + toPaddedString(2, date) + "T" + toPaddedString(2, hours) + ":" + toPaddedString(2, minutes) + ":" + toPaddedString(2, seconds) + "." + toPaddedString(3, milliseconds) + "Z"
                                    } else {
                                        value = null
                                    }
                                } else if (typeof value.toJSON == "function" && (className != numberClass && className != stringClass && className != arrayClass || isProperty.call(value, "toJSON"))) {
                                    value = value.toJSON(property)
                                }
                            }
                            if (callback) {
                                value = callback.call(object, property, value)
                            }
                            if (value === null) {
                                return "null"
                            }
                            className = getClass.call(value);
                            if (className == booleanClass) {
                                return "" + value
                            } else if (className == numberClass) {
                                return value > -1 / 0 && value < 1 / 0 ? "" + value : "null"
                            } else if (className == stringClass) {
                                return quote("" + value)
                            }
                            if (typeof value == "object") {
                                for (length = stack.length; length--;) {
                                    if (stack[length] === value) {
                                        throw TypeError()
                                    }
                                }
                                stack.push(value);
                                results = [];
                                prefix = indentation;
                                indentation += whitespace;
                                if (className == arrayClass) {
                                    for (index = 0, length = value.length; index < length; index++) {
                                        element = serialize(index, value, callback, properties, whitespace, indentation, stack);
                                        results.push(element === undef ? "null" : element)
                                    }
                                    result = results.length ? whitespace ? "[\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "]" : "[" + results.join(",") + "]" : "[]"
                                } else {
                                    forEach(properties || value, function(property) {
                                        var element = serialize(property, value, callback, properties, whitespace, indentation, stack);
                                        if (element !== undef) {
                                            results.push(quote(property) + ":" + (whitespace ? " " : "") + element)
                                        }
                                    });
                                    result = results.length ? whitespace ? "{\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "}" : "{" + results.join(",") + "}" : "{}"
                                }
                                stack.pop();
                                return result
                            }
                        };
                        JSON3.stringify = function(source, filter, width) {
                            var whitespace, callback, properties, className;
                            if (typeof filter == "function" || typeof filter == "object" && filter) {
                                if ((className = getClass.call(filter)) == functionClass) {
                                    callback = filter
                                } else if (className == arrayClass) {
                                    properties = {};
                                    for (var index = 0, length = filter.length, value; index < length; value = filter[index++], (className = getClass.call(value), className == stringClass || className == numberClass) && (properties[value] = 1));
                                }
                            }
                            if (width) {
                                if ((className = getClass.call(width)) == numberClass) {
                                    if ((width -= width % 1) > 0) {
                                        for (whitespace = "", width > 10 && (width = 10); whitespace.length < width; whitespace += " ");
                                    }
                                } else if (className == stringClass) {
                                    whitespace = width.length <= 10 ? width : width.slice(0, 10)
                                }
                            }
                            return serialize("", (value = {}, value[""] = source, value), callback, properties, whitespace, "", [])
                        }
                    }
                    if (!has("json-parse")) {
                        var fromCharCode = String.fromCharCode;
                        var Unescapes = {
                            92: "\\",
                            34: '"',
                            47: "/",
                            98: "\b",
                            116: "	",
                            110: "\n",
                            102: "\f",
                            114: "\r"
                        };
                        var Index, Source;
                        var abort = function() {
                            Index = Source = null;
                            throw SyntaxError()
                        };
                        var lex = function() {
                            var source = Source,
                                length = source.length,
                                value, begin, position, isSigned, charCode;
                            while (Index < length) {
                                charCode = source.charCodeAt(Index);
                                switch (charCode) {
                                    case 9:
                                    case 10:
                                    case 13:
                                    case 32:
                                        Index++;
                                        break;
                                    case 123:
                                    case 125:
                                    case 91:
                                    case 93:
                                    case 58:
                                    case 44:
                                        value = charIndexBuggy ? source.charAt(Index) : source[Index];
                                        Index++;
                                        return value;
                                    case 34:
                                        for (value = "@", Index++; Index < length;) {
                                            charCode = source.charCodeAt(Index);
                                            if (charCode < 32) {
                                                abort()
                                            } else if (charCode == 92) {
                                                charCode = source.charCodeAt(++Index);
                                                switch (charCode) {
                                                    case 92:
                                                    case 34:
                                                    case 47:
                                                    case 98:
                                                    case 116:
                                                    case 110:
                                                    case 102:
                                                    case 114:
                                                        value += Unescapes[charCode];
                                                        Index++;
                                                        break;
                                                    case 117:
                                                        begin = ++Index;
                                                        for (position = Index + 4; Index < position; Index++) {
                                                            charCode = source.charCodeAt(Index);
                                                            if (!(charCode >= 48 && charCode <= 57 || charCode >= 97 && charCode <= 102 || charCode >= 65 && charCode <= 70)) {
                                                                abort()
                                                            }
                                                        }
                                                        value += fromCharCode("0x" + source.slice(begin, Index));
                                                        break;
                                                    default:
                                                        abort()
                                                }
                                            } else {
                                                if (charCode == 34) {
                                                    break
                                                }
                                                charCode = source.charCodeAt(Index);
                                                begin = Index;
                                                while (charCode >= 32 && charCode != 92 && charCode != 34) {
                                                    charCode = source.charCodeAt(++Index)
                                                }
                                                value += source.slice(begin, Index)
                                            }
                                        }
                                        if (source.charCodeAt(Index) == 34) {
                                            Index++;
                                            return value
                                        }
                                        abort();
                                    default:
                                        begin = Index;
                                        if (charCode == 45) {
                                            isSigned = true;
                                            charCode = source.charCodeAt(++Index)
                                        }
                                        if (charCode >= 48 && charCode <= 57) {
                                            if (charCode == 48 && (charCode = source.charCodeAt(Index + 1), charCode >= 48 && charCode <= 57)) {
                                                abort()
                                            }
                                            isSigned = false;
                                            for (; Index < length && (charCode = source.charCodeAt(Index), charCode >= 48 && charCode <= 57); Index++);
                                            if (source.charCodeAt(Index) == 46) {
                                                position = ++Index;
                                                for (; position < length && (charCode = source.charCodeAt(position), charCode >= 48 && charCode <= 57); position++);
                                                if (position == Index) {
                                                    abort()
                                                }
                                                Index = position
                                            }
                                            charCode = source.charCodeAt(Index);
                                            if (charCode == 101 || charCode == 69) {
                                                charCode = source.charCodeAt(++Index);
                                                if (charCode == 43 || charCode == 45) {
                                                    Index++
                                                }
                                                for (position = Index; position < length && (charCode = source.charCodeAt(position), charCode >= 48 && charCode <= 57); position++);
                                                if (position == Index) {
                                                    abort()
                                                }
                                                Index = position
                                            }
                                            return +source.slice(begin, Index)
                                        }
                                        if (isSigned) {
                                            abort()
                                        }
                                        if (source.slice(Index, Index + 4) == "true") {
                                            Index += 4;
                                            return true
                                        } else if (source.slice(Index, Index + 5) == "false") {
                                            Index += 5;
                                            return false
                                        } else if (source.slice(Index, Index + 4) == "null") {
                                            Index += 4;
                                            return null
                                        }
                                        abort()
                                }
                            }
                            return "$"
                        };
                        var get = function(value) {
                            var results, hasMembers;
                            if (value == "$") {
                                abort()
                            }
                            if (typeof value == "string") {
                                if ((charIndexBuggy ? value.charAt(0) : value[0]) == "@") {
                                    return value.slice(1)
                                }
                                if (value == "[") {
                                    results = [];
                                    for (;; hasMembers || (hasMembers = true)) {
                                        value = lex();
                                        if (value == "]") {
                                            break
                                        }
                                        if (hasMembers) {
                                            if (value == ",") {
                                                value = lex();
                                                if (value == "]") {
                                                    abort()
                                                }
                                            } else {
                                                abort()
                                            }
                                        }
                                        if (value == ",") {
                                            abort()
                                        }
                                        results.push(get(value))
                                    }
                                    return results
                                } else if (value == "{") {
                                    results = {};
                                    for (;; hasMembers || (hasMembers = true)) {
                                        value = lex();
                                        if (value == "}") {
                                            break
                                        }
                                        if (hasMembers) {
                                            if (value == ",") {
                                                value = lex();
                                                if (value == "}") {
                                                    abort()
                                                }
                                            } else {
                                                abort()
                                            }
                                        }
                                        if (value == "," || typeof value != "string" || (charIndexBuggy ? value.charAt(0) : value[0]) != "@" || lex() != ":") {
                                            abort()
                                        }
                                        results[value.slice(1)] = get(lex())
                                    }
                                    return results
                                }
                                abort()
                            }
                            return value
                        };
                        var update = function(source, property, callback) {
                            var element = walk(source, property, callback);
                            if (element === undef) {
                                delete source[property]
                            } else {
                                source[property] = element
                            }
                        };
                        var walk = function(source, property, callback) {
                            var value = source[property],
                                length;
                            if (typeof value == "object" && value) {
                                if (getClass.call(value) == arrayClass) {
                                    for (length = value.length; length--;) {
                                        update(value, length, callback)
                                    }
                                } else {
                                    forEach(value, function(property) {
                                        update(value, property, callback)
                                    })
                                }
                            }
                            return callback.call(source, property, value)
                        };
                        JSON3.parse = function(source, callback) {
                            var result, value;
                            Index = 0;
                            Source = "" + source;
                            result = get(lex());
                            if (lex() != "$") {
                                abort()
                            }
                            Index = Source = null;
                            return callback && getClass.call(callback) == functionClass ? walk((value = {}, value[""] = result, value), "", callback) : result
                        }
                    }
                }
                if (isLoader) {
                    define(function() {
                        return JSON3
                    })
                }
            })(this)
        }, {}],
        48: [function(_dereq_, module, exports) {
            module.exports = toArray;

            function toArray(list, index) {
                var array = [];
                index = index || 0;
                for (var i = index || 0; i < list.length; i++) {
                    array[i - index] = list[i]
                }
                return array
            }
        }, {}]
    }, {}, [1])(1)
});;
window.___browserSync___ = {};
___browserSync___.io = window.io;
window.io = window.___browserSync___oldSocketIo;
window.___browserSync___oldSocketIo = undefined;
___browserSync___.socketConfig = {
    "reconnectionAttempts": 50,
    "path": "/browser-sync/socket.io"
};
___browserSync___.socket = ___browserSync___.io('' + location.host + '/browser-sync', ___browserSync___.socketConfig);
"use strict";

(function(window, document, bs, undefined) {

    var socket = bs.socket;

    var uiOptions = {
        bs: {}
    };

    socket.on("ui:connection", function(options) {

        uiOptions = options;

        bs.socket.emit("ui:history:connected", {
            href: window.location.href
        });
    });

    socket.on("ui:element:remove", function(data) {
        if (data.id) {
            var elem = document.getElementById(data.id);
            if (elem) {
                removeElement(elem);
            }
        }
    });

    socket.on("highlight", function() {
        var id = "__browser-sync-highlight__";
        var elem = document.getElementById(id);
        if (elem) {
            return removeElement(elem);
        }
        (function(e) {
            e.style.position = "fixed";
            e.style.zIndex = "1000";
            e.style.width = "100%";
            e.style.height = "100%";
            e.style.borderWidth = "5px";
            e.style.borderColor = "red";
            e.style.borderStyle = "solid";
            e.style.top = "0";
            e.style.left = "0";
            e.setAttribute("id", id);
            document.getElementsByTagName("body")[0].appendChild(e);
        })(document.createElement("div"));
    });

    socket.on("ui:element:add", function(data) {

        var elem = document.getElementById(data.id);

        if (!elem) {
            if (data.type === "css") {
                return addCss(data);
            }
            if (data.type === "js") {
                return addJs(data);
            }
            if (data.type === "dom") {
                return addDomNode(data);
            }
        }
    });

    bs.addDomNode = addDomNode;
    bs.addJs = addJs;
    bs.addCss = addJs;

    function addJs(data) {
        (function(e) {
            e.setAttribute("src", getAbsoluteUrl(data.src));
            e.setAttribute("id", data.id);
            document.getElementsByTagName("body")[0].appendChild(e);
        })(document.createElement("script"));
    }

    function addCss(data) {
        (function(e) {
            e.setAttribute("rel", "stylesheet");
            e.setAttribute("type", "text/css");
            e.setAttribute("id", data.id);
            e.setAttribute("media", "all");
            e.setAttribute("href", getAbsoluteUrl(data.src));
            document.getElementsByTagName("head")[0].appendChild(e);
        })(document.createElement("link"));
    }

    function addDomNode(data) {
        var elem = document.createElement(data.tagName);
        for (var attr in data.attrs) {
            elem.setAttribute(attr, data.attrs[attr]);
        }
        if (data.placement) {
            document.getElementsByTagName(data.placement)[0].appendChild(elem);
        } else {
            document.getElementsByTagName("body")[0].appendChild(elem);
        }
        return elem;
    }

    function removeElement(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    function getAbsoluteUrl(path) {
        if (path.match(/^h/)) {
            return path;
        }
        return [window.location.protocol, "//", getHost(), path].join("");
    }

    function getHost() {
        return uiOptions.bs.mode === "snippet" ? window.location.hostname + ":" + uiOptions.bs.port : window.location.host;
    }

})(window, document, ___browserSync___);
! function t(e, n, o) {
    function i(s, c) {
        if (!n[s]) {
            if (!e[s]) {
                var a = "function" == typeof require && require;
                if (!c && a) return a(s, !0);
                if (r) return r(s, !0);
                var l = new Error("Cannot find module '" + s + "'");
                throw l.code = "MODULE_NOT_FOUND", l
            }
            var u = n[s] = {
                exports: {}
            };
            e[s][0].call(u.exports, function(t) {
                var n = e[s][1][t];
                return i(n ? n : t)
            }, u, u.exports, t, e, n, o)
        }
        return n[s].exports
    }
    for (var r = "function" == typeof require && require, s = 0; s < o.length; s++) i(o[s]);
    return i
}({
    1: [function(t, e, n) {
        "use strict";

        function o(t) {
            return "undefined" == typeof t
        }

        function i(t, e) {
            for (var n = 0, o = e.split("."), i = o.length; i > n; n++) {
                if (!t || "object" != typeof t) return !1;
                t = t[o[n]]
            }
            return "undefined" == typeof t ? !1 : t
        }
        var r = t("./socket"),
            s = t("./emitter"),
            c = (t("./notify"), t("./tab"), t("./browser.utils")),
            a = function(t) {
                this.options = t, this.socket = r, this.emitter = s, this.utils = c, this.tabHidden = !1;
                var e = this;
                r.on("options:set", function(t) {
                    s.emit("notify", "Setting options..."), e.options = t.options
                }), s.on("tab:hidden", function() {
                    e.tabHidden = !0
                }), s.on("tab:visible", function() {
                    e.tabHidden = !1
                })
            };
        a.prototype.canSync = function(t, e) {
            if (t = t || {}, t.override) return !0;
            var n = !0;
            return e && (n = this.getOption(e)), n && t.url === window.location.pathname
        }, a.prototype.getOption = function(t) {
            if (t && t.match(/\./)) return i(this.options, t);
            var e = this.options[t];
            return o(e) ? !1 : e
        }, e.exports = a
    }, {
        "./browser.utils": 2,
        "./emitter": 5,
        "./notify": 16,
        "./socket": 17,
        "./tab": 18
    }],
    2: [function(t, e, n) {
        "use strict";
        var o = n;
        o.getWindow = function() {
            return window
        }, o.getDocument = function() {
            return document
        }, o.getBody = function() {
            return document.getElementsByTagName("body")[0]
        }, o.getBrowserScrollPosition = function() {
            var t, e, o = n.getWindow(),
                i = n.getDocument(),
                r = i.documentElement,
                s = i.body;
            return void 0 !== o.pageYOffset ? (t = o.pageXOffset, e = o.pageYOffset) : (t = r.scrollLeft || s.scrollLeft || 0, e = r.scrollTop || s.scrollTop || 0), {
                x: t,
                y: e
            }
        }, o.getScrollSpace = function() {
            var t = n.getDocument(),
                e = t.documentElement,
                o = t.body;
            return {
                x: o.scrollHeight - e.clientWidth,
                y: o.scrollHeight - e.clientHeight
            }
        }, o.saveScrollPosition = function() {
            var t = o.getBrowserScrollPosition();
            t = [t.x, t.y], o.getDocument.cookie = "bs_scroll_pos=" + t.join(",")
        }, o.restoreScrollPosition = function() {
            var t = o.getDocument().cookie.replace(/(?:(?:^|.*;\s*)bs_scroll_pos\s*\=\s*([^;]*).*$)|^.*$/, "$1").split(",");
            o.getWindow().scrollTo(t[0], t[1])
        }, o.getElementIndex = function(t, e) {
            var n = o.getDocument().getElementsByTagName(t);
            return Array.prototype.indexOf.call(n, e)
        }, o.forceChange = function(t) {
            t.blur(), t.focus()
        }, o.getElementData = function(t) {
            var e = t.tagName,
                n = o.getElementIndex(e, t);
            return {
                tagName: e,
                index: n
            }
        }, o.getSingleElement = function(t, e) {
            var n = o.getDocument().getElementsByTagName(t);
            return n[e]
        }, o.getBody = function() {
            return o.getDocument().getElementsByTagName("body")[0]
        }, o.setScroll = function(t) {
            o.getWindow().scrollTo(t.x, t.y)
        }, o.reloadBrowser = function() {
            o.getWindow().location.reload(!0)
        }, o.forEach = function(t, e) {
            for (var n = 0, o = t.length; o > n; n += 1) e(t[n], n, t)
        }, o.isOldIe = function() {
            return "undefined" != typeof o.getWindow().attachEvent
        }
    }, {}],
    3: [function(t, e, n) {
        "indexOf" in Array.prototype || (Array.prototype.indexOf = function(t, e) {
            void 0 === e && (e = 0), 0 > e && (e += this.length), 0 > e && (e = 0);
            for (var n = this.length; n > e; e += 1)
                if (e in this && this[e] === t) return e;
            return -1
        })
    }, {}],
    4: [function(t, e, n) {
        "use strict";
        var o, i = t("./events"),
            r = t("./browser.utils"),
            s = t("./emitter"),
            c = n,
            a = {
                tagNames: {
                    css: "link",
                    jpg: "img",
                    jpeg: "img",
                    png: "img",
                    svg: "img",
                    gif: "img",
                    js: "script"
                },
                attrs: {
                    link: "href",
                    img: "src",
                    script: "src"
                }
            },
            l = "codeSync",
            u = function() {
                return window.location.pathname
            };
        c.init = function(t) {
            t.options.tagNames && (a.tagNames = t.options.tagNames), "window.name" === t.options.scrollRestoreTechnique ? c.saveScrollInName(s) : c.saveScrollInCookie(r.getWindow(), r.getDocument()), t.socket.on("file:reload", c.reload(t)), t.socket.on("browser:reload", function() {
                t.canSync({
                    url: u()
                }, l) && c.reloadBrowser(!0, t)
            })
        }, c.saveScrollInName = function() {
            var t = "<<BS_START>>",
                e = "<<BS_END>>",
                n = new RegExp(t + "(.+?)" + e),
                o = r.getWindow(),
                i = {};
            s.on("browser:hardReload", function(n) {
                var i = [o.name, t, JSON.stringify({
                    bs: {
                        hardReload: !0,
                        scroll: n.scrollPosition
                    }
                }), e].join("");
                o.name = i
            });
            try {
                var c = o.name.match(n);
                c && (i = JSON.parse(c[1]))
            } catch (a) {
                i = {}
            }
            i.bs && i.bs.hardReload && i.bs.scroll && r.setScroll(i.bs.scroll), o.name = o.name.replace(n, "")
        }, c.saveScrollInCookie = function(t, e) {
            r.isOldIe() && ("complete" === e.readyState ? r.restoreScrollPosition() : i.manager.addEvent(e, "readystatechange", function() {
                "complete" === e.readyState && r.restoreScrollPosition()
            }), s.on("browser:hardReload", r.saveScrollPosition))
        }, c.swapFile = function(t, e, n) {
            var i = t[e],
                r = (new Date).getTime(),
                s = "?rel=" + r,
                a = c.getFilenameOnly(i);
            a && (i = a[0]), n && (n.timestamps || (s = "")), t[e] = i + s;
            var l = document.body;
            return setTimeout(function() {
                o ? (o.style.display = "none", o.style.display = "block") : (o = document.createElement("DIV"), l.appendChild(o))
            }, 200), {
                elem: t,
                timeStamp: r
            }
        }, c.getFilenameOnly = function(t) {
            return /^[^\?]+(?=\?)/.exec(t)
        }, c.reload = function(t) {
            return function(e) {
                if (t.canSync({
                        url: u()
                    }, l)) {
                    var n, o = t.options,
                        i = t.emitter;
                    if ((e.url || !o.injectChanges) && c.reloadBrowser(!0), e.basename && e.ext) {
                        var r = c.getElems(e.ext),
                            s = c.getMatches(r.elems, e.basename, r.attr);
                        s.length && o.notify && i.emit("notify", {
                            message: "Injected: " + e.basename
                        });
                        for (var a = 0, d = s.length; d > a; a += 1) n = c.swapFile(s[a], r.attr, o)
                    }
                    return n
                }
            }
        }, c.getTagName = function(t) {
            return a.tagNames[t]
        }, c.getAttr = function(t) {
            return a.attrs[t]
        }, c.getMatches = function(t, e, n) {
            if ("*" === e[0]) return t;
            for (var o = [], i = 0, r = t.length; r > i; i += 1) - 1 !== t[i][n].indexOf(e) && o.push(t[i]);
            return o
        }, c.getElems = function(t) {
            var e = c.getTagName(t),
                n = c.getAttr(e);
            return {
                elems: document.getElementsByTagName(e),
                attr: n
            }
        }, c.reloadBrowser = function(t) {
            s.emit("browser:hardReload", {
                scrollPosition: r.getBrowserScrollPosition()
            }), t && r.reloadBrowser()
        }
    }, {
        "./browser.utils": 2,
        "./emitter": 5,
        "./events": 6
    }],
    5: [function(t, e, n) {
        "use strict";
        n.events = {}, n.emit = function(t, e) {
            var o, i = n.events[t];
            if (i && i.listeners) {
                o = i.listeners;
                for (var r = 0, s = o.length; s > r; r += 1) o[r](e)
            }
        }, n.on = function(t, e) {
            var o = n.events;
            o[t] ? o[t].listeners.push(e) : o[t] = {
                listeners: [e]
            }
        }
    }, {}],
    6: [function(t, e, n) {
        n._ElementCache = function() {
            var t = {},
                e = 1,
                n = "data" + (new Date).getTime();
            this.getData = function(o) {
                var i = o[n];
                return i || (i = o[n] = e++, t[i] = {}), t[i]
            }, this.removeData = function(e) {
                var o = e[n];
                if (o) {
                    delete t[o];
                    try {
                        delete e[n]
                    } catch (i) {
                        e.removeAttribute && e.removeAttribute(n)
                    }
                }
            }
        }, n._fixEvent = function(t) {
            function e() {
                return !0
            }

            function n() {
                return !1
            }
            if (!t || !t.stopPropagation) {
                var o = t || window.event;
                t = {};
                for (var i in o) t[i] = o[i];
                if (t.target || (t.target = t.srcElement || document), t.relatedTarget = t.fromElement === t.target ? t.toElement : t.fromElement, t.preventDefault = function() {
                        t.returnValue = !1, t.isDefaultPrevented = e
                    }, t.isDefaultPrevented = n, t.stopPropagation = function() {
                        t.cancelBubble = !0, t.isPropagationStopped = e
                    }, t.isPropagationStopped = n, t.stopImmediatePropagation = function() {
                        this.isImmediatePropagationStopped = e, this.stopPropagation()
                    }, t.isImmediatePropagationStopped = n, null != t.clientX) {
                    var r = document.documentElement,
                        s = document.body;
                    t.pageX = t.clientX + (r && r.scrollLeft || s && s.scrollLeft || 0) - (r && r.clientLeft || s && s.clientLeft || 0), t.pageY = t.clientY + (r && r.scrollTop || s && s.scrollTop || 0) - (r && r.clientTop || s && s.clientTop || 0)
                }
                t.which = t.charCode || t.keyCode, null != t.button && (t.button = 1 & t.button ? 0 : 4 & t.button ? 1 : 2 & t.button ? 2 : 0)
            }
            return t
        }, n._EventManager = function(t) {
            function e(e, n) {
                function o(t) {
                    for (var e in t) return !1;
                    return !0
                }
                var i = t.getData(e);
                0 === i.handlers[n].length && (delete i.handlers[n], document.removeEventListener ? e.removeEventListener(n, i.dispatcher, !1) : document.detachEvent && e.detachEvent("on" + n, i.dispatcher)), o(i.handlers) && (delete i.handlers, delete i.dispatcher), o(i) && t.removeData(e)
            }
            var o = 1;
            this.addEvent = function(e, i, r) {
                var s = t.getData(e);
                s.handlers || (s.handlers = {}), s.handlers[i] || (s.handlers[i] = []), r.guid || (r.guid = o++), s.handlers[i].push(r), s.dispatcher || (s.disabled = !1, s.dispatcher = function(t) {
                    if (!s.disabled) {
                        t = n._fixEvent(t);
                        var o = s.handlers[t.type];
                        if (o)
                            for (var i = 0; i < o.length; i++) o[i].call(e, t)
                    }
                }), 1 == s.handlers[i].length && (document.addEventListener ? e.addEventListener(i, s.dispatcher, !1) : document.attachEvent && e.attachEvent("on" + i, s.dispatcher))
            }, this.removeEvent = function(n, o, i) {
                var r = t.getData(n);
                if (r.handlers) {
                    var s = function(t) {
                        r.handlers[t] = [], e(n, t)
                    };
                    if (o) {
                        var c = r.handlers[o];
                        if (c) {
                            if (!i) return void s(o);
                            if (i.guid)
                                for (var a = 0; a < c.length; a++) c[a].guid === i.guid && c.splice(a--, 1);
                            e(n, o)
                        }
                    } else
                        for (var l in r.handlers) s(l)
                }
            }, this.proxy = function(t, e) {
                e.guid || (e.guid = o++);
                var n = function() {
                    return e.apply(t, arguments)
                };
                return n.guid = e.guid, n
            }
        }, n.triggerClick = function(t) {
            var e;
            document.createEvent ? window.setTimeout(function() {
                e = document.createEvent("MouseEvents"), e.initEvent("click", !0, !0), t.dispatchEvent(e)
            }, 0) : window.setTimeout(function() {
                document.createEventObject && (e = document.createEventObject(), e.cancelBubble = !0, t.fireEvent("onclick", e))
            }, 0)
        };
        var o = new n._ElementCache,
            i = new n._EventManager(o);
        i.triggerClick = n.triggerClick, n.manager = i
    }, {}],
    7: [function(t, e, n) {
        "use strict";
        var o = "click",
            i = "ghostMode.clicks";
        n.canEmitEvents = !0, n.init = function(t, e) {
            e.addEvent(document.body, o, n.browserEvent(t)), t.socket.on(o, n.socketEvent(t, e))
        }, n.browserEvent = function(t) {
            return function(e) {
                if (n.canEmitEvents) {
                    var i = e.target || e.srcElement;
                    if ("checkbox" === i.type || "radio" === i.type) return void t.utils.forceChange(i);
                    t.socket.emit(o, t.utils.getElementData(i))
                } else n.canEmitEvents = !0
            }
        }, n.socketEvent = function(t, e) {
            return function(o) {
                if (!t.canSync(o, i) || t.tabHidden) return !1;
                var r = t.utils.getSingleElement(o.tagName, o.index);
                r && (n.canEmitEvents = !1, e.triggerClick(r))
            }
        }
    }, {}],
    8: [function(t, e, n) {
        "use strict";
        var o = "input:text",
            i = "ghostMode.forms.inputs";
        n.canEmitEvents = !0, n.init = function(t, e) {
            e.addEvent(document.body, "keyup", n.browserEvent(t)), t.socket.on(o, n.socketEvent(t, e))
        }, n.browserEvent = function(t) {
            return function(e) {
                var i, r = e.target || e.srcElement;
                n.canEmitEvents ? ("INPUT" === r.tagName || "TEXTAREA" === r.tagName) && (i = t.utils.getElementData(r), i.value = r.value, t.socket.emit(o, i)) : n.canEmitEvents = !0
            }
        }, n.socketEvent = function(t) {
            return function(e) {
                if (!t.canSync(e, i)) return !1;
                var n = t.utils.getSingleElement(e.tagName, e.index);
                return n ? (n.value = e.value, n) : !1
            }
        }
    }, {}],
    9: [function(t, e, n) {
        "use strict";
        n.plugins = {
            inputs: t("./ghostmode.forms.input"),
            toggles: t("./ghostmode.forms.toggles"),
            submit: t("./ghostmode.forms.submit")
        }, n.init = function(t, e) {
            function o(o) {
                n.plugins[o].init(t, e)
            }
            var i = !0,
                r = t.options.ghostMode.forms;
            r === !0 && (i = !1);
            for (var s in n.plugins) i ? r[s] && o(s) : o(s)
        }
    }, {
        "./ghostmode.forms.input": 8,
        "./ghostmode.forms.submit": 10,
        "./ghostmode.forms.toggles": 11
    }],
    10: [function(t, e, n) {
        "use strict";
        var o = "form:submit",
            i = "ghostMode.forms.submit";
        n.canEmitEvents = !0, n.init = function(t, e) {
            var i = n.browserEvent(t);
            e.addEvent(document.body, "submit", i), e.addEvent(document.body, "reset", i), t.socket.on(o, n.socketEvent(t, e))
        }, n.browserEvent = function(t) {
            return function(e) {
                if (n.canEmitEvents) {
                    var i = e.target || e.srcElement,
                        r = t.utils.getElementData(i);
                    r.type = e.type, t.socket.emit(o, r)
                } else n.canEmitEvents = !0
            }
        }, n.socketEvent = function(t) {
            return function(e) {
                if (!t.canSync(e, i)) return !1;
                var o = t.utils.getSingleElement(e.tagName, e.index);
                return n.canEmitEvents = !1, o && "submit" === e.type && o.submit(), o && "reset" === e.type && o.reset(), !1
            }
        }
    }, {}],
    11: [function(t, e, n) {
        "use strict";
        var o = "input:toggles",
            i = "ghostMode.forms.toggles";
        n.canEmitEvents = !0, n.init = function(t, e) {
            var i = n.browserEvent(t);
            n.addEvents(e, i), t.socket.on(o, n.socketEvent(t, e))
        }, n.addEvents = function(t, e) {
            function n(n) {
                for (var o = 0, i = n.length; i > o; o += 1) t.addEvent(n[o], "change", e)
            }
            var o = document.getElementsByTagName("select"),
                i = document.getElementsByTagName("input");
            n(o), n(i)
        }, n.browserEvent = function(t) {
            return function(e) {
                if (n.canEmitEvents) {
                    var i, r = e.target || e.srcElement;
                    ("radio" === r.type || "checkbox" === r.type || "SELECT" === r.tagName) && (i = t.utils.getElementData(r), i.type = r.type, i.value = r.value, i.checked = r.checked, t.socket.emit(o, i))
                } else n.canEmitEvents = !0
            }
        }, n.socketEvent = function(t) {
            return function(e) {
                if (!t.canSync(e, i)) return !1;
                n.canEmitEvents = !1;
                var o = t.utils.getSingleElement(e.tagName, e.index);
                return o ? ("radio" === e.type && (o.checked = !0), "checkbox" === e.type && (o.checked = e.checked), "SELECT" === e.tagName && (o.value = e.value), o) : !1
            }
        }
    }, {}],
    12: [function(t, e, n) {
        "use strict";
        var o = t("./events").manager;
        n.plugins = {
            scroll: t("./ghostmode.scroll"),
            clicks: t("./ghostmode.clicks"),
            forms: t("./ghostmode.forms"),
            location: t("./ghostmode.location")
        }, n.init = function(t) {
            for (var e in n.plugins) n.plugins[e].init(t, o)
        }
    }, {
        "./events": 6,
        "./ghostmode.clicks": 7,
        "./ghostmode.forms": 9,
        "./ghostmode.location": 13,
        "./ghostmode.scroll": 14
    }],
    13: [function(t, e, n) {
        "use strict";
        var o = "browser:location",
            i = "ghostMode.location";
        n.canEmitEvents = !0, n.init = function(t) {
            t.socket.on(o, n.socketEvent(t))
        }, n.socketEvent = function(t) {
            return function(e) {
                return t.canSync(e, i) ? void(e.path ? n.setPath(e.path) : n.setUrl(e.url)) : !1
            }
        }, n.setUrl = function(t) {
            window.location = t
        }, n.setPath = function(t) {
            window.location = window.location.protocol + "//" + window.location.host + t
        }
    }, {}],
    14: [function(t, e, n) {
        "use strict";
        var o, i = "scroll",
            r = "scroll:element",
            s = "ghostMode.scroll";
        n.canEmitEvents = !0, n.init = function(t, e) {
            function s(r, s) {
                c[r] && c[r].length && "querySelectorAll" in document && o.forEach(c[r], function(r) {
                    var c = document.querySelectorAll(r) || [];
                    o.forEach(c, function(r) {
                        var c = o.getElementData(r);
                        c.cacheSelector = c.tagName + ":" + c.index, c.map = s, a[c.cacheSelector] = r, e.addEvent(r, i, n.browserEventForElement(t, r, c))
                    })
                })
            }
            o = t.utils;
            var c = t.options;
            e.addEvent(window, i, n.browserEvent(t)), t.socket.on(i, n.socketEvent(t));
            var a = {};
            s("scrollElements", !1), s("scrollElementMapping", !0), t.socket.on(r, n.socketEventForElement(t, a))
        }, n.socketEvent = function(t) {
            return function(e) {
                if (!t.canSync(e, s)) return !1;
                var i = o.getScrollSpace();
                return n.canEmitEvents = !1, t.options && t.options.scrollProportionally ? window.scrollTo(0, i.y * e.position.proportional) : window.scrollTo(0, e.position.raw.y)
            }
        }, n.socketEventForElement = function(t, e) {
            return function(o) {
                function i(t, n) {
                    e[t] && (e[t].scrollTop = n)
                }
                return t.canSync(o, s) ? (n.canEmitEvents = !1, o.map ? Object.keys(e).forEach(function(t) {
                    i(t, o.position)
                }) : void i(o.elem.cacheSelector, o.position)) : !1
            }
        }, n.browserEventForElement = function(t, e, o) {
            return function() {
                var i = n.canEmitEvents;
                i && t.socket.emit(r, {
                    position: e.scrollTop,
                    elem: o,
                    map: o.map
                }), n.canEmitEvents = !0
            }
        }, n.browserEvent = function(t) {
            return function() {
                var e = n.canEmitEvents;
                e && t.socket.emit(i, {
                    position: n.getScrollPosition()
                }), n.canEmitEvents = !0
            }
        }, n.getScrollPosition = function() {
            var t = o.getBrowserScrollPosition();
            return {
                raw: t,
                proportional: n.getScrollTopPercentage(t)
            }
        }, n.getScrollPercentage = function(t, e) {
            var n = e.x / t.x,
                o = e.y / t.y;
            return {
                x: n || 0,
                y: o
            }
        }, n.getScrollTopPercentage = function(t) {
            var e = o.getScrollSpace(),
                i = n.getScrollPercentage(e, t);
            return i.y
        }
    }, {}],
    15: [function(t, e, n) {
        "use strict";
        var o = t("./socket"),
            i = (t("./client-shims"), t("./notify")),
            r = t("./code-sync"),
            s = t("./browser-sync"),
            c = t("./ghostmode"),
            a = (t("./emitter"), t("./events"), t("./browser.utils")),
            l = !1,
            u = !1;
        n.init = function(t) {
            l && t.reloadOnRestart && a.reloadBrowser();
            var e = window.___browserSync___ || {};
            if (!e.client) {
                e.client = !0;
                var n = new s(t);
                c.init(n), r.init(n), i.init(n), t.notify && i.flash("Connected to BrowserSync")
            }
            u || (o.on("disconnect", function() {
                t.notify && i.flash("Disconnected from BrowserSync"), l = !0
            }), u = !0)
        }, o.on("connection", n.init)
    }, {
        "./browser-sync": 1,
        "./browser.utils": 2,
        "./client-shims": 3,
        "./code-sync": 4,
        "./emitter": 5,
        "./events": 6,
        "./ghostmode": 12,
        "./ghostmode.clicks": 7,
        "./ghostmode.forms": 9,
        "./ghostmode.forms.input": 8,
        "./ghostmode.forms.submit": 10,
        "./ghostmode.forms.toggles": 11,
        "./ghostmode.location": 13,
        "./ghostmode.scroll": 14,
        "./notify": 16,
        "./socket": 17
    }],
    16: [function(t, e, n) {
        "use strict";
        var o, i, r, s = (t("./ghostmode.scroll"), t("./browser.utils")),
            c = {
                display: "none",
                padding: "15px",
                fontFamily: "sans-serif",
                position: "fixed",
                fontSize: "0.9em",
                zIndex: 9999,
                right: 0,
                top: 0,
                borderBottomLeftRadius: "5px",
                backgroundColor: "#1B2032",
                margin: 0,
                color: "white",
                textAlign: "center"
            };
        n.init = function(t) {
            i = t.options;
            var e = c;
            if (i.notify.styles)
                if ("[object Array]" === Object.prototype.toString.call(i.notify.styles)) e = i.notify.styles.join(";");
                else
                    for (var r in i.notify.styles) i.notify.styles.hasOwnProperty(r) && (e[r] = i.notify.styles[r]);
            if (o = document.createElement("DIV"), o.id = "__bs_notify__", "string" == typeof e) o.style.cssText = e;
            else
                for (var s in e) o.style[s] = e[s];
            var a = n.watchEvent(t);
            return t.emitter.on("notify", a), t.socket.on("browser:notify", a), o
        }, n.watchEvent = function(t) {
            return function(e) {
                if (t.options.notify) {
                    if ("string" == typeof e) return n.flash(e);
                    n.flash(e.message, e.timeout)
                }
            }
        }, n.getElem = function() {
            return o
        }, n.flash = function(t, e) {
            var o = n.getElem(),
                i = s.getBody();
            return o ? (o.innerHTML = t, o.style.display = "block", i.appendChild(o), r && (clearTimeout(r), r = void 0), r = window.setTimeout(function() {
                o.style.display = "none", o.parentNode && i.removeChild(o)
            }, e || 2e3), o) : !1
        }
    }, {
        "./browser.utils": 2,
        "./ghostmode.scroll": 14
    }],
    17: [function(t, e, n) {
        "use strict";
        var o = window.___browserSync___ || {};
        n.socket = o.socket || {
            emit: function() {},
            on: function() {}
        }, n.getPath = function() {
            return window.location.pathname
        }, n.emit = function(t, e) {
            var o = n.socket;
            o && o.emit && (e.url = n.getPath(), o.emit(t, e))
        }, n.on = function(t, e) {
            n.socket.on(t, e)
        }
    }, {}],
    18: [function(t, e, n) {
        function o() {
            a[i] ? c.emit("tab:hidden") : c.emit("tab:visible")
        }
        var i, r, s = t("./browser.utils"),
            c = t("./emitter"),
            a = s.getDocument();
        "undefined" != typeof a.hidden ? (i = "hidden", r = "visibilitychange") : "undefined" != typeof a.mozHidden ? (i = "mozHidden", r = "mozvisibilitychange") : "undefined" != typeof a.msHidden ? (i = "msHidden", r = "msvisibilitychange") : "undefined" != typeof a.webkitHidden && (i = "webkitHidden", r = "webkitvisibilitychange"), "undefined" == typeof a.addEventListener || "undefined" == typeof a[i] || a.addEventListener(r, o, !1)
    }, {
        "./browser.utils": 2,
        "./emitter": 5
    }]
}, {}, [15]);
