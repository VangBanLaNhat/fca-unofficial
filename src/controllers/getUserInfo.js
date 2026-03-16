"use strict";

var utils = require("../utils");
var log = require("npmlog");

function formatData(data) {
  var retObj = {};

  if (!data || utils.getType(data) !== "Object") {
    return retObj;
  }

  for (var prop in data) {
    // eslint-disable-next-line no-prototype-builtins
    if (data.hasOwnProperty(prop)) {
      var innerObj = data[prop];
      if (!innerObj) {
        continue;
      }
      retObj[prop] = {
        name: innerObj.name,
        firstName: innerObj.firstName,
        vanity: innerObj.vanity,
        thumbSrc: innerObj.thumbSrc,
        profileUrl: innerObj.uri,
        gender: innerObj.gender,
        type: innerObj.type,
        isFriend: innerObj.is_friend,
        isBirthday: !!innerObj.is_birthday
      };
    }
  }

  return retObj;
}

module.exports = function(defaultFuncs, api, ctx) {
  return function getUserInfo(id, callback) {
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

    if (utils.getType(id) !== "Array") {
      id = [id];
    }

    var form = {};
    id.map(function(v, i) {
      form["ids[" + i + "]"] = v;
    });
    defaultFuncs
      .post("https://www.facebook.com/chat/user_info/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        if (resData.error) {
          throw resData;
        }

        var profiles =
          resData && resData.payload && resData.payload.profiles
            ? resData.payload.profiles
            : null;

        if (!profiles) {
          throw {
            error: "getUserInfo: missing profiles in response payload",
            res: resData
          };
        }

        return callback(null, formatData(profiles));
      })
      .catch(function(err) {
        log.error("getUserInfo", err);
        return callback(err);
      });

    return returnPromise;
  };
};
