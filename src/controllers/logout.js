"use strict";

var utils = require("../utils");
var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");

function safeGetFrom(str, start, end) {
  try {
    return utils.getFrom(str, start, end);
  } catch (_) {
    return "";
  }
}

function buildLogoutForm(resData, ctx) {
  var jsmods = resData && resData.jsmods ? resData.jsmods : {};

  // Legacy response path.
  if (
    Array.isArray(jsmods.instances) &&
    jsmods.instances[0] &&
    jsmods.instances[0][2] &&
    jsmods.instances[0][2][0] &&
    Array.isArray(jsmods.instances[0][2][0]) &&
    Array.isArray(jsmods.markup)
  ) {
    var elem = jsmods.instances[0][2][0].filter(function(v) {
      return v && v.value === "logout";
    })[0];

    if (elem && elem.markup && elem.markup.__m) {
      var found = jsmods.markup.filter(function(v) {
        return v && v[0] === elem.markup.__m;
      })[0];
      var html = found && found[1] ? found[1].__html : "";
      if (html) {
        return {
          fb_dtsg: safeGetFrom(html, '"fb_dtsg" value="', '"') || ctx.fb_dtsg || "",
          ref: safeGetFrom(html, '"ref" value="', '"'),
          h: safeGetFrom(html, '"h" value="', '"')
        };
      }
    }
  }

  // Newer response paths: scan all markup payloads for a logout form.
  var markupList = Array.isArray(jsmods.markup) ? jsmods.markup : [];
  for (var i = 0; i < markupList.length; i++) {
    var htmlCandidate = markupList[i] && markupList[i][1] ? markupList[i][1].__html : "";
    if (!htmlCandidate || htmlCandidate.indexOf("logout.php") === -1) {
      continue;
    }

    var fbDtsg = safeGetFrom(htmlCandidate, '"fb_dtsg" value="', '"') || ctx.fb_dtsg || "";
    var ref = safeGetFrom(htmlCandidate, '"ref" value="', '"');
    var h = safeGetFrom(htmlCandidate, '"h" value="', '"');

    if (fbDtsg) {
      return {
        fb_dtsg: fbDtsg,
        ref: ref,
        h: h
      };
    }
  }

  // Last-resort fallback.
  return {
    fb_dtsg: ctx.fb_dtsg || "",
    ref: "",
    h: ""
  };
}

module.exports = function(defaultFuncs, api, ctx) {
  return function logout(callback) {
    var resolveFunc = function(){};
    var rejectFunc = function(){};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, friendList) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(friendList);
      };
    }

    var form = {
      pmid: "0"
    };

    defaultFuncs
      .post(
        "https://www.facebook.com/bluebar/modern_settings_menu/?help_type=364455653583099&show_contextual_help=1",
        ctx.jar,
        form
      )
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        var logoutForm = buildLogoutForm(resData, ctx);
        return defaultFuncs
          .post("https://www.facebook.com/logout.php", ctx.jar, logoutForm)
          .then(utils.saveCookies(ctx.jar));
      })
      .then(function(res) {
        if (res && res.headers && res.headers.location) {
          return defaultFuncs
            .get(res.headers.location, ctx.jar)
            .then(utils.saveCookies(ctx.jar));
        }

        // Some responses do not provide redirect location anymore.
        return res;
      })
      .then(function() {
        if (ctx.refreshDtsgTimer) {
          clearInterval(ctx.refreshDtsgTimer);
          ctx.refreshDtsgTimer = null;
        }
        return e2eeBridge
          .createBridge(ctx)
          .disconnect()
          .catch(function (err) {
            log.error("logout:e2ee", err);
          })
          .then(function () {
            ctx.loggedIn = false;
            log.info("logout", "Logged out successfully.");
            callback();
          });
      })
      .catch(function(err) {
        log.error("logout", err);
        return callback(err);
      });

    return returnPromise;
  };
};
