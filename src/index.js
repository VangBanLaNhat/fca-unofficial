"use strict";

var utils = require("./utils");
var cheerio = require("cheerio");
var log = require("npmlog");
var actions = require("./actions");

var checkVerified = null;

var defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;

function normalizeAppState(appState) {
  if (utils.getType(appState) === "String") {
    return appState
      .split(";")
      .map(function (cookie) {
        var kv = cookie.split("=");
        var key = (kv[0] || "").trim();
        var value = (kv[1] || "").trim();
        if (!key) return null;
        return {
          key: key,
          value: value,
          domain: ".facebook.com",
          path: "/",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 365
        };
      })
      .filter(Boolean);
  }

  if (utils.getType(appState) === "Array") {
    return appState.map(function (cookie) {
      var c = Object.assign({}, cookie);
      if (!c.key && c.name) c.key = c.name;
      if (!c.domain) c.domain = ".facebook.com";
      if (!c.path) c.path = "/";
      return c;
    });
  }

  return appState;
}

function getRegionFromEndpoint(mqttEndpoint) {
  if (!mqttEndpoint) return null;
  try {
    var region = new URL(mqttEndpoint).searchParams.get("region");
    return region ? region.toUpperCase() : null;
  } catch (_) {
    return null;
  }
}

function getResponseURL(res) {
  if (!res || !res.request || !res.request.uri) return "";
  return res.request.uri.href || "";
}

function getAppStateUserID(appState, jar) {
  var source = appState || [];
  if (Array.isArray(source)) {
    var stateCookie = source.filter(function (cookie) {
      return cookie && (cookie.key === "c_user" || cookie.key === "i_user");
    })[0];
    if (stateCookie && stateCookie.value) return String(stateCookie.value);
  }

  if (jar) {
    var cookies = jar.getCookies("https://www.facebook.com");
    var jarCookie = cookies.filter(function (cookie) {
      var key = cookie.cookieString().split("=")[0];
      return key === "c_user" || key === "i_user";
    })[0];
    if (jarCookie) return jarCookie.cookieString().split("=")[1].toString();
  }

  return null;
}

function decodeEscapedText(text) {
  if (!text) return text;
  return text
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&");
}

function checkIfSuspended(res, appState, jar) {
  var url = getResponseURL(res);
  if (url.indexOf("https://www.facebook.com/checkpoint/") === -1) return null;
  if (url.indexOf("1501092823525282") === -1) return null;

  var body = res.body || "";
  var uid = getAppStateUserID(appState, jar);
  var suspendReasons = {};
  var durationMatch = body.match(/"log_out_uri":"(.*?)","title":"(.*?)"/);
  var reasonMatch = body.match(/"reason_section_body":"(.*?)"/);

  if (durationMatch && durationMatch[2]) {
    suspendReasons.durationInfo = decodeEscapedText(durationMatch[2]);
  }
  if (reasonMatch && reasonMatch[1]) {
    suspendReasons.longReason = decodeEscapedText(reasonMatch[1]);
    var shortReason = suspendReasons.longReason
      .toLowerCase()
      .replace("your account, or activity on it, doesn't follow our community standards on ", "");
    suspendReasons.shortReason = shortReason.substring(0, 1).toUpperCase() + shortReason.substring(1);
  }

  log.error("login", "Account " + (uid || "unknown") + " has been suspended.");
  if (suspendReasons.durationInfo) log.error("login", "Suspension time remaining: " + suspendReasons.durationInfo);
  if (suspendReasons.longReason) log.error("login", "Suspension reason: " + suspendReasons.longReason);

  return {
    suspended: true,
    suspendReasons: suspendReasons
  };
}

function checkIfLocked(res, appState, jar) {
  var url = getResponseURL(res);
  if (url.indexOf("https://www.facebook.com/checkpoint/") === -1) return null;
  if (url.indexOf("828281030927956") === -1) return null;

  var body = res.body || "";
  var uid = getAppStateUserID(appState, jar);
  var lockedReasons = {};
  var lockMatch = body.match(/"is_unvetted_flow":true,"title":"(.*?)"/);

  if (lockMatch && lockMatch[1]) {
    lockedReasons.reason = decodeEscapedText(lockMatch[1]);
  }

  log.error("login", "Account " + (uid || "unknown") + " has been locked.");
  if (lockedReasons.reason) log.error("login", "Lock reason: " + lockedReasons.reason);

  return {
    locked: true,
    lockedReasons: lockedReasons
  };
}

function throwIfLockedOrSuspended(res, appState, jar) {
  var locked = checkIfLocked(res, appState, jar);
  if (locked) throw locked;

  var suspended = checkIfSuspended(res, appState, jar);
  if (suspended) throw suspended;

  return res;
}

function checkAutoBehaviorCheckpoint(res, _jar, _appState, _globalOptions) {
  var url = getResponseURL(res);
  if (url.indexOf("https://www.facebook.com/checkpoint/") === -1) return res;
  if (url.indexOf("601051028565049") === -1) return res;

  // Facebook flagged this login as automated behavior. Do not auto-dismiss
  // the checkpoint: dismissing it programmatically is itself a bot signal.
  // The user must verify the account in a real browser instead.
  throw {
    error: "Automated behavior checkpoint detected. Please verify your account in a real browser, then try logging in again."
  };
}

function getNextPhMidnightDelayMs() {
  var now = new Date();
  var nowUtcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  var phOffsetMs = 8 * 60 * 60 * 1000;
  var phNow = new Date(nowUtcMs + phOffsetMs);
  var nextPhMidnightUtcMs = Date.UTC(
    phNow.getUTCFullYear(),
    phNow.getUTCMonth(),
    phNow.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ) - phOffsetMs;

  return Math.max(1000, nextPhMidnightUtcMs - now.getTime());
}

function scheduleFbDtsgRefresh(api, ctx) {
  if (ctx.refreshDtsgTimer) {
    clearTimeout(ctx.refreshDtsgTimer);
  }

  if (typeof api.refreshFb_dtsg !== "function") {
    return;
  }

  function queueNextRefresh() {
    ctx.refreshDtsgTimer = setTimeout(function () {
      api.refreshFb_dtsg(function () {});
      queueNextRefresh();
    }, getNextPhMidnightDelayMs());

    if (ctx.refreshDtsgTimer && typeof ctx.refreshDtsgTimer.unref === "function") {
      ctx.refreshDtsgTimer.unref();
    }
  }

  queueNextRefresh();
}

function setOptions(globalOptions, options) {
  Object.keys(options).map(function (key) {
    switch (key) {
      case 'online':
        globalOptions.online = Boolean(options.online);
        break;
      case 'logLevel':
        log.level = options.logLevel;
        globalOptions.logLevel = options.logLevel;
        break;
      case 'logRecordSize':
        log.maxRecordSize = options.logRecordSize;
        globalOptions.logRecordSize = options.logRecordSize;
        break;
      case 'selfListen':
        globalOptions.selfListen = Boolean(options.selfListen);
        break;
      case 'listenEvents':
        globalOptions.listenEvents = Boolean(options.listenEvents);
        break;
      case 'pageID':
        globalOptions.pageID = options.pageID.toString();
        break;
      case 'updatePresence':
        globalOptions.updatePresence = Boolean(options.updatePresence);
        break;
      case 'forceLogin':
        globalOptions.forceLogin = Boolean(options.forceLogin);
        break;
      case 'userAgent':
        globalOptions.userAgent = options.userAgent;
        break;
      case 'autoMarkDelivery':
        globalOptions.autoMarkDelivery = Boolean(options.autoMarkDelivery);
        break;
      case 'autoMarkRead':
        globalOptions.autoMarkRead = Boolean(options.autoMarkRead);
        break;
      case 'listenTyping':
        globalOptions.listenTyping = Boolean(options.listenTyping);
        break;
      case 'proxy':
        if (typeof options.proxy != "string") {
          delete globalOptions.proxy;
          utils.setProxy();
        } else {
          globalOptions.proxy = options.proxy;
          utils.setProxy(globalOptions.proxy);
        }
        break;
      case 'autoReconnect':
        globalOptions.autoReconnect = Boolean(options.autoReconnect);
        break;
      case 'emitReady':
        globalOptions.emitReady = Boolean(options.emitReady);
        break;
      case 'randomUserAgent':
        globalOptions.randomUserAgent = Boolean(options.randomUserAgent);
        if (globalOptions.randomUserAgent) {
          globalOptions.userAgent = utils.randomUserAgent();
          log.warn("setOptions", "Random userAgent enabled: " + globalOptions.userAgent);
        }
        break;
      case 'bypassRegion':
        globalOptions.bypassRegion = options.bypassRegion ? String(options.bypassRegion).toUpperCase() : null;
        break;

      default:
        log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
        break;
    }
  });
}

function buildAPI(globalOptions, html, jar) {
  var fbDtsgMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
  var initialFbDtsg = fbDtsgMatch ? fbDtsgMatch[1] : null;
  var lsdMatch = html.match(/\["LSD",\[\],\{"token":"(.*?)"\}/);
  var initialLsd = lsdMatch ? lsdMatch[1] : null;
  var initialTtstamp = null;
  if (initialFbDtsg) {
    initialTtstamp = "2";
    for (var idx = 0; idx < initialFbDtsg.length; idx++) {
      initialTtstamp += initialFbDtsg.charCodeAt(idx);
    }
  }

  var maybeCookie = jar.getCookies("https://www.facebook.com").filter(function (val) {
    return val.cookieString().split("=")[0] === "c_user";
  });

  if (maybeCookie.length === 0) {
    maybeCookie = jar.getCookies("https://www.facebook.com").filter(function (val) {
      return val.cookieString().split("=")[0] === "i_user";
    });
  }

  if (maybeCookie.length === 0) {
    throw { error: "Error retrieving userID. This can be caused by a lot of things, including getting blocked by Facebook for logging in from an unknown location. Try logging in with a browser to verify." };
  }

  if (html.indexOf("/checkpoint/block/?next") > -1) {
    log.warn("login", "Checkpoint detected. Please log in with a browser to verify.");
  }

  var userID = maybeCookie[0].cookieString().split("=")[1].toString();
  log.info("login", `Logged in as ${userID}`);

  try {
    clearInterval(checkVerified);
  } catch (_) { }

  var clientID = (Math.random() * 2147483648 | 0).toString(16);


  let oldFBMQTTMatch = html.match(/irisSeqID:"(.+?)",appID:219994525426954,endpoint:"(.+?)"/);
  let mqttEndpoint = null;
  let region = null;
  let irisSeqID = null;
  var noMqttData = null;

  if (oldFBMQTTMatch) {
    irisSeqID = oldFBMQTTMatch[1];
    mqttEndpoint = oldFBMQTTMatch[2];
    region = getRegionFromEndpoint(mqttEndpoint);
    if (region) {
      log.info("login", `Got this account's message region: ${region}`);
    }
  } else {
    let newFBMQTTMatch = html.match(/{"app_id":"219994525426954","endpoint":"(.+?)","iris_seq_id":"(.+?)"}/);
    if (newFBMQTTMatch) {
      irisSeqID = newFBMQTTMatch[2];
      mqttEndpoint = newFBMQTTMatch[1].replace(/\\\//g, "/");
      region = getRegionFromEndpoint(mqttEndpoint);
      if (region) {
        log.info("login", `Got this account's message region: ${region}`);
      }
    } else {
      let legacyFBMQTTMatch = html.match(/(\["MqttWebConfig",\[\],{fbid:")(.+?)(",appID:219994525426954,endpoint:")(.+?)(",pollingEndpoint:")(.+?)(3790])/);
      if (legacyFBMQTTMatch) {
        mqttEndpoint = legacyFBMQTTMatch[4];
        region = getRegionFromEndpoint(mqttEndpoint);
        log.warn("login", `Cannot get sequence ID with new RegExp. Fallback to old RegExp (without seqID)...`);
        if (region) {
          log.info("login", `Got this account's message region: ${region}`);
        }
        log.info("login", `[Unused] Polling endpoint: ${legacyFBMQTTMatch[6]}`);
      } else {
        log.warn("login", "Cannot get MQTT region & sequence ID.");
        noMqttData = html;
      }
    }
  }

  if (globalOptions.bypassRegion) {
    region = String(globalOptions.bypassRegion).toUpperCase();
    mqttEndpoint = "wss://edge-chat.facebook.com/chat?region=" + region.toLowerCase();
    log.warn("login", "Bypassing MQTT region with: " + region);
  } else if (!region) {
    // No region fallback: guessing a random edge region (and sending it as
    // the MQTT region) is a bot signal. Continue without a region instead.
    log.warn("login", "Cannot detect MQTT region. Continuing without a region.");
  }

  // All data available to api functions
  var ctx = {
    userID: userID,
    jar: jar,
    clientID: clientID,
    globalOptions: globalOptions,
    loggedIn: true,
    access_token: 'NONE',
    clientMutationId: 0,
    mqttClient: undefined,
    lastSeqId: irisSeqID,
    syncToken: undefined,
    mqttEndpoint,
    region,
    firstListen: true,
    wsReqNumber: 0,
    wsTaskNumber: 0,
    fb_dtsg: initialFbDtsg,
    ttstamp: initialTtstamp,
    lsd: initialLsd,

  };

  var api = {
    setOptions: setOptions.bind(null, globalOptions),
    getAppState: function getAppState() {
      return utils.getAppState(jar);
    },
    isFullyReady: function isFullyReady() {
      return !!(ctx.mqttClient && ctx.mqttClient.connected);
    }
  };

  if (noMqttData) {
    api["htmlData"] = noMqttData;
  }

  var apiFuncNames = Object.keys(actions);

  var defaultFuncs = utils.makeDefaults(html, userID, ctx);

  // Load all api functions in a loop
  apiFuncNames.map(function (v) {
    api[v] = actions[v](defaultFuncs, api, ctx);
  });

  //Removing original `listen` that uses pull.
  //Map it to listenMqtt instead for backward compatibly.
  api.listen = api.listenMqtt;
  if (typeof api.sendMessageMqtt !== "function") {
    api.sendMessageMqtt = api.sendMessage;
  }
  if (typeof api.setMessageReactionMqtt !== "function") {
    api.setMessageReactionMqtt = api.setMessageReaction;
  }
  // Keep fb_dtsg/jazoest fresh by refreshing at the next PH midnight (GMT+8).
  scheduleFbDtsgRefresh(api, ctx);

  return [ctx, defaultFuncs, api];
}

function makeLogin(jar, email, password, loginOptions, callback, prCallback) {
  return function (res) {
    var html = res.body;
    var $ = cheerio.load(html);
    var arr = [];

    // This will be empty, but just to be sure we leave it
    $("#login_form input").map(function (i, v) {
      arr.push({ val: $(v).val(), name: $(v).attr("name") });
    });

    arr = arr.filter(function (v) {
      return v.val && v.val.length;
    });

    var form = utils.arrToForm(arr);
    form.lsd = utils.getFrom(html, "[\"LSD\",[],{\"token\":\"", "\"}");
    form.lgndim = Buffer.from("{\"w\":1440,\"h\":900,\"aw\":1440,\"ah\":834,\"c\":24}").toString('base64');
    form.email = email;
    form.pass = password;
    form.default_persistent = '0';
    form.lgnrnd = utils.getFrom(html, "name=\"lgnrnd\" value=\"", "\"");
    form.locale = 'en_US';
    form.timezone = '240';
    form.lgnjs = ~~(Date.now() / 1000);


    // Getting cookies from the HTML page... (kill me now plz)
    // we used to get a bunch of cookies in the headers of the response of the
    // request, but FB changed and they now send those cookies inside the JS.
    // They run the JS which then injects the cookies in the page.
    // The "solution" is to parse through the html and find those cookies
    // which happen to be conveniently indicated with a _js_ in front of their
    // variable name.
    //
    // ---------- Very Hacky Part Starts -----------------
    var willBeCookies = html.split("\"_js_");
    willBeCookies.slice(1).map(function (val) {
      var cookieData = JSON.parse("[\"" + utils.getFrom(val, "", "]") + "]");
      jar.setCookie(utils.formatCookie(cookieData, "facebook"), "https://www.facebook.com");
    });
    // ---------- Very Hacky Part Ends -----------------

    log.info("login", "Logging in...");
    return utils
      .post("https://www.facebook.com/login/device-based/regular/login/?login_attempt=1&lwv=110", jar, form, loginOptions)
      .then(utils.saveCookies(jar))
      .then(function (res) {
        var headers = res.headers;
        if (!headers.location) {
          throw { error: "Wrong username/password." };
        }

        // This means the account has login approvals turned on.
        if (headers.location.indexOf('https://www.facebook.com/checkpoint/') > -1) {
          log.info("login", "You have login approvals turned on.");
          var nextURL = 'https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php';

          return utils
            .get(headers.location, jar, null, loginOptions, { requestKind: "navigation" })
            .then(utils.saveCookies(jar))
            .then(function (res) {
              var html = res.body;
              // Make the form in advance which will contain the fb_dtsg and nh
              var $ = cheerio.load(html);
              var arr = [];
              $("form input").map(function (i, v) {
                arr.push({ val: $(v).val(), name: $(v).attr("name") });
              });

              arr = arr.filter(function (v) {
                return v.val && v.val.length;
              });

              var form = utils.arrToForm(arr);
              if (html.indexOf("checkpoint/?next") > -1) {
                setTimeout(() => {
                  checkVerified = setInterval((_form) => {
                    /* utils
                      .post("https://www.facebook.com/login/approvals/approved_machine_check/", jar, form, loginOptions, null, {
                        "Referer": "https://www.facebook.com/checkpoint/?next"
                      })
                      .then(utils.saveCookies(jar))
                      .then(res => {
                        try {
                          JSON.parse(res.body.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*()/, ""));
                        } catch (ex) {
                          clearInterval(checkVerified);
                          log.info("login", "Verified from browser. Logging in...");
                          return loginHelper(utils.getAppState(jar), email, password, loginOptions, callback);
                        }
                      })
                      .catch(ex => {
                        log.error("login", ex);
                      }); */
                  }, 5000, {
                    fb_dtsg: form.fb_dtsg,
                    jazoest: form.jazoest,
                    dpr: 1
                  });
                }, 2500);
                throw {
                  error: 'login-approval',
                  continue: function submit2FA(code) {
                    form.approvals_code = code;
                    form['submit[Continue]'] = $("#checkpointSubmitButton").html(); //'Continue';
                    var prResolve = null;
                    var prReject = null;
                    var rtPromise = new Promise(function (resolve, reject) {
                      prResolve = resolve;
                      prReject = reject;
                    });
                    if (typeof code == "string") {
                      utils
                        .post(nextURL, jar, form, loginOptions)
                        .then(utils.saveCookies(jar))
                        .then(function (res) {
                          var $ = cheerio.load(res.body);
                          var error = $("#approvals_code").parent().attr("data-xui-error");
                          if (error) {
                            throw {
                              error: 'login-approval',
                              errordesc: "Invalid 2FA code.",
                              lerror: error,
                              continue: submit2FA
                            };
                          }
                        })
                        .then(function () {
                          // Use the same form (safe I hope)
                          delete form.no_fido;
                          delete form.approvals_code;
                          form.name_action_selected = 'dont_save'; //'save_device';

                          return utils
                            .post(nextURL, jar, form, loginOptions)
                            .then(utils.saveCookies(jar));
                        })
                        .then(function (res) {
                          var headers = res.headers;
                          if (!headers.location && res.body.indexOf('Review Recent Login') > -1) {
                            throw { error: "Something went wrong with login approvals." };
                          }

                          var appState = utils.getAppState(jar);

                          if (callback === prCallback) {
                            callback = function (err, api) {
                              if (err) {
                                return prReject(err);
                              }
                              return prResolve(api);
                            };
                          }

                          // Simply call loginHelper because all it needs is the jar
                          // and will then complete the login process
                          return loginHelper(appState, email, password, loginOptions, callback);
                        })
                        .catch(function (err) {
                          // Check if using Promise instead of callback
                          if (callback === prCallback) {
                            prReject(err);
                          } else {
                            callback(err);
                          }
                        });
                    } else {
                      utils
                        .post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form, loginOptions, null, {
                          "Referer": "https://www.facebook.com/checkpoint/?next"
                        })
                        .then(utils.saveCookies(jar))
                        .then(res => {
                          try {
                            JSON.parse(res.body.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*/, ""));
                          } catch (ex) {
                            clearInterval(checkVerified);
                            log.info("login", "Verified from browser. Logging in...");
                            if (callback === prCallback) {
                              callback = function (err, api) {
                                if (err) {
                                  return prReject(err);
                                }
                                return prResolve(api);
                              };
                            }
                            return loginHelper(utils.getAppState(jar), email, password, loginOptions, callback);
                          }
                        })
                        .catch(ex => {
                          log.error("login", ex);
                          if (callback === prCallback) {
                            prReject(ex);
                          } else {
                            callback(ex);
                          }
                        });
                    }
                    return rtPromise;
                  }
                };
              } else {
                if (!loginOptions.forceLogin) {
                  throw { error: "Couldn't login. Facebook might have blocked this account. Please login with a browser or enable the option 'forceLogin' and try again." };
                }
                if (html.indexOf("Suspicious Login Attempt") > -1) {
                  form['submit[This was me]'] = "This was me";
                } else {
                  form['submit[This Is Okay]'] = "This Is Okay";
                }

                return utils
                  .post(nextURL, jar, form, loginOptions)
                  .then(utils.saveCookies(jar))
                  .then(function () {
                    // Use the same form (safe I hope)
                    form.name_action_selected = 'save_device';

                    return utils
                      .post(nextURL, jar, form, loginOptions)
                      .then(utils.saveCookies(jar));
                  })
                  .then(function (res) {
                    var headers = res.headers;

                    if (!headers.location && res.body.indexOf('Review Recent Login') > -1) {
                      throw { error: "Something went wrong with review recent login." };
                    }

                    var appState = utils.getAppState(jar);

                    // Simply call loginHelper because all it needs is the jar
                    // and will then complete the login process
                    return loginHelper(appState, email, password, loginOptions, callback);
                  })
                  .catch(function (e) {
                    callback(e);
                  });
              }
            });
        }

        return utils
          .get('https://www.facebook.com/', jar, null, loginOptions)
          .then(utils.saveCookies(jar));
      });
  };
}

// Helps the login
function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
  var mainPromise = null;
  var jar = utils.getJar();

  // If we're given an appState we loop through it and save each cookie
  // back into the jar.
  if (appState) {
    appState = normalizeAppState(appState);

    appState.map(function (c) {
      if (!c || !c.key) return;
      var str = c.key + "=" + c.value + "; expires=" + c.expires + "; domain=" + c.domain + "; path=" + c.path + ";";
      jar.setCookie(str, "http://" + c.domain);
    });

    // Load the main page.
    mainPromise = utils
      .get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true, requestKind: "navigation" })
      .then(utils.saveCookies(jar));
  } else {
    // Open the main page, then we login with the given credentials and finally
    // load the main page again (it'll give us some IDs that we need)
    mainPromise = utils
      .get("https://www.facebook.com/", null, null, globalOptions, { noRef: true, requestKind: "navigation" })
      .then(utils.saveCookies(jar))
      .then(makeLogin(jar, email, password, globalOptions, callback, prCallback))
      .then(function () {
        return utils
          .get('https://www.facebook.com/', jar, null, globalOptions, { requestKind: "navigation" })
          .then(utils.saveCookies(jar));
      });
  }

  var ctx = null;
  var _defaultFuncs = null;
  var api = null;

  mainPromise = mainPromise
    .then(function (res) {
      // Hacky check for the redirection that happens on some ISPs, which doesn't return statusCode 3xx
      var reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
      var redirect = reg.exec(res.body);
      if (redirect && redirect[1]) {
        return utils
          .get(redirect[1], jar, null, globalOptions, { requestKind: "navigation" })
          .then(utils.saveCookies(jar));
      }
      return res;
    })
    .then(function (res) {
      return checkAutoBehaviorCheckpoint(res, jar, appState, globalOptions);
    })
    .then(function (res) {
      return throwIfLockedOrSuspended(res, appState, jar);
    })
    .then(function () {
      // ws3 flow stabilizes appstate sessions by loading /home.php before building API.
      return utils
        .get("https://www.facebook.com/home.php", jar, null, globalOptions, { requestKind: "navigation" })
        .then(utils.saveCookies(jar));
    })
    .then(function (res) {
      return throwIfLockedOrSuspended(res, appState, jar);
    })
    .then(function (res) {
      var html = res.body;
      var stuff = buildAPI(globalOptions, html, jar);
      ctx = stuff[0];
      _defaultFuncs = stuff[1];
      api = stuff[2];
      return res;
    });

  // given a pageID we log in as a page
  if (globalOptions.pageID) {
    mainPromise = mainPromise
      .then(function () {
        return utils
          .get('https://www.facebook.com/' + ctx.globalOptions.pageID + '/messages/?section=messages&subsection=inbox', ctx.jar, null, globalOptions, { requestKind: "navigation" });
      })
      .then(function (resData) {
        var url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
        url = url.substring(0, url.length - 1);

        return utils
          .get('https://www.facebook.com' + url, ctx.jar, null, globalOptions, { requestKind: "navigation" });
      });
  }

  // At the end we call the callback or catch an exception
  mainPromise
    .then(function () {
      log.info("login", 'Done logging in.');
      return callback(null, api);
    })
    .catch(function (e) {
      log.error("login", e.error || e);
      callback(e);
    });
}

function login(loginData, options, callback) {
  if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
    callback = options;
    options = {};
  }

  var globalOptions = {
    selfListen: false,
    listenEvents: false,
    listenTyping: false,
    updatePresence: false,
    forceLogin: false,
    autoMarkDelivery: true,
    autoMarkRead: false,
    autoReconnect: true,

    logRecordSize: defaultLogRecordSize,
    online: true,
    emitReady: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.8103.38 Safari/537.36"
  };

  setOptions(globalOptions, options);

  var prCallback = null;
  if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
    var rejectFunc = null;
    var resolveFunc = null;
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    prCallback = function (error, api) {
      if (error) {
        return rejectFunc(error);
      }
      return resolveFunc(api);
    };
    callback = prCallback;
  }
  loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
  return returnPromise;
}

module.exports = login;
