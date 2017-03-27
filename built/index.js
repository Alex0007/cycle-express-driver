"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const adapt_1 = require("@cycle/run/lib/adapt");
const cuid = require("cuid");
const express = require("express");
const methods = require("methods");
const url = require("url");
const xstream_1 = require("xstream");
const terminateRequestWithMethodsMap = [
    'download',
    'end',
    'json',
    'jsonp',
    'redirect',
    'render',
    'send',
    'sendFile',
    'sendStatus'
].reduce((obj, method) => {
    obj[method] = true;
    return obj;
}, {});
const requestsStore = {};
const createdStreams = {};
const resolve = (from, to) => {
    return url.resolve(from + '/', to.replace(/^\//, '')).replace('//', '/').replace(/\/$/, '');
};
const createRouterSource = (router, base = '/') => {
    const driverRouter = {};
    const createRouteStream = (method, path) => {
        const incoming$ = xstream_1.default.create({
            start: (listener) => {
                router[method](path, (req, res) => {
                    const request = Object.assign({
                        id: cuid()
                    }, req);
                    request.locals = request.locals || {};
                    requestsStore[request.id] = { req: request, res };
                    listener.next(request);
                });
            },
            stop: () => { }
        });
        return adapt_1.adapt(incoming$.remember());
    };
    methods.concat('all').forEach((method) => {
        driverRouter[method] = (path) => {
            const routeStreamKey = method.toUpperCase() + ' ' + resolve(base, path);
            createdStreams[routeStreamKey] = createdStreams[routeStreamKey] || createRouteStream(method, path);
            return createdStreams[routeStreamKey];
        };
    });
    driverRouter.route = (path) => {
        const nestedRouter = express.Router();
        router.use(path, nestedRouter);
        return createRouterSource(nestedRouter, resolve(base, path));
    };
    return driverRouter;
};
exports.makeRouterDriver = (router) => {
    const driverFunction = (outgoing$) => {
        outgoing$.addListener({
            next: (response) => {
                if (!requestsStore[response.id]) {
                    console.warn(`request with id ${response.id} not found`);
                    return;
                }
                const { res } = requestsStore[response.id];
                let terminateRequestWith;
                const methods = [];
                for (const key in response) {
                    if (typeof res[key] === 'function') {
                        if (terminateRequestWithMethodsMap[key]) {
                            terminateRequestWith = key;
                        }
                        else {
                            methods.push(key);
                        }
                    }
                }
                if (terminateRequestWith) {
                    methods.push(terminateRequestWith);
                }
                methods.forEach((method) => res[method](response[method]));
                if (terminateRequestWith) {
                    delete requestsStore[response.id];
                }
            }
        });
        return createRouterSource(router);
    };
    return driverFunction;
};
