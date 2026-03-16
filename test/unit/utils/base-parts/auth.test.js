"use strict";

var auth = require("../../../../src/utils/base-parts/auth");
var network = require("../../../../src/utils/base-parts/network");

describe("auth utilities", function () {
  test("formatCookie builds expected cookie string", function () {
    var c = auth.formatCookie(["c_user", "123", "", "/"], "facebook");
    expect(c).toBe("c_user=123; Path=/; Domain=facebook.com");
  });

  test("makeDefaults merges protocol defaults into get/post/postFormData", async function () {
    var getSpy = jest.spyOn(network, "get").mockResolvedValue({ ok: true });
    var postSpy = jest.spyOn(network, "post").mockResolvedValue({ ok: true });
    var postFormSpy = jest
      .spyOn(network, "postFormData")
      .mockResolvedValue({ ok: true });

    var html = '<input name="fb_dtsg" value="abc"> revision":123,';
    var ctx = { globalOptions: { userAgent: "ua" } };

    var defaults = auth.makeDefaults(html, "uid-1", ctx);

    await defaults.get("https://x", "jar", { q: 1 });
    await defaults.post("https://x", "jar", { p: 1 });
    await defaults.postFormData("https://x", "jar", { f: 1 }, { k: 1 });

    expect(getSpy).toHaveBeenCalled();
    expect(postSpy).toHaveBeenCalled();
    expect(postFormSpy).toHaveBeenCalled();

    var getQs = getSpy.mock.calls[0][2];
    var postForm = postSpy.mock.calls[0][2];

    expect(getQs).toHaveProperty("__user", "uid-1");
    expect(getQs).toHaveProperty("fb_dtsg", "abc");
    expect(postForm).toHaveProperty("jazoest");
  });

  test("parseAndCheckLogin parses standard JSON response", async function () {
    var ctx = { jar: { setCookie: jest.fn() } };
    var fn = auth.parseAndCheckLogin(ctx, {});

    var out = await fn({
      statusCode: 200,
      body: '{"ok":1}',
      request: { method: "POST", headers: { "Content-Type": "application/json" } }
    });

    expect(out).toEqual({ ok: 1 });
  });

  test("parseAndCheckLogin throws for Not logged in marker", async function () {
    var ctx = { jar: { setCookie: jest.fn() } };
    var fn = auth.parseAndCheckLogin(ctx, {});

    await expect(
      fn({
        statusCode: 200,
        body: '{"error":1357001}',
        request: { method: "POST", headers: { "Content-Type": "application/json" } }
      })
    ).rejects.toEqual({ error: "Not logged in." });
  });

  test("saveCookies writes facebook and messenger cookies", function () {
    var setCookie = jest.fn();
    var jar = { setCookie: setCookie };

    auth.saveCookies(jar)({
      headers: {
        "set-cookie": ["a=b; domain=.facebook.com; Path=/"]
      }
    });

    expect(setCookie).toHaveBeenCalled();
    expect(setCookie.mock.calls[0][1]).toBe("https://www.facebook.com");
    expect(setCookie.mock.calls[1][1]).toBe("https://www.messenger.com");
  });

  test("getAppState combines facebook and messenger cookie stores", function () {
    var jar = {
      getCookies: jest.fn(function (url) {
        if (url === "https://www.facebook.com") return [1];
        if (url === "https://facebook.com") return [2];
        return [3];
      })
    };

    expect(auth.getAppState(jar)).toEqual([1, 2, 3]);
  });
});
