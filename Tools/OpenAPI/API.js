/**
 * OpenAPI
 * @author: Peng-YM
 * https://github.com/Peng-YM/QuanX/blob/master/Tools/OpenAPI/README.md
 */

function Env(name = "untitled") {
    
    const isQX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined" && !isLoon;
    const isJSBox = typeof require == "function" && typeof $ui != "undefined";
    const isNode = typeof require == "function" && !isJSBox;
    
    function HTTP() {
        const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];
    
        function objectToUrlencoded(object) {
            var str = "";
            for (var i in object) {
                var key = i;
                var value = object[key];
                str += key + "=" + value + "&";
            }
            return str;
        }
    
        function send(method, options) {
            options = typeof options === "string" ? {
                url: options
            } : options;
            if (options.body && options.headers) {
                if (!options.headers['Content-Type']) {
                   options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
                var body = options.body;
                if (typeof body === 'object' || body instanceof Object) {
                    var contentType = options.headers['Content-Type'];
                    if (contentType == 'application/x-www-form-urlencoded') {
                        options.body = objectToUrlencoded(body);
                    } else if (contentType == 'application/json') {
                        options.body = JSON.stringify(body);
                    }
                }
            }
            const timeout = options.timeout;
            const events = {
                ...{
                    onRequest: () => {},
                    onResponse: (resp) => resp,
                    onTimeout: () => {},
                },
                ...options.events,
            };
    
            events.onRequest(method, options);
    
            let worker;
            if (isQX) {
                worker = $task.fetch({
                    method,
                    ...options
                });
            } else if (isLoon || isSurge || isNode) {
                worker = new Promise((resolve, reject) => {
                    const request = isNode ? require("request") : $httpClient;
                    request[method.toLowerCase()](options, (err, response, body) => {
                        if (err) reject(err);
                        else
                            resolve({
                                statusCode: response.status || response.statusCode,
                                headers: response.headers,
                                body,
                            });
                    });
                });
            } else if (isJSBox) {
                var url = options.url;
                var headers = options.headers;
                var body = options.body;
                worker = new Promise((resolve, reject) => {
                    $http.request({
                        method: method,
                        url: url,
                        header: headers,
                        body: body,
                        handler: function(resp) {
                            if (resp.error) reject(resp.error);
                            else
                                resolve({
                                    statusCode: resp.response.statusCode,
                                    headers: resp.response.headers,
                                    body: resp.data
                                });
                        }
                    })
                });
            } else if (isNode) {
                const request = new Request(options.url);
                request.method = method;
                request.headers = options.headers;
                request.body = options.body;
                worker = new Promise((resolve, reject) => {
                    request
                        .loadString()
                        .then((body) => {
                            resolve({
                                statusCode: request.response.statusCode,
                                headers: request.response.headers,
                                body,
                            });
                        })
                        .catch((err) => reject(err));
                });
            }
    
            let timeoutid;
            const timer = timeout ?
                new Promise((_, reject) => {
                    timeoutid = setTimeout(() => {
                        events.onTimeout();
                        return reject(
                            `${method} URL: ${options.url} exceeds the timeout ${timeout} ms`
                        );
                    }, timeout);
                }) :
                null;
    
            return (timer ?
                Promise.race([timer, worker]).then((res) => {
                    clearTimeout(timeoutid);
                    return res;
                }) :
                worker
            ).then((resp) => events.onResponse(resp));
        };
    
        const http = {};
        methods.forEach(
            (method) =>
            (http[method.toLowerCase()] = (options) => send(method, options))
        );
        return http;
    }
    
    return new(class {
        constructor(name) {
            this.name = name;
            
            this.logs = [];

            this.http = HTTP();

            this.node = (() => {
                if (isNode) {
                    const fs = require("fs");
                    return {
                        fs,
                    };
                } else {
                    return null;
                }
            })();
            this.initCache();

            const delay = (t, v) =>
                new Promise(function(resolve) {
                    setTimeout(resolve.bind(null, v), t);
                });

            Promise.prototype.delay = function(t) {
                return this.then(function(v) {
                    return delay(t, v);
                });
            };
        }

        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge)
                this.cache = JSON.parse($persistentStore.read(this.name) || "{}");
            if (isJSBox) this.cache = JSON.parse($cache.get(this.name) || "{}");

            if (isNode) {
                let fpath = "root.json";
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(
                        fpath,
                        JSON.stringify({}), {
                            flag: "wx"
                        },
                        (err) => console.log(err)
                    );
                }
                this.root = {};

                fpath = `${this.name}.json`;
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(
                        fpath,
                        JSON.stringify({}), {
                            flag: "wx"
                        },
                        (err) => console.log(err)
                    );
                    this.cache = {};
                } else {
                    this.cache = JSON.parse(
                        this.node.fs.readFileSync(`${this.name}.json`)
                    );
                }
            }
        }

        persistCache() {
            const data = JSON.stringify(this.cache, null, 2);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge) $persistentStore.write(data, this.name);
            if (isJSBox) $cache.set(this.name, data);
            if (isNode) {
                this.node.fs.writeFileSync(
                    `${this.name}.json`,
                    data, {
                        flag: "w"
                    },
                    (err) => console.log(err)
                );
                this.node.fs.writeFileSync(
                    "root.json",
                    JSON.stringify(this.root, null, 2), {
                        flag: "w"
                    },
                    (err) => console.log(err)
                );
            }
        }

        write(data, key) {
            this.log(`SET ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.write(data, key);
                }
                if (isQX) {
                    return $prefs.setValueForKey(data, key);
                }
                if (isNode) {
                    this.root[key] = data;
                }
                if (isJSBox) {
                    $cache.set(key, data);
                }
            } else {
                this.cache[key] = data;
            }
            this.persistCache();
        }

        read(key) {
            this.log(`READ ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.read(key);
                }
                if (isQX) {
                    return $prefs.valueForKey(key);
                }
                if (isNode) {
                    return this.root[key];
                }
                if (isJSBox) {
                    return $cache.get(key);
                }
            } else {
                return this.cache[key];
            }
        }

        delete(key) {
            this.log(`DELETE ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.write(null, key);
                }
                if (isQX) {
                    return $prefs.removeValueForKey(key);
                }
                if (isNode) {
                    delete this.root[key];
                }
                if (isJSBox) {
                    $cache.remove(key);
                }
            } else {
                delete this.cache[key];
            }
            this.persistCache();
        }

        notify(title, content = "", options = {}) {
            const openURL = options["open-url"];
            const mediaURL = options["media-url"];
            const subtitle = "";
            if (isQX) $notify(title, subtitle, content, options);
            if (isSurge) {
                $notification.post(
                    title,
                    subtitle,
                    content + `${mediaURL ? "\n多媒体:" + mediaURL : ""}`, {
                        url: openURL,
                    }
                );
            }
            if (isLoon) {
                let opts = {};
                if (openURL) opts["openUrl"] = openURL;
                if (mediaURL) opts["mediaUrl"] = mediaURL;
                if (JSON.stringify(opts) === "{}") {
                    $notification.post(title, subtitle, content);
                } else {
                    $notification.post(title, subtitle, content, opts);
                }
            }
            if (isJSBox) {
                $push.schedule({
                    title: title,
                    body: content
                });
            }
            if (isNode) {
                const noti = require('./sendNotify');
                noti.sendNotify(title, content);
            }
        }

        msg(...t) {
            t.length > 0 && (this.logs = [...this.logs, ...t]);
            this.log(t);
        }

        log(msg) {
            console.log(`[${this.name}] LOG: ${this.stringify(msg)}`);
        }

        info(msg) {
            console.log(`[${this.name}] INFO: ${this.stringify(msg)}`);
        }

        error(msg) {
            console.log(`[${this.name}] ERROR: ${this.stringify(msg)}`);
        }

        wait(millisec) {
            return new Promise((resolve) => setTimeout(resolve, millisec));
        }

        done(value = {}) {
            if (isQX || isLoon || isSurge) {
                $done(value);
            }
        }

        parse(obj) {
            if (typeof obj === 'string' || obj instanceof String)
                try {
                    return JSON.parse(obj);
                } catch (err) {
                    this.msg("parse error:" + obj);
                }
            else
                try {
                    return JSON.parse(JSON.stringify(obj));
                } catch (err) {
                    this.msg("parse error:" + obj);
                }
        }

        stringify(obj) {
            if (typeof obj === 'string' || obj instanceof String)
                return obj;
            else
                try {
                    return JSON.stringify(obj);
                } catch (err) {
                    this.msg("stringify error:" + obj);
                }
        }
    })(name);
}
