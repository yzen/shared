(function () {

    "use strict";

    var fluid = require("infusion"),
        gpii = fluid.registerNamespace("gpii"),
        fs = require("fs"),
        http = require("http"),
        path = require("path"),
        eUC = "encodeURIComponent:";
        
    fluid.defaults("gpii.dataSource", {
        gradeNames: ["autoInit", "fluid.littleComponent"],
        components: {
            urlExpander: {
                type: "gpii.dataSource.urlExpander"
            }
        },
        invokers: {
            get: "gpii.dataSource.get",
            resolveUrl: "gpii.dataSource.resolveUrl"
        },
        url: "",
        termMap: {},
        writable: false,
        preInitFunction: "gpii.dataSource.preInit"
    });

    fluid.defaults("gpii.dataSource.urlExpander", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        vars: {
            db: ""
        },
        finalInitFunction: "gpii.dataSource.urlExpander.finalInit"
    });

    gpii.dataSource.preInit = function (that) {
        if (that.options.writable) {
            that.options.invokers.set = "gpii.dataSource.set";
        }
    };
    
    gpii.dataSource.urlExpander.finalInit = function (that) {
        that.expand = function (url) {
            return fluid.stringTemplate(url, that.options.vars);
        };
    };
    
    fluid.demands("gpii.dataSource.urlExpander", "gpii.development", {
        options: {
            vars: {
                db: path.join(__dirname, "..")
            }
        }
    });

    fluid.demands("gpii.dataSource.get", "gpii.development", {
        funcName: "gpii.dataSource.FSGet",
        args: [
            "{dataSource}.options.responseParser",
            "{dataSource}.resolveUrl",
            "{arguments}.0",
            "{arguments}.1",
            "{arguments}.2"
        ]
    });

    fluid.demands("gpii.dataSource.set", "gpii.development", {
        funcName: "gpii.dataSource.FSSet",
        args: [
            "{dataSource}.options.responseParser",
            "{dataSource}.resolveUrl",
            "{arguments}.0",
            "{arguments}.1",
            "{arguments}.2",
            "{arguments}.3"
        ]
    });

    fluid.demands("gpii.dataSource.get", "gpii.production", {
        funcName: "gpii.dataSource.DBGet",
        args: [
            "{dataSource}.options.responseParser",
            "{dataSource}.options.host",
            "{dataSource}.options.port",
            "{dataSource}.resolveUrl",
            "{arguments}.0",
            "{arguments}.1",
            "{arguments}.2"
        ]
    });

    fluid.demands("gpii.dataSource.set", "gpii.production", {
        funcName: "gpii.dataSource.DBSet",
        args: [
            "{dataSource}.options.responseParser",
            "{dataSource}.options.host",
            "{dataSource}.options.port",
            "{dataSource}.resolveUrl",
            "{arguments}.0",
            "{arguments}.1",
            "{arguments}.2",
            "{arguments}.3"
        ]
    });

    fluid.demands("gpii.dataSource.resolveUrl", "gpii.dataSource", {
        funcName: "gpii.dataSource.resolveUrl",
        args: [
            "{urlExpander}.expand",
            "{dataSource}.options.url",
            "{dataSource}.options.termMap",
            "{arguments}.0"
        ]
    });

    var processData = function (data, responseParser, directModel, callback) {
        data = typeof data === "string" ? JSON.parse(data) : data;
        if (responseParser) {
            data = typeof responseParser === "string" ?
                fluid.invokeGlobalFunction(responseParser, [data, directModel]) : 
                responseParser(data, directModel);
        }
        callback(data);
    };

    var dbAll = function (resolveUrl, directModel, host, port, method, callback, errorCallback, model) {
        var path = resolveUrl(directModel);
        var req = http.request({
            host: host,
            port: port,
            path: path,
            method: method
        }, function (res) {
            var data = "";
            res.setEncoding("utf8");
            res.on("data", function (chunk) {
                data += chunk;
            });
            res.on("end", function () {
                callback(data);
            });
        });
        req.on("error", function (error) {
            errorCallback(error.message, error);
        });
        req.end(model);
        return req;
    };

    gpii.dataSource.DBGet = function (responseParser, host, port, resolveUrl, directModel, callback, errorCallback) {
        dbAll(resolveUrl, directModel, host, port, "GET", function (data) {
            processData(data, responseParser, directModel, callback);
        }, errorCallback);
    };

    gpii.dataSource.DBSet = function (responseParser, host, port, resolveUrl, model, directModel, callback, errorCallback) {
        var modelData = typeof model === "string" ? model : JSON.stringify(model);
        var req = dbAll(resolveUrl, directModel, host, port, "PUT", function (data) {
            data = JSON.parse(data);
            if (!data.ok) {
                req.emit("error", data);
            }
            processData(data, responseParser, directModel, callback);
        }, errorCallback, modelData);
    };

    var fsAll = function (method, responseParser, resolveUrl, directModel, callback, errorCallback, model) {
        var fileName = resolveUrl(directModel),
            args = [fileName];
        if (model) {
            args.push(model);
        }
        args.push(function (error, data) {
            if (error) {
                errorCallback(error.message, error);
            }
            processData(data || model, responseParser, directModel, callback);
        });
        fs[method + "File"].apply(null, args);
    };

    gpii.dataSource.FSGet = function (responseParser, resolveUrl, directModel, callback, errorCallback) {
        fsAll("read", responseParser, resolveUrl, directModel, callback, errorCallback);
    };

    gpii.dataSource.FSSet = function (responseParser, resolveUrl, model, directModel, callback, errorCallback) {
        fsAll("write", responseParser, resolveUrl, directModel, callback, errorCallback,
            typeof model === "string" ? model : JSON.stringify(model));
    };

    gpii.dataSource.resolveUrl = function (expand, url, termMap, directModel) {
        var map = fluid.copy(termMap);
        map = fluid.transform(map, function (entry) {
            var encode = false;
            if (entry.indexOf(eUC) === 0) {
                encode = true;
                entry = entry.substring(eUC.length);
            }
            if (entry.charAt(0) === "%") {
                entry = fluid.get(directModel, entry.substring(1));
            }
            if (encode) {
                entry = encodeURIComponent(entry);
            }
            return entry;
        });
        var replaced = fluid.stringTemplate(url, map);
        replaced = expand(replaced);
        return replaced;
    };

})();