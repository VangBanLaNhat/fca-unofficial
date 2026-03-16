"use strict";

describe("src/index", function () {
  test("exports login function and wires controllers when using appState", function () {
    return new Promise(function (resolve, reject) {
      jest.isolateModules(function () {
        var controllerFactory = jest.fn(function () {
          return function () {
            return "ok";
          };
        });
        var listenFactory = jest.fn(function () {
          return function () {
            return "listening";
          };
        });

        jest.doMock("../../../src/controllers", function () {
          return {
            foo: controllerFactory,
            listenMqtt: listenFactory
          };
        });

        jest.doMock("npmlog", function () {
          return {
            maxRecordSize: 0,
            level: "info",
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
          };
        });

        var jar = {
          setCookie: jest.fn(),
          getCookies: jest.fn(function () {
            return [
              {
                cookieString: function () {
                  return "c_user=123";
                }
              }
            ];
          })
        };

        jest.doMock("../../../src/utils", function () {
          return {
            getType: function (obj) {
              return Object.prototype.toString.call(obj).slice(8, -1);
            },
            setProxy: jest.fn(),
            getJar: function () {
              return jar;
            },
            get: jest.fn(function () {
              return Promise.resolve({ body: "<html></html>" });
            }),
            saveCookies: function () {
              return function (res) {
                return res;
              };
            },
            makeDefaults: jest.fn(function () {
              return {};
            }),
            getAppState: jest.fn(function () {
              return [];
            })
          };
        });

        var login = require("../../../src/index");
        expect(typeof login).toBe("function");

        login(
          {
            appState: [
              {
                key: "c_user",
                value: "123",
                domain: ".facebook.com",
                path: "/",
                expires: Date.now() + 1000
              }
            ],
            email: "",
            password: ""
          },
          {},
          function (err, api) {
            try {
              expect(err).toBeNull();
              expect(typeof api.foo).toBe("function");
              expect(typeof api.listenMqtt).toBe("function");
              expect(api.listen).toBe(api.listenMqtt);
              expect(controllerFactory).toHaveBeenCalled();
              expect(listenFactory).toHaveBeenCalled();
              resolve();
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    });
  });
});
