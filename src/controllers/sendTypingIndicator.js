"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  function makeTypingIndicator(typ, threadID, callback, isGroup) {
    var form = {
      typ: +typ,
      to: "",
      source: "mercury-chat",
      thread: threadID
    };

    // Check if thread is a single person chat or a group chat
    // More info on this is in api.sendMessage
    if (utils.getType(isGroup) == "Boolean") {
      if (!isGroup) {
        form.to = threadID;
      }
      defaultFuncs
        .post("https://www.facebook.com/ajax/messaging/typ.php", ctx.jar, form)
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(function (resData) {
          if (resData.error) {
            throw resData;
          }

          return callback();
        })
        .catch(function (err) {
          log.error("sendTypingIndicator", err);
          if (utils.getType(err) == "Object" && err.error === "Not logged in") {
            ctx.loggedIn = false;
          }
          return callback(err);
        });
    } else {
      api.getUserInfo(threadID, function (err, res) {
        if (err) {
          return callback(err);
        }

        // If id is single person chat
        if (Object.keys(res).length > 0) {
          form.to = threadID;
        }

        defaultFuncs
          .post("https://www.facebook.com/ajax/messaging/typ.php", ctx.jar, form)
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(function (resData) {
            if (resData.error) {
              throw resData;
            }

            return callback();
          })
          .catch(function (err) {
            log.error("sendTypingIndicator", err);
            if (utils.getType(err) == "Object" && err.error === "Not logged in.") {
              ctx.loggedIn = false;
            }
            return callback(err);
          });
      });
    }
  }

  return function sendTypingIndicator(threadID, callback, isGroup) {
    var callbackType = utils.getType(callback);
    var userCallback =
      callbackType === "Function" || callbackType === "AsyncFunction"
        ? callback
        : null;

    if (!userCallback && callback) {
      log.warn(
        "sendTypingIndicator",
        "callback is not a function - ignoring."
      );
    }

    var startResolve = function () {};
    var startReject = function () {};
    var startPromise = new Promise(function (resolve, reject) {
      startResolve = resolve;
      startReject = reject;
    });

    function settleStart(err, data, endFn) {
      if (userCallback) {
        try {
          var cbResult = userCallback(err, data);
          if (cbResult && typeof cbResult.then === "function") {
            cbResult.catch(function (cbErr) {
              log.error("sendTypingIndicator", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("sendTypingIndicator", cbErr);
        }
      }

      if (err) {
        return startReject(err);
      }
      startResolve(endFn);
    }

    var end = function end(cb) {
      var cbType = utils.getType(cb);
      var userEndCallback =
        cbType === "Function" || cbType === "AsyncFunction" ? cb : null;

      if (!userEndCallback && cb) {
        log.warn(
          "sendTypingIndicator",
          "callback is not a function - ignoring."
        );
      }

      var stopResolve = function () {};
      var stopReject = function () {};
      var stopPromise = new Promise(function (resolve, reject) {
        stopResolve = resolve;
        stopReject = reject;
      });

      makeTypingIndicator(false, threadID, function (err, data) {
        if (userEndCallback) {
          try {
            var endCbResult = userEndCallback(err, data);
            if (endCbResult && typeof endCbResult.then === "function") {
              endCbResult.catch(function (cbErr) {
                log.error("sendTypingIndicator", cbErr);
              });
            }
          } catch (cbErr) {
            log.error("sendTypingIndicator", cbErr);
          }
        }

        if (err) {
          return stopReject(err);
        }
        stopResolve(data);
      }, isGroup);

      return stopPromise;
    };

    // Preserve old API (end function) while also making the value awaitable.
    end.then = startPromise.then.bind(startPromise);
    end.catch = startPromise.catch.bind(startPromise);
    end.finally = startPromise.finally.bind(startPromise);

    makeTypingIndicator(true, threadID, function (err, data) {
      settleStart(err, data, end);
    }, isGroup);

    return end;
  };
};
