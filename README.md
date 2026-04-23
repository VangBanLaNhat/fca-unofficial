# Unofficial Facebook Chat API
<a href="https://www.npmjs.com/package/fca-unofficial"><img alt="npm version" src="https://img.shields.io/npm/v/fca-unofficial.svg?style=flat-square"></a>
<img alt="version" src="https://img.shields.io/github/package-json/v/VangBanLaNhat/fca-unofficial?label=github&style=flat-square">
<a href="https://www.npmjs.com/package/fca-unofficial"><img src="https://img.shields.io/npm/dm/fca-unofficial.svg?style=flat-square" alt="npm downloads"></a>
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Facebook now has an official API for chat bots [here](https://developers.facebook.com/docs/messenger-platform).

This API is the only way to automate chat functionalities on a user account. We do this by emulating the browser. This means doing the exact same GET/POST requests and tricking Facebook into thinking we're accessing the website normally. Because we're doing it this way, this API won't work with an auth token but requires the credentials of a Facebook account.

_Disclaimer_: We are not responsible if your account gets banned for spammy activities such as sending lots of messages to people you don't know, sending messages very quickly, sending spammy looking URLs, logging in and out very quickly... Be responsible Facebook citizens.

See [below](#projects-using-this-api) for projects using this API.

See the [full changelog](/CHANGELOG.md) for release details.

## Install
If you just want to use fca-unofficial, you should use this command:
```bash
npm install fca-unofficial
```
It will download `fca-unofficial` from NPM repositories

### Bleeding edge
If you want to use bleeding edge (directly from github) to test new features or submit bug report, this is the command for you:
```bash
npm install VangBanLaNhat/fca-unofficial
```

## Testing your bots
If you want to test your bots without creating another account on Facebook, you can use [Facebook Whitehat Accounts](https://www.facebook.com/whitehat/accounts/).

## Example Usage
```javascript
const login = require("fca-unofficial");

// Create simple echo bot
login({email: "FB_EMAIL", password: "FB_PASSWORD"}, (err, api) => {
    if(err) return console.error(err);

    api.listen((err, message) => {
        api.sendMessage(message.body, message.threadID);
    });
});
```

Result:

<img width="517" alt="screen shot 2016-11-04 at 14 36 00" src="https://cloud.githubusercontent.com/assets/4534692/20023545/f8c24130-a29d-11e6-9ef7-47568bdbc1f2.png">


## Documentation

You can see it [here](DOCS.md).

## Main Functionality

### Sending a message
#### api.sendMessage(message, threadID[, callback][, messageID])

Various types of message can be sent:
* *Regular:* set field `body` to the desired message as a string.
* *Sticker:* set a field `sticker` to the desired sticker ID.
* *File or image:* Set field `attachment` to a readable stream or an array of readable streams.
* *URL:* set a field `url` to the desired URL.
* *Emoji:* set field `emoji` to the desired emoji as a string and set field `emojiSize` with size of the emoji (`small`, `medium`, `large`)

Note that a message can only be a regular message (which can be empty) and optionally one of the following: a sticker, an attachment or a url.

__Tip__: to find your own ID, you can look inside the cookies. The `userID` is under the name `c_user`.

__Example (Basic Message)__
```js
const login = require("fca-unofficial");

login({email: "FB_EMAIL", password: "FB_PASSWORD"}, (err, api) => {
    if(err) return console.error(err);

    var yourID = "000000000000000";
    var msg = "Hey!";
    api.sendMessage(msg, yourID);
});
```

__Example (File upload)__
```js
const login = require("fca-unofficial");

login({email: "FB_EMAIL", password: "FB_PASSWORD"}, (err, api) => {
    if(err) return console.error(err);

    // Note this example uploads an image called image.jpg
    var yourID = "000000000000000";
    var msg = {
        body: "Hey!",
        attachment: fs.createReadStream(__dirname + '/image.jpg')
    }
    api.sendMessage(msg, yourID);
});
```

------------------------------------
### Saving session.

To avoid logging in every time you should save AppState (cookies etc.) to a file, then you can use it without having password in your scripts.

__Example__

```js
const fs = require("fs");
const login = require("fca-unofficial");

var credentials = {email: "FB_EMAIL", password: "FB_PASSWORD"};

login(credentials, (err, api) => {
    if(err) return console.error(err);

    fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()));
});
```

Alternative: Use [c3c-fbstate](https://github.com/lequanglam/c3c-fbstate) to get fbstate.json (appstate.json)

------------------------------------

### Listening to a chat
#### api.listen(callback)

Listen watches for messages sent in a chat. By default this won't receive events (joining/leaving a chat, title change etc…) but it can be activated with `api.setOptions({listenEvents: true})`. This will by default ignore messages sent by the current account, you can enable listening to your own messages with `api.setOptions({selfListen: true})`.

__Example__

```js
const fs = require("fs");
const login = require("fca-unofficial");

// Simple echo bot. It will repeat everything that you say.
// Will stop when you say '/stop'
login({appState: JSON.parse(fs.readFileSync('appstate.json', 'utf8'))}, (err, api) => {
    if(err) return console.error(err);

    api.setOptions({listenEvents: true});

    var stopListening = api.listenMqtt((err, event) => {
        if(err) return console.error(err);

        api.markAsRead(event.threadID, (err) => {
            if(err) console.error(err);
        });

        switch(event.type) {
            case "message":
                if(event.body === '/stop') {
                    api.sendMessage("Goodbye…", event.threadID);
                    return stopListening();
                }
                api.sendMessage("TEST BOT: " + event.body, event.threadID);
                break;
            case "event":
                console.log(event);
                break;
        }
    });
});
```

------------------------------------

### E2EE Support (meta-messenger bridge)

`fca-unofficial` supports receiving and sending E2EE messages by bridging to `meta-messenger.js`.

Enable E2EE at login:

```js
login({ appState }, {
    enableE2EE: true,
    e2eeMemoryOnly: false,
    e2eeDevicePath: "./e2ee_device.json"
}, (err, api) => {
    if (err) return console.error(err);

    api.listenMqtt((listenErr, event) => {
        if (listenErr) return console.error(listenErr);

        if (event.type === "e2ee_message") {
            console.log("[E2EE]", event.body, event.e2ee.chatJid);
        }
    });
});
```

Added E2EE APIs:

- `api.connectE2EE(callback)`
- `api.disconnectE2EE(callback)`
- `api.getE2EEDeviceData(callback)`
- `api.sendMessageE2EE(chatJid, message, callback)`
- `api.sendMediaE2EE(chatJid, mediaType, data, options, callback)`
- `api.sendReactionE2EE(chatJid, messageID, senderJid, reaction, callback)`
- `api.sendTypingE2EE(chatJid, isTyping, callback)`
- `api.unsendMessageE2EE(chatJid, messageID, callback)`
- `api.downloadE2EEMedia(options, callback)`

Auto routing behavior:

- `api.sendMessage(...)` auto-selects normal or E2EE by `threadID` format.
- `api.sendTypingIndicator(...)`, `api.unsendMessage(...)`, and `api.setMessageReaction(...)` also support auto routing when E2EE metadata is provided.
- E2EE-specific APIs (`sendMessageE2EE`, `sendMediaE2EE`, `sendReactionE2EE`, `sendTypingE2EE`, `unsendMessageE2EE`) auto-fallback to normal transport when target is not an E2EE chat JID.
- For non-E2EE threads, MQTT is now the default transport when MQTT client is connected (`listenMqtt` active).
- Dedicated files `sendMessageMqtt.js` and `setMessageReactionMqtt.js` were removed; legacy method names are still aliased for backward compatibility.

## FAQS

1. How do I run tests?
> For tests, create a `test-config.json` file that resembles `example-config.json` and put it in the `test` directory. From the root >directory, run `npm test`.

2. Why doesn't `sendMessage` always work when I'm logged in as a page?
> Pages can't start conversations with users directly; this is to prevent pages from spamming users.

3. What do I do when `login` doesn't work?
> First check that you can login to Facebook using the website. If login approvals are enabled, you might be logging in incorrectly. For how to handle login approvals, read our docs on [`login`](DOCS.md#login).

4. How can I avoid logging in every time?  Can I log into a previous session?
> We support caching everything relevant for you to bypass login. `api.getAppState()` returns an object that you can save and pass into login as `{appState: mySavedAppState}` instead of the credentials object.  If this fails, your session has expired.

5. Do you support sending messages as a page?
> Yes, set the pageID option on login (this doesn't work if you set it using api.setOptions, it affects the login process).
> ```js
> login(credentials, {pageID: "000000000000000"}, (err, api) => { … }
> ```

6. I'm getting some crazy weird syntax error like `SyntaxError: Unexpected token [`!!!
> Please try to update your version of node.js before submitting an issue of this nature.  We like to use new language features.

7. I don't want all of these logging messages!
> You can use `api.setOptions` to silence the logging. You get the `api` object from `login` (see example above). Do
> ```js
> api.setOptions({
>     logLevel: "silent"
> });
> ```

8. If my project installs `fca-unofficial` as a dependency, do I need to run `pnpm run build:e2ee` in that project?
> Usually no. That script lives in `fca-unofficial` itself, so it is only available when you run it inside the package that defines it. For consuming projects, the normal flow is to install dependencies and let `meta-messenger.js` download its prebuilt bridge during install.
>
> If you want your own app to expose a wrapper, you can add a script like this in your app's `package.json`:
> ```json
>   "scripts": {
>     "build:e2ee": "node -e \"const cp=require('child_process');const fs=require('fs');const path=require('path');const {createRequire}=require('module');const fcaPkg=require.resolve('fca-unofficial/package.json');const fcaRequire=createRequire(fcaPkg);let metaPkg;try{metaPkg=fcaRequire.resolve('meta-messenger.js/package.json');}catch(e){console.error('meta-messenger.js not found from fca-unofficial context. Run: pnpm add meta-messenger.js');process.exit(1);}const p=path.dirname(metaPkg);cp.execSync('pnpm install --force --ignore-scripts=false',{cwd:p,stdio:'inherit',shell:true});cp.execSync('node scripts/postinstall.mjs',{cwd:p,stdio:'inherit',shell:true});let ext='so';if(process.platform==='win32') ext='dll';if(process.platform==='darwin') ext='dylib';const out=path.join(p,'build','messagix.'+ext);if(!fs.existsSync(out)){console.error('E2EE native bridge was not created: '+out);console.error('Try: MESSAGIX_BUILD_FROM_SOURCE=true pnpm run build:e2ee (requires Go)');process.exit(1);}console.log('E2EE bridge ready: '+out);\""
>   }
> ```
> If the bridge is still missing, rebuild from source with `MESSAGIX_BUILD_FROM_SOURCE=true` and Go 1.24+.

<a name="projects-using-this-api"></a>
## Projects using this API:

- [c3c](https://github.com/lequanglam/c3c) - A bot that can be customizable using plugins. Support Facebook & Discord.

## Projects using this API (original repository, facebook-chat-api):

- [Messer](https://github.com/mjkaufer/Messer) - Command-line messaging for Facebook Messenger
- [messen](https://github.com/tomquirk/messen) - Rapidly build Facebook Messenger apps in Node.js
- [Concierge](https://github.com/concierge/Concierge) - Concierge is a highly modular, easily extensible general purpose chat bot with a built in package manager
- [Marc Zuckerbot](https://github.com/bsansouci/marc-zuckerbot) - Facebook chat bot
- [Marc Thuckerbot](https://github.com/bsansouci/lisp-bot) - Programmable lisp bot
- [MarkovsInequality](https://github.com/logicx24/MarkovsInequality) - Extensible chat bot adding useful functions to Facebook Messenger
- [AllanBot](https://github.com/AllanWang/AllanBot-Public) - Extensive module that combines the facebook api with firebase to create numerous functions; no coding experience is required to implement this.
- [Larry Pudding Dog Bot](https://github.com/Larry850806/facebook-chat-bot) - A facebook bot you can easily customize the response
- [fbash](https://github.com/avikj/fbash) - Run commands on your computer's terminal over Facebook Messenger
- [Klink](https://github.com/KeNt178/klink) - This Chrome extension will 1-click share the link of your active tab over Facebook Messenger
- [Botyo](https://github.com/ivkos/botyo) - Modular bot designed for group chat rooms on Facebook
- [matrix-puppet-facebook](https://github.com/matrix-hacks/matrix-puppet-facebook) - A facebook bridge for [matrix](https://matrix.org)
- [facebot](https://github.com/Weetbix/facebot) - A facebook bridge for Slack.
- [Botium](https://github.com/codeforequity-at/botium-core) - The Selenium for Chatbots
- [Messenger-CLI](https://github.com/AstroCB/Messenger-CLI) - A command-line interface for sending and receiving messages through Facebook Messenger.
- [AssumeZero-Bot](https://github.com/AstroCB/AssumeZero-Bot) – A highly customizable Facebook Messenger bot for group chats.
- [Miscord](https://github.com/Bjornskjald/miscord) - An easy-to-use Facebook bridge for Discord.
- [chat-bridge](https://github.com/rexx0520/chat-bridge) - A Messenger, Telegram and IRC chat bridge.
- [messenger-auto-reply](https://gitlab.com/theSander/messenger-auto-reply) - An auto-reply service for Messenger.
- [BotCore](https://github.com/AstroCB/BotCore) – A collection of tools for writing and managing Facebook Messenger bots.
- [mnotify](https://github.com/AstroCB/mnotify) – A command-line utility for sending alerts and notifications through Facebook Messenger.
