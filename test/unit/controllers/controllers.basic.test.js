"use strict";

describe("controller behavior basics", function () {
  test("getCurrentUserID returns ctx.userID", function () {
    var factory = require("../../../src/controllers/getCurrentUserID");
    var fn = factory({}, {}, { userID: "123456" });

    expect(fn()).toBe("123456");
  });

  test("getCurrentUserID supports callback and await style", async function () {
    var factory = require("../../../src/controllers/getCurrentUserID");
    var fn = factory({}, {}, { userID: "123456" });

    var cbValue;
    fn(function (err, value) {
      expect(err).toBeNull();
      cbValue = value;
    });

    expect(cbValue).toBe("123456");
    expect(await fn()).toBe("123456");
  });

  test("threadColors exposes known palette keys", function () {
    var factory = require("../../../src/controllers/threadColors");
    var colors = factory({}, {}, {});

    expect(colors).toHaveProperty("DefaultBlue");
    expect(colors).toHaveProperty("HotPink");
    expect(colors).toHaveProperty("MessengerBlue");
    expect(typeof colors.DefaultBlue).toBe("string");
  });

  test("addExternalModule injects dynamic API functions", function () {
    var factory = require("../../../src/controllers/addExternalModule");
    var api = {};
    var defaultFuncs = {};
    var ctx = { userID: "42" };

    var addExternalModule = factory(defaultFuncs, api, ctx);

    addExternalModule({
      ping: function (_defaultFuncs, _api, _ctx) {
        return function () {
          return _ctx.userID;
        };
      }
    });

    expect(typeof api.ping).toBe("function");
    expect(api.ping()).toBe("42");
  });

  test("addExternalModule validates input types", function () {
    var factory = require("../../../src/controllers/addExternalModule");
    var api = {};
    var addExternalModule = factory({}, api, {});

    expect(function () {
      addExternalModule("invalid");
    }).toThrow("moduleObj must be an object");

    expect(function () {
      addExternalModule({ bad: 123 });
    }).toThrow('Item "bad" in moduleObj must be a function');
  });

  test("addExternalModule supports callback", function () {
    var factory = require("../../../src/controllers/addExternalModule");
    var api = {};
    var defaultFuncs = {};
    var ctx = { userID: "42" };
    var addExternalModule = factory(defaultFuncs, api, ctx);

    var callbackResult;
    var result = addExternalModule({
      ping: function (_defaultFuncs, _api, _ctx) {
        return function () {
          return _ctx.userID;
        };
      }
    }, function (err, ok) {
      expect(err).toBeNull();
      callbackResult = ok;
    });

    expect(result).toBe(true);
    expect(callbackResult).toBe(true);
    expect(api.ping()).toBe("42");
  });

  test("getRegion and getEmojiUrl support callback", function () {
    var getRegionFactory = require("../../../src/controllers/getRegion");
    var getEmojiUrlFactory = require("../../../src/controllers/getEmojiUrl");

    var getRegion = getRegionFactory({}, {}, { region: "PRN" });
    var getEmojiUrl = getEmojiUrlFactory({}, {}, {});

    var regionValue;
    getRegion(function (err, value) {
      expect(err).toBeNull();
      regionValue = value;
    });

    var emojiValue;
    getEmojiUrl("😀", 64, function (err, value) {
      expect(err).toBeNull();
      emojiValue = value;
    });

    expect(regionValue).toBe("PRN");
    expect(typeof emojiValue).toBe("string");
    expect(emojiValue).toContain("emoji.php");
  });
});
