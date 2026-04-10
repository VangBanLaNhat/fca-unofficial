"use strict";

var bluebird = require("bluebird");
var log = require("npmlog");

var network = require("./network");
var parsing = require("./parsing");

function formatCookie(arr, url) {
  return arr[0] + "=" + arr[1] + "; Path=" + arr[3] + "; Domain=" + url + ".com";
}

function makeDefaults(html, userID, ctx) {
  var reqCounter = 1;
  var fb_dtsg = parsing.getFrom(html, 'name="fb_dtsg" value="', '"');
  var lsd = parsing.getFrom(html, '["LSD",[],{"token":"', '"');
  if (!lsd) {
    lsd = parsing.getFrom(html, 'name="lsd" value="', '"');
  }

  var ttstamp = "2";
  for (var i = 0; i < fb_dtsg.length; i++) {
    ttstamp += fb_dtsg.charCodeAt(i);
  }
  var revision = parsing.getFrom(html, 'revision":', ",");

  function mergeWithDefaults(obj) {
    var newObj = {
      av: userID,
      __user: userID,
      __req: (reqCounter++).toString(36),
      __rev: revision,
      __a: 1,
      fb_dtsg: ctx.fb_dtsg ? ctx.fb_dtsg : fb_dtsg,
      jazoest: ctx.ttstamp ? ctx.ttstamp : ttstamp,
      lsd: ctx.lsd ? ctx.lsd : lsd
    };

    if (!obj) return newObj;

    for (var prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        if (!newObj[prop]) {
          newObj[prop] = obj[prop];
        }
      }
    }

    return newObj;
  }

  function resolveCtx(ctxx) {
    if (ctxx && (ctxx.jar || ctxx.userID || ctxx.globalOptions || ctxx.region)) {
      return ctxx;
    }
    return ctx;
  }

  function postWithDefaults(url, jar, form, ctxx, customHeader) {
    return network.post(
      url,
      jar,
      mergeWithDefaults(form),
      ctx.globalOptions,
      resolveCtx(ctxx),
      customHeader
    );
  }

  function getWithDefaults(url, jar, qs, ctxx, customHeader) {
    return network.get(
      url,
      jar,
      mergeWithDefaults(qs),
      ctx.globalOptions,
      resolveCtx(ctxx),
      customHeader
    );
  }

  function postFormDataWithDefault(url, jar, form, qs, ctxx) {
    return network.postFormData(
      url,
      jar,
      mergeWithDefaults(form),
      mergeWithDefaults(qs),
      ctx.globalOptions,
      ctxx || ctx
    );
  }

  return {
    get: getWithDefaults,
    post: postWithDefaults,
    postFormData: postFormDataWithDefault
  };
}

function parseAndCheckLogin(ctx, defaultFuncs, retryCount) {
  if (retryCount == undefined) {
    retryCount = 0;
  }
  return function (data) {
    return bluebird.try(function () {
      log.verbose("parseAndCheckLogin", data.body);
      if (data.statusCode >= 500 && data.statusCode < 600) {
        if (retryCount >= 5) {
          throw {
            error:
              "Request retry failed. Check the `res` and `statusCode` property on this error.",
            statusCode: data.statusCode,
            res: data.body
          };
        }
        retryCount++;
        var retryTime = Math.floor(Math.random() * 5000);
        log.warn(
          "parseAndCheckLogin",
          "Got status code " +
          data.statusCode +
          " - " +
          retryCount +
          ". attempt to retry in " +
          retryTime +
          " milliseconds..."
        );
        var url =
          data.request.uri.protocol +
          "//" +
          data.request.uri.hostname +
          data.request.uri.pathname;
        var reqHeaders = data.request && data.request.headers ? data.request.headers : {};
        var reqContentType = reqHeaders["content-type"] || reqHeaders["Content-Type"] || "";
        if (
          String(reqContentType).split(";")[0] ===
          "multipart/form-data"
        ) {
          return bluebird
            .delay(retryTime)
            .then(function () {
              return defaultFuncs.postFormData(
                url,
                ctx.jar,
                data.request.formData,
                {}
              );
            })
            .then(parseAndCheckLogin(ctx, defaultFuncs, retryCount));
        } else {
          return bluebird
            .delay(retryTime)
            .then(function () {
              return defaultFuncs.post(url, ctx.jar, data.request.formData);
            })
            .then(parseAndCheckLogin(ctx, defaultFuncs, retryCount));
        }
      }
      if (data.statusCode !== 200)
        throw new Error(
          "parseAndCheckLogin got status code: " +
          data.statusCode +
          ". Bailing out of trying to parse response."
        );

      var res = null;
      try {
        res = JSON.parse(parsing.makeParsable(data.body));
      } catch (e) {
        throw {
          error: "JSON.parse error. Check the `detail` property on this error.",
          detail: e,
          res: data.body
        };
      }

      if (res.redirect && data.request.method === "GET") {
        return defaultFuncs
          .get(res.redirect, ctx.jar)
          .then(parseAndCheckLogin(ctx, defaultFuncs));
      }

      if (
        res.jsmods &&
        res.jsmods.require &&
        Array.isArray(res.jsmods.require[0]) &&
        res.jsmods.require[0][0] === "Cookie"
      ) {
        res.jsmods.require[0][3][0] = res.jsmods.require[0][3][0].replace(
          "_js_",
          ""
        );
        var cookie = formatCookie(res.jsmods.require[0][3], "facebook");
        var cookie2 = formatCookie(res.jsmods.require[0][3], "messenger");
        ctx.jar.setCookie(cookie, "https://www.facebook.com");
        ctx.jar.setCookie(cookie2, "https://www.messenger.com");
      }

      if (res.jsmods && Array.isArray(res.jsmods.require)) {
        var arr = res.jsmods.require;
        for (var idx in arr) {
          if (arr[idx][0] === "DTSG" && arr[idx][1] === "setToken") {
            ctx.fb_dtsg = arr[idx][3][0];
            ctx.ttstamp = "2";
            for (var j = 0; j < ctx.fb_dtsg.length; j++) {
              ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
            }
          }
        }
      }

      if (res.error === 1357001) {
        throw { error: "Not logged in." };
      }
      return res;
    });
  };
}

function saveCookies(jar) {
  return function (res) {
    var cookies = res.headers["set-cookie"] || [];
    cookies.forEach(function (c) {
      if (c.indexOf(".facebook.com") > -1) {
        jar.setCookie(c, "https://www.facebook.com");
      }
      var c2 = c.replace(/domain=\.facebook\.com/, "domain=.messenger.com");
      jar.setCookie(c2, "https://www.messenger.com");
    });
    return res;
  };
}

function getAppState(jar) {
  return jar
    .getCookies("https://www.facebook.com")
    .concat(jar.getCookies("https://facebook.com"))
    .concat(jar.getCookies("https://www.messenger.com"));
}

module.exports = {
  makeDefaults,
  parseAndCheckLogin,
  saveCookies,
  getAppState,
  formatCookie
};
