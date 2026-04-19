/**
 * MapMyCode Express.js Request Tracer
 * Injects middleware to track request flows and sends data back to the extension.
 *
 * Usage: require('./express_tracer')(app, 9321)
 */
module.exports = function injectTracer(app, tracePort) {
  tracePort = tracePort || 9321;
  var http = require('http');

  app.use(function mapmycodeTracer(req, res, next) {
    var start = Date.now();
    var id = Math.random().toString(36).slice(2, 10);

    // Capture the original end to detect when response is sent
    var originalEnd = res.end;
    res.end = function () {
      var duration = Date.now() - start;
      var trace = {
        id: id,
        timestamp: Date.now(),
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: duration,
        middlewareChain: [],
        handler: req.route ? req.route.path : req.url,
        requestHeaders: req.headers,
      };

      // Send trace asynchronously — don't block the response
      var payload = JSON.stringify(trace);
      var postReq = http.request(
        {
          hostname: '127.0.0.1',
          port: tracePort,
          path: '/trace',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 2000,
        },
        function () {},
      );
      postReq.on('error', function () {}); // Ignore errors
      postReq.write(payload);
      postReq.end();

      return originalEnd.apply(res, arguments);
    };

    next();
  });
};
