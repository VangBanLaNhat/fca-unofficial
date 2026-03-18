"use strict";

const utils = require("../utils");

module.exports = function(defaultFuncs, api, ctx) {
  return function addExternalModule(moduleObj, callback) {
    var done = typeof callback === "function" ? callback : null;

    if (utils.getType(moduleObj) == "Object") {
      for (let apiName in moduleObj) {
        if (
          utils.getType(moduleObj[apiName]) == "Function" ||
          utils.getType(moduleObj[apiName]) == "AsyncFunction"
        ) {
          api[apiName] = moduleObj[apiName](defaultFuncs, api, ctx);
        } else {
          var err = new Error(`Item "${apiName}" in moduleObj must be a function, not ${utils.getType(moduleObj[apiName])}!`);
          if (done) done(err);
          throw err;
        }
      }
    } else {
      var typeErr = new Error(`moduleObj must be an object, not ${utils.getType(moduleObj)}!`);
      if (done) done(typeErr);
      throw typeErr;
    }

    if (done) {
      done(null, true);
    }

    return true;
  };
};
