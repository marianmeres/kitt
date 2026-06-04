if (typeof Symbol.dispose === "undefined") {
    Symbol.dispose = Symbol.for("Symbol.dispose");
}
const WILDCARD = "*";
class PubSub {
    #subs = new Map();
    #onError;
    constructor(options){
        this.#onError = options?.onError ?? this.#defaultErrorHandler;
        this.publish = this.publish.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.subscribeOnce = this.subscribeOnce.bind(this);
        this.subscribeMany = this.subscribeMany.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.unsubscribeAll = this.unsubscribeAll.bind(this);
        this.isSubscribed = this.isSubscribed.bind(this);
        this.subscriberCount = this.subscriberCount.bind(this);
        this.hasSubscribers = this.hasSubscribers.bind(this);
        this.topics = this.topics.bind(this);
    }
    #defaultErrorHandler(error, topic, isWildcard) {
        const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
        console.error(`Error in ${prefix} for topic "${topic}":`, error);
    }
    #invoke(cb, data, topic, isWildcard) {
        try {
            const result = cb(data);
            if (result && typeof result.then === "function") {
                result.catch((reason)=>{
                    const err = reason instanceof Error ? reason : new Error(String(reason));
                    this.#onError(err, topic, isWildcard);
                });
            }
        } catch (error) {
            this.#onError(error, topic, isWildcard);
        }
    }
    #makeUnsubscriber(fn) {
        const u = ()=>fn();
        u[Symbol.dispose] = fn;
        return u;
    }
    publish(topic, data) {
        if (topic === WILDCARD) {
            throw new Error(`Cannot publish to wildcard topic "*". "*" is reserved for subscribers; publish to a real topic name instead.`);
        }
        const direct = this.#subs.get(topic);
        const hadDirect = !!direct && direct.size > 0;
        if (direct) {
            for (const cb of [
                ...direct
            ]){
                this.#invoke(cb, data, topic, false);
            }
        }
        const wildcards = this.#subs.get(WILDCARD);
        if (wildcards && wildcards.size > 0) {
            const envelope = {
                event: topic,
                data
            };
            for (const cb of [
                ...wildcards
            ]){
                this.#invoke(cb, envelope, topic, true);
            }
        }
        return hadDirect;
    }
    subscribe(topic, cb) {
        let bucket = this.#subs.get(topic);
        if (!bucket) {
            bucket = new Set();
            this.#subs.set(topic, bucket);
        }
        bucket.add(cb);
        return this.#makeUnsubscriber(()=>{
            this.unsubscribe(topic, cb);
        });
    }
    subscribeOnce(topic, cb) {
        let fired = false;
        const onceWrapper = (data)=>{
            if (fired) return;
            fired = true;
            this.unsubscribe(topic, onceWrapper);
            return cb(data);
        };
        return this.subscribe(topic, onceWrapper);
    }
    subscribeMany(topics, cb) {
        const unsubs = topics.map((t)=>this.subscribe(t, cb));
        return this.#makeUnsubscriber(()=>{
            for (const u of unsubs)u();
        });
    }
    unsubscribe(topic, cb) {
        const bucket = this.#subs.get(topic);
        if (!bucket) return false;
        if (typeof cb === "function") {
            const removed = bucket.delete(cb);
            if (bucket.size === 0) this.#subs.delete(topic);
            return removed;
        }
        return this.#subs.delete(topic);
    }
    unsubscribeAll(topic) {
        if (topic !== undefined) return this.#subs.delete(topic);
        if (this.#subs.size === 0) return false;
        this.#subs.clear();
        return true;
    }
    isSubscribed(topic, cb, considerWildcard = true) {
        if (this.#subs.get(topic)?.has(cb)) return true;
        if (considerWildcard && this.#subs.get(WILDCARD)?.has(cb)) return true;
        return false;
    }
    subscriberCount(topic) {
        if (topic !== undefined) return this.#subs.get(topic)?.size ?? 0;
        let total = 0;
        for (const set of this.#subs.values())total += set.size;
        return total;
    }
    hasSubscribers(topic) {
        return (this.#subs.get(topic)?.size ?? 0) > 0;
    }
    topics() {
        return [
            ...this.#subs.keys()
        ];
    }
    __dump() {
        const out = {};
        for (const [topic, set] of this.#subs.entries()){
            out[topic] = new Set(set);
        }
        return out;
    }
}
function createPubSub(options) {
    return new PubSub(options);
}
const isFn = (v)=>typeof v === "function";
const assertFn = (v, prefix = "")=>{
    if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};
const strictEqual = (a, b)=>a === b;
function createStore(initial, options = null) {
    const _equal = options?.equal ?? strictEqual;
    const _maybePersist = (v)=>{
        if (options?.persist) {
            try {
                options.persist(v);
            } catch (e) {
                if (options.onPersistError) {
                    options.onPersistError(e);
                } else {
                    console.warn("Store persistence failed:", e);
                }
            }
        }
    };
    const _handleInitialSubscriberError = (e)=>{
        const err = e instanceof Error ? e : new Error(String(e));
        if (options?.onError) {
            options.onError(err, "change", false);
        } else {
            console.error(`Error in subscriber for topic "change":`, err);
        }
    };
    const _pubsub = createPubSub(options?.onError ? {
        onError: (e, topic, isWildcard)=>options.onError(e, topic, isWildcard)
    } : undefined);
    let _value = initial;
    if (options?.eagerPersist !== false) {
        _maybePersist(_value);
    }
    const get = ()=>_value;
    let _notifying = false;
    let _hasPending = false;
    let _pendingValue;
    const _applyChange = (value)=>{
        _value = value;
        _maybePersist(_value);
        _pubsub.publish("change", _value);
    };
    const set = (value)=>{
        if (_equal(_value, value)) return;
        if (_notifying) {
            _hasPending = true;
            _pendingValue = value;
            return;
        }
        _notifying = true;
        try {
            _applyChange(value);
            while(_hasPending){
                const next = _pendingValue;
                _hasPending = false;
                if (!_equal(_value, next)) _applyChange(next);
            }
        } finally{
            _notifying = false;
            _hasPending = false;
        }
    };
    const update = (cb)=>{
        assertFn(cb, "[update]");
        set(cb(get()));
    };
    const subscribe = (cb)=>{
        assertFn(cb, "[subscribe]");
        try {
            cb(_value);
        } catch (e) {
            _handleInitialSubscriberError(e);
        }
        return _pubsub.subscribe("change", cb);
    };
    return {
        set,
        get,
        update,
        subscribe
    };
}
new Map();
function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined" && globalThis === window;
}
const getRaf = (()=>{
    let instance = null;
    return ()=>{
        if (instance) return instance;
        if (isBrowser() && globalThis.requestAnimationFrame && globalThis.cancelAnimationFrame) {
            instance = {
                requestAnimationFrame: globalThis.requestAnimationFrame.bind(globalThis),
                cancelAnimationFrame: globalThis.cancelAnimationFrame.bind(globalThis)
            };
            return instance;
        }
        const pendingFrames = new Map();
        let nextCallbackId = 0;
        instance = {
            requestAnimationFrame (callback) {
                const callbackId = ++nextCallbackId;
                if (nextCallbackId >= Number.MAX_SAFE_INTEGER) {
                    nextCallbackId = 0;
                }
                const timerId = setTimeout(()=>{
                    const frame = pendingFrames.get(callbackId);
                    if (frame) {
                        pendingFrames.delete(callbackId);
                        callback(Date.now());
                    }
                }, 1000 / 60);
                pendingFrames.set(callbackId, {
                    callback,
                    timerId
                });
                return callbackId;
            },
            cancelAnimationFrame (callbackId) {
                const frame = pendingFrames.get(callbackId);
                if (frame) {
                    clearTimeout(frame.timerId);
                    pendingFrames.delete(callbackId);
                }
            }
        };
        return instance;
    };
})();
function setTimeoutRAF(cb, delay) {
    const { requestAnimationFrame, cancelAnimationFrame } = getRaf();
    let start = null;
    function on_frame(timestamp) {
        if (start === null) {
            start = timestamp;
        }
        const elapsed = timestamp - start;
        if (elapsed >= delay) {
            cb();
        } else {
            requestId = requestAnimationFrame(on_frame);
        }
    }
    let requestId = requestAnimationFrame(on_frame);
    return ()=>cancelAnimationFrame(requestId);
}
const _assertValidInterval = (ms)=>{
    const n = typeof ms === "number" ? ms : Number(ms);
    if (!Number.isFinite(n) || n <= 0) {
        throw new TypeError(`Invalid interval. Expecting positive finite number of milliseconds.`);
    }
    return Math.floor(n);
};
function _createTicker(interval = 1000, start = false, logger = null, useRaf = false, onError = null) {
    const _log = (...v)=>typeof logger === "function" ? logger.apply(null, v) : null;
    if (useRaf && typeof interval === "number" && interval < 1000 / 60) {
        console.warn([
            "Smaller interval than 60Hz may not be accurate with RAF ticker.",
            "Consider using `createTicker` instead of `createTickerRAF`."
        ].join(" "));
    }
    const MIN_TIMEOUT = useRaf ? 1000 / 60 : 0;
    const _setTimeout = useRaf ? setTimeoutRAF : setTimeout;
    const _store = createStore(0, onError ? {
        onError
    } : undefined);
    let _timerId = null;
    const _getInterval = (previous)=>_assertValidInterval(typeof interval === "function" ? interval(previous, _store.get()) : interval);
    let _baseInterval = _getInterval(0);
    let _scheduledDelay = _baseInterval;
    let _isStarted = start;
    let _last = 0;
    const _tick = ()=>{
        _store.set(Date.now());
        if (!_isStarted) return;
        const _now = Date.now();
        const _offset = _last === 0 ? 0 : _now - _last - _scheduledDelay;
        _baseInterval = _getInterval(_baseInterval);
        _scheduledDelay = Math.max(MIN_TIMEOUT, _baseInterval - _offset);
        _timerId = _setTimeout(_tick, _scheduledDelay);
        _last = _now;
        _log({
            _now,
            _offset,
            _baseInterval,
            _scheduledDelay
        });
    };
    const _clearTimer = ()=>{
        if (_timerId !== null) {
            if (typeof _timerId === "function") _timerId();
            else clearTimeout(_timerId);
            _timerId = null;
        }
    };
    const ticker = {
        subscribe: _store.subscribe,
        start: ()=>{
            _isStarted = true;
            _last = 0;
            _baseInterval = _getInterval(0);
            _scheduledDelay = _baseInterval;
            if (_timerId === null) _tick();
            return ticker;
        },
        stop: ()=>{
            _isStarted = false;
            _store.set(0);
            _clearTimer();
            _last = 0;
            return ticker;
        },
        toggle: ()=>{
            _isStarted ? ticker.stop() : ticker.start();
            return ticker;
        },
        isStarted: ()=>_isStarted,
        setInterval: (msOrFn)=>{
            interval = msOrFn;
            _baseInterval = _getInterval(_baseInterval);
            return ticker;
        },
        getInterval: ()=>_baseInterval
    };
    if (start) ticker.start();
    return ticker;
}
const createTickerRAF = (interval = 1000, startOrOptions = false, logger = null)=>{
    if (typeof startOrOptions === "object" && startOrOptions !== null) {
        const opts = startOrOptions;
        return _createTicker(interval, opts.start ?? false, opts.logger ?? null, true, opts.onError ?? null);
    }
    return _createTicker(interval, startOrOptions, logger, true, null);
};
const DEFAULT_TRAIL = [
    "rgb(255, 0, 0)",
    "rgb(153, 0, 0)",
    "rgb(51, 0, 0)"
];
function isElement(x) {
    const E = globalThis.Element;
    return typeof E === "function" && x instanceof E;
}
function resolveContainer(target) {
    if (typeof target === "string") {
        const doc = globalThis.document;
        return doc ? doc.querySelector(target) : null;
    }
    if (isElement(target)) return target;
    return null;
}
function resolveElements(target, itemSelector) {
    if (typeof target === "string") {
        const doc = globalThis.document;
        if (!doc) return [];
        if (itemSelector) {
            const root = doc.querySelector(target);
            return root ? Array.from(root.querySelectorAll(itemSelector)) : [];
        }
        return Array.from(doc.querySelectorAll(target));
    }
    if (isElement(target)) {
        if (itemSelector) {
            return Array.from(target.querySelectorAll(itemSelector));
        }
        return Array.from(target.children);
    }
    return Array.from(target);
}
function randomInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1) + a);
}
function prefersReducedMotion() {
    if (typeof globalThis === "undefined") return false;
    const mm = globalThis.matchMedia;
    if (typeof mm !== "function") return false;
    return mm("(prefers-reduced-motion: reduce)").matches;
}
function setStyle(el, property, value) {
    if (property.includes("-")) {
        el.style.setProperty(property, value);
    } else {
        el.style[property] = value;
    }
}
function buildBounceOvershoot(length, tailLength) {
    const lo = -tailLength;
    const hi = length - 1 + tailLength;
    const seq = [];
    for(let i = lo; i <= hi; i++)seq.push([
        i,
        -1
    ]);
    for(let i = hi - 1; i >= lo + 1; i--)seq.push([
        i,
        1
    ]);
    return seq;
}
function buildBounceWall(length) {
    const seq = [];
    for(let i = 0; i < length; i++)seq.push([
        i,
        -1
    ]);
    for(let i = length - 2; i >= 1; i--)seq.push([
        i,
        1
    ]);
    return seq;
}
function buildSlideIn(tailLength) {
    const seq = [];
    for(let i = -tailLength; i < 0; i++)seq.push([
        i,
        -1
    ]);
    return seq;
}
function buildSlideOff(tailLength) {
    const seq = [];
    for(let i = 0; i >= -tailLength; i--)seq.push([
        i,
        1
    ]);
    return seq;
}
function buildOneWay(length, tailLength, dir) {
    const seq = [];
    if (dir === -1) {
        for(let i = -tailLength; i < length + tailLength; i++)seq.push([
            i,
            dir
        ]);
    } else {
        for(let i = length - 1 + tailLength; i >= -tailLength; i--)seq.push([
            i,
            dir
        ]);
    }
    return seq;
}
function kitt(config) {
    const { target, itemSelector, interval = 70, property = "color", baseValue = "inherit", trail = DEFAULT_TRAIL, direction = "pingpong", overshoot = true, cycles = 1, autoStart = false, schedule, triggers = [], respectReducedMotion = true, onStart, onEnd, onTick } = config;
    if (!trail.length) throw new Error("kitt: `trail` must contain at least one value");
    const tailLength = config.tailLength ?? Math.max(1, trail.length - 1);
    const els = resolveElements(target, itemSelector);
    const container = resolveContainer(target);
    const prev = new Array(els.length).fill(baseValue);
    let intro = [];
    let outro = [];
    let loopBody;
    if (direction === "pingpong") {
        if (overshoot) {
            loopBody = buildBounceOvershoot(els.length, tailLength);
        } else {
            intro = buildSlideIn(tailLength);
            loopBody = buildBounceWall(els.length);
            outro = buildSlideOff(tailLength);
        }
    } else {
        loopBody = buildOneWay(els.length, tailLength, direction === "ltr" ? -1 : 1);
    }
    let sequence = [];
    let seqIdx = 0;
    let infiniteLoop = false;
    const ticker = createTickerRAF(interval);
    const resetAll = ()=>{
        for(let i = 0; i < els.length; i++){
            if (prev[i] !== baseValue) {
                setStyle(els[i], property, baseValue);
                prev[i] = baseValue;
            }
        }
    };
    const renderFrame = (idx)=>{
        for(let i = 0; i < els.length; i++){
            const distance = Math.abs(i - idx);
            let value = baseValue;
            if (distance <= tailLength) {
                value = trail[Math.min(distance, trail.length - 1)];
            }
            if (prev[i] !== value) {
                setStyle(els[i], property, value);
                prev[i] = value;
            }
        }
    };
    const tickHandler = (t)=>{
        if (!t) return;
        if (seqIdx >= sequence.length) {
            if (infiniteLoop) {
                sequence = loopBody.slice();
                seqIdx = 0;
            } else {
                ticker.stop();
                resetAll();
                onEnd?.();
                return;
            }
        }
        const [idx, dir] = sequence[seqIdx++];
        renderFrame(idx);
        onTick?.(idx, dir === -1 ? "ltr" : "rtl");
    };
    ticker.subscribe(tickHandler);
    const play = ()=>{
        if (respectReducedMotion && prefersReducedMotion()) return;
        if (ticker.isStarted()) return;
        if (els.length === 0) return;
        if (Number.isFinite(cycles)) {
            sequence = [
                ...intro
            ];
            for(let c = 0; c < cycles; c++)sequence.push(...loopBody);
            sequence.push(...outro);
            infiniteLoop = false;
        } else {
            sequence = [
                ...intro,
                ...loopBody
            ];
            infiniteLoop = true;
        }
        seqIdx = 0;
        onStart?.();
        ticker.start();
    };
    const stop = ()=>{
        sequence = [];
        seqIdx = 0;
        ticker.stop();
        resetAll();
    };
    const toggle = ()=>{
        if (ticker.isStarted()) stop();
        else play();
    };
    const isPlaying = ()=>ticker.isStarted();
    let scheduleTimer;
    const clearScheduleTimer = ()=>{
        if (scheduleTimer !== undefined) {
            clearTimeout(scheduleTimer);
            scheduleTimer = undefined;
        }
    };
    const nextScheduleDelay = (cfg)=>{
        const iv = cfg.interval ?? [
            5000,
            10000
        ];
        if (typeof iv === "number") return iv;
        return randomInt(iv[0], iv[1]);
    };
    const scheduleNext = (cfg, delay)=>{
        scheduleTimer = setTimeout(()=>{
            play();
            if (cfg.repeat !== false) scheduleNext(cfg, nextScheduleDelay(cfg));
        }, delay);
    };
    const triggerCleanups = [];
    for (const trig of triggers){
        if (!container) break;
        if (trig === "hover") {
            const handler = ()=>play();
            container.addEventListener("mouseenter", handler);
            triggerCleanups.push(()=>container.removeEventListener("mouseenter", handler));
        } else if (trig === "click") {
            const handler = ()=>play();
            container.addEventListener("click", handler);
            triggerCleanups.push(()=>container.removeEventListener("click", handler));
        } else if (trig === "visible") {
            const IO = globalThis.IntersectionObserver;
            if (!IO) continue;
            const observer = new IO((entries)=>{
                for (const e of entries)if (e.isIntersecting) play();
            });
            observer.observe(container);
            triggerCleanups.push(()=>observer.disconnect());
        }
    }
    if (schedule) {
        const initialDelay = schedule.initialDelay ?? 3000;
        scheduleNext(schedule, initialDelay);
    }
    if (autoStart) {
        queueMicrotask(()=>play());
    }
    const destroy = ()=>{
        stop();
        clearScheduleTimer();
        for (const cleanup of triggerCleanups)cleanup();
        triggerCleanups.length = 0;
    };
    return {
        play,
        stop,
        toggle,
        isPlaying,
        destroy
    };
}
export { kitt as kitt };
