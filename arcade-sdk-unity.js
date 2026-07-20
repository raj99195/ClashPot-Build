/**
 * ArcadeX SDK v2.0.0 — Unity WebGL Edition
 * Place this file in your WebGL Build folder (same as index.html)
 * https://arcade-x-sand.vercel.app/sdk
 *
 * This file exposes global functions that ArcadeBridge.jslib calls from C#:
 *   arcade_init(gameId)
 *   arcade_updateScore(score)
 *   arcade_gameOver(finalScore)
 *   arcade_pause()
 *   arcade_resume()
 *
 * NOTE: index.html must set `window.unityInstance = instance;` inside the
 * createUnityInstance(...).then(...) callback — modern Unity WebGL loaders
 * (createUnityInstance) do NOT expose a global SendMessage function, only
 * instance.SendMessage(). Without that, every sendToUnity() call below is a
 * silent no-op — no error, no warning, nothing reaches C#.
 */

(function (global) {
  "use strict";

  // ─── Core SDK (same as arcade-sdk.js) ──────────────────────
  var ArcadeSDK = {
    version: "2.0.0",
    gameId: "",
    currentScore: 0,
    initialized: false,
    debug: false,

    init: function (gameId, options) {
      this.gameId = gameId || "";
      this.currentScore = 0;
      this.initialized = true;
      this.debug = (options && options.debug) || false;
      this._log("ArcadeX Unity SDK v" + this.version + " initialized", { gameId: this.gameId });
      this._post({ type: "ARCADE_SDK_READY", gameId: this.gameId, engine: "unity" });
      window.addEventListener("message", this._onMessage.bind(this));
      return this;
    },

    updateScore: function (score) {
      this.currentScore = parseInt(score) || 0;
      this._post({ type: "SCORE_UPDATE", score: this.currentScore, gameId: this.gameId });
      this._log("Score:", this.currentScore);
    },

    gameOver: function (finalScore) {
      var score = finalScore !== undefined ? parseInt(finalScore) : this.currentScore;
      this.currentScore = score;
      this._post({ type: "GAME_OVER", score: score, gameId: this.gameId });
      this._log("Game over:", score);
    },

    pause: function () { this._post({ type: "GAME_PAUSED", gameId: this.gameId }); },
    resume: function () { this._post({ type: "GAME_RESUMED", gameId: this.gameId }); },
    getScore: function () { return this.currentScore; },

    _post: function (data) {
      try {
        var msg = Object.assign({}, data, { _arcadex: true, version: this.version });
        if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
        window.postMessage(msg, "*");
      } catch (e) { console.error("[ArcadeSDK] postMessage error:", e); }
    },

    // ─── Unity bridge — replaces the old `if (typeof SendMessage === "function")` checks ───
    _sendToUnity: function (obj, method, value) {
      if (window.unityInstance && typeof window.unityInstance.SendMessage === "function") {
        try {
          window.unityInstance.SendMessage(obj, method, value);
        } catch (e) {
          console.error("[ArcadeSDK] SendMessage failed:", obj, method, e);
        }
      } else {
        console.warn("[ArcadeSDK] unityInstance not ready — dropped message:", obj, method, value);
      }
    },

    _onMessage: function (e) {
      var d = e.data;
      if (!d || !d._platform) return;

      if (d.type === "TRANSACTION_SUCCESS") {
        this._log("✅ On-chain!", d.txHash);

        if (typeof this.onSuccess === "function")
          this.onSuccess(d.txHash);

        this._sendToUnity("ArcadeManager", "OnTransactionSuccess", d.txHash || "");
      }

      if (d.type === "TRANSACTION_FAILED") {
        console.warn("[ArcadeSDK] ❌ TX Failed:", d.error);

        if (typeof this.onError === "function")
          this.onError(d.error);

        this._sendToUnity("ArcadeManager", "OnTransactionFailed", d.error || "");
      }

      if (d.type === "PLAYER_INFO") {
        this._log("👤 Player Info", d.player);

        this._sendToUnity("ArcadeManager", "OnPlayerInfoReceived", JSON.stringify(d.player || {}));
      }

      // ─── ClashPot Escrow ─────────────────────────────────────
      if (d.type === "CLASHPOT_JOIN_SUCCESS") {
        this._log("✅ Escrow deposit success", d.txHash);
        this._sendToUnity("ArcadeManager", "OnEscrowJoinSuccess", d.txHash || "");
      }

      if (d.type === "CLASHPOT_JOIN_FAILED") {
        console.warn("[ArcadeSDK] ❌ Escrow deposit failed:", d.error);
        this._sendToUnity("ArcadeManager", "OnEscrowJoinFailed", d.error || "Deposit failed");
      }

      if (d.type === "CLASHPOT_SETTLE_SUCCESS") {
        this._log("✅ Match settled on-chain", d.txHash);
        this._sendToUnity("ArcadeManager", "OnSettleSuccess", d.txHash || "");
      }
    },

    _log: function () {
      if (this.debug) { var a = Array.prototype.slice.call(arguments); a.unshift("[ArcadeSDK Unity]"); console.log.apply(console, a); }
    },
  };

  global.ArcadeSDK = ArcadeSDK;

  // ─── Unity C# Bridge Functions ─────────────────────────────
  // These are called by ArcadeBridge.jslib from C# via DllImport
  global.arcade_init = function (gameId) {
    ArcadeSDK.init(gameId ? UTF8ToString(gameId) : "");
  };

  global.arcade_updateScore = function (score) {
    ArcadeSDK.updateScore(score);
  };

  global.arcade_gameOver = function (finalScore) {
    ArcadeSDK.gameOver(finalScore);
  };

  global.arcade_pause = function () {
    ArcadeSDK.pause();
  };

  global.arcade_resume = function () {
    ArcadeSDK.resume();
  };

  global.arcade_getScore = function () {
    return ArcadeSDK.getScore();
  };
  global.arcade_getPlayerProfile = function () {
    ArcadeSDK._post({
        type: "GET_PLAYER_INFO",
        gameId: ArcadeSDK.gameId
    });
};


  // ClashPot: stake deposit request — jslib ise call kar sakta hai
  global.arcade_joinEscrow = function (matchKeyPtr, stakeWeiPtr) {
    var matchKey = typeof matchKeyPtr === "string" ? matchKeyPtr : UTF8ToString(matchKeyPtr);
    var stakeWei = typeof stakeWeiPtr === "string" ? stakeWeiPtr : UTF8ToString(stakeWeiPtr);
    ArcadeSDK._log("ClashPot joinEscrow", matchKey, stakeWei);
    ArcadeSDK._post({
      type: "CLASHPOT_JOIN",
      matchKey: matchKey,
      stakeWei: stakeWei,
      gameId: ArcadeSDK.gameId
    });
  };

})(typeof window !== "undefined" ? window : this);