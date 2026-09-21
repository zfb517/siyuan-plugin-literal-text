"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  default: () => LiteralTextPlugin
});
module.exports = __toCommonJS(src_exports);
var import_siyuan = require("siyuan");
var STORAGE_KEY = "escape-config";
var API_COPY = "/api/extension/copy";
var API_INSERT = "/api/block/insertBlock";
var SAFE_ASTERISK = "\\*";
var SAFE_HASH = "\\#";
var ICON_SYMBOLS = `
<symbol id="iconEscape" viewBox="0 0 24 24">
  <path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
</symbol>
<symbol id="iconPaste" viewBox="0 0 24 24">
  <path fill="currentColor" d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1zm7 18H5V4h2v3h10V4h2v16z"/>
</symbol>
<symbol id="iconShieldOn" viewBox="0 0 24 24">
  <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
</symbol>
<symbol id="iconShieldOff" viewBox="0 0 24 24">
  <path fill="none" stroke="currentColor" stroke-width="2" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
</symbol>`;
var ICON_CODE_ID = "iconEscape";
var ICON_PASTE_ID = "iconPaste";
var ICON_ESCAPE_ON_ID = "iconShieldOn";
var ICON_ESCAPE_OFF_ID = "iconShieldOff";
var ESC_SLOT = "__literalTextEscapeHandler";
function _getEscSlot() {
  return document[ESC_SLOT] || null;
}
function _setEscSlot(h) {
  document[ESC_SLOT] = h;
}
var DEFAULT_HOTKEYS = {
  quickLiteralInput: "\u21E7\u2318L",
  toggleAutoEscape: "\u21E7\u2318E",
  richPaste: "\u21E7\u2318V"
};
var _isMac = () => navigator.platform.toUpperCase().indexOf("MAC") > -1;
var _isNotCtrl = (event) => !event.metaKey && !event.ctrlKey;
var _isOnlyMeta = (event) => _isMac() ? event.metaKey && !event.ctrlKey : !event.metaKey && event.ctrlKey;
var KEYCODELIST = (() => {
  const m = {};
  for (let i = 1; i <= 32; i++) m[i + 111] = "F" + i;
  const entries = [
    [8, "\u232B"],
    [9, "\u21E5"],
    [13, "\u21A9"],
    [16, "\u21E7"],
    [17, "\u2303"],
    [18, "\u2325"],
    [19, "Pause"],
    [20, "CapsLock"],
    [27, "Escape"],
    [32, " "],
    [33, "PageUp"],
    [34, "PageDown"],
    [35, "End"],
    [36, "Home"],
    [37, "\u2190"],
    [38, "\u2191"],
    [39, "\u2192"],
    [40, "\u2193"],
    [44, "PrintScreen"],
    [45, "Insert"],
    [46, "\u2326"]
  ];
  for (let i = 0; i < 10; i++) entries.push([48 + i, String(i)]);
  for (let c = 65; c <= 90; c++) entries.push([c, String.fromCharCode(c)]);
  entries.push([91, "\u2318"], [92, "\u2318"], [93, "ContextMenu"]);
  for (let i = 0; i < 10; i++) entries.push([96 + i, String(i)]);
  entries.push([106, "*"], [107, "+"], [109, "-"], [110, "."], [111, "/"]);
  entries.push([144, "NumLock"], [145, "ScrollLock"], [182, "MyComputer"], [183, "MyCalculator"]);
  entries.push([186, ";"], [187, "="], [188, ","], [189, "-"], [190, "."], [191, "/"], [192, "`"]);
  entries.push([219, "["], [220, "\\"], [221, "]"], [222, "'"]);
  for (const [k, v] of entries) m[k] = v;
  return m;
})();
var _normalizeShortcutKey = (key, mac) => {
  if (mac || !key.startsWith("\u2303")) return key;
  if (key === "\u2303D") return "";
  return key.replace("\u2318", "").replace("\u2303", "\u2318").replace("\u2318\u21E7", "\u21E7\u2318").replace("\u2318\u2325\u21E7", "\u21E5\u2318").replace("\u2318\u2325", "\u2325\u2318");
};
var _matchHotKey = (hotKey, event) => {
  if (!hotKey) return false;
  hotKey = _normalizeShortcutKey(hotKey, _isMac());
  if (!hotKey) return false;
  if (hotKey.indexOf("\u21E7") === -1 && hotKey.indexOf("\u2318") === -1 && hotKey.indexOf("\u2325") === -1 && hotKey.indexOf("\u2303") === -1) {
    if (_isNotCtrl(event) && !event.altKey && !event.shiftKey && hotKey === KEYCODELIST[event.keyCode]) return true;
    return false;
  }
  const hotKeys = [];
  let idx = 0;
  while (idx < hotKey.length && "\u2303\u2325\u21E7\u2318".includes(hotKey[idx])) {
    hotKeys.push(hotKey[idx]);
    idx++;
  }
  const mainKey = hotKey.slice(idx);
  if (mainKey) hotKeys.push(mainKey);
  if (hotKey.startsWith("\u21E7") && hotKeys.length === 2) {
    if (_isNotCtrl(event) && !event.altKey && event.shiftKey && hotKeys[1] === KEYCODELIST[event.keyCode]) return true;
    return false;
  }
  if (hotKey.startsWith("\u2325")) {
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) keyCode = hotKeys[3];
    const isMatchKey = keyCode === KEYCODELIST[event.keyCode];
    if (isMatchKey && event.altKey && !event.shiftKey && hotKeys.length < 4 && (hotKeys.length === 3 ? _isOnlyMeta(event) && hotKey.startsWith("\u2325\u2318") : _isNotCtrl(event))) return true;
    if (isMatchKey && hotKey.startsWith("\u2325\u21E7\u2318") && hotKeys.length === 4 && event.altKey && event.shiftKey && _isOnlyMeta(event)) return true;
    if (isMatchKey && hotKey.startsWith("\u2325\u21E7") && hotKeys.length === 3 && event.altKey && event.shiftKey && _isNotCtrl(event)) return true;
    return false;
  }
  if (hotKey.startsWith("\u2303")) {
    if (!_isMac()) return false;
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) keyCode = hotKeys[3];
    else if (hotKeys.length === 5) keyCode = hotKeys[4];
    const isMatchKey = keyCode === KEYCODELIST[event.keyCode];
    if (isMatchKey && event.ctrlKey && !event.altKey && !event.shiftKey && hotKeys.length < 4 && (hotKeys.length === 3 ? event.metaKey && hotKey.startsWith("\u2303\u2318") : !event.metaKey)) return true;
    if (isMatchKey && hotKey.startsWith("\u2303\u21E7") && hotKeys.length === 3 && event.ctrlKey && !event.altKey && event.shiftKey && !event.metaKey) return true;
    if (isMatchKey && hotKey.startsWith("\u2303\u2325") && hotKeys.length === 3 && event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey) return true;
    if (isMatchKey && hotKeys.length === 4 && event.ctrlKey && (hotKey.startsWith("\u2303\u2325\u21E7") && event.shiftKey && !event.metaKey && event.altKey || hotKey.startsWith("\u2303\u2325\u2318") && !event.shiftKey && event.metaKey && event.altKey || hotKey.startsWith("\u2303\u21E7\u2318") && event.shiftKey && event.metaKey && !event.altKey)) return true;
    if (isMatchKey && hotKeys.length === 5 && event.ctrlKey && event.shiftKey && event.metaKey && event.altKey) return true;
    return false;
  }
  const hasShift = hotKeys.length > 2 && hotKeys[0] === "\u21E7";
  if (_isOnlyMeta(event) && !event.altKey && (!hasShift && !event.shiftKey || hasShift && event.shiftKey)) {
    return (hasShift ? hotKeys[2] : hotKeys[1]) === KEYCODELIST[event.keyCode];
  }
  return false;
};
var _isMobile = () => {
  const f = (0, import_siyuan.getFrontend)();
  return f === "mobile" || f === "browser-mobile";
};
var LiteralTextPlugin = class extends import_siyuan.Plugin {
  /* ---------- 生命周期 ---------- */
  async onload() {
    this.config = await this.loadData(STORAGE_KEY).catch((err) => {
      console.warn("[\u8F6C\u4E49] \u914D\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", err);
      return {};
    }) || {};
    this.autoEscapeMode = this.config.autoEscape ?? true;
    this.richPasteEnabled = this.config.richPaste ?? true;
    this.escapeChars = Array.isArray(this.config.escapeChars) && this.config.escapeChars.length ? this.config.escapeChars.filter((c) => typeof c === "string" && c.length === 1) : ["*", "#"];
    this.assetSubdir = typeof this.config.assetSubdir === "string" ? this.config.assetSubdir : "";
    this.pasteHandler = null;
    this._escapeHandler = null;
    this._beforeInputHandler = null;
    this._escapeTopBarBtn = null;
    this._destroyed = false;
    this._savedRange = null;
    this._savedBlockId = null;
    this._savedProtyle = null;
    this._fallbackKeydownHandler = null;
    this._lastHotkeyToggleTime = 0;
    this._contextMenuHandler = null;
    this._blockIconMenuHandler = null;
    this.addIcons(ICON_SYMBOLS);
    this.addCommand({
      langKey: "quickLiteralInput",
      langText: "\u5B57\u9762\u6587\u672C\u5FEB\u901F\u8F93\u5165",
      hotkey: "\u21E7\u2318L",
      callback: () => {
        this._lastHotkeyToggleTime = Date.now();
        this._handleQuickInput();
      }
    });
    this.addCommand({
      langKey: "toggleAutoEscape",
      langText: "\u5207\u6362\u81EA\u52A8\u8F6C\u4E49",
      hotkey: "\u21E7\u2318E",
      callback: () => {
        this._lastHotkeyToggleTime = Date.now();
        this._toggleAutoEscape();
      }
    });
    this.addCommand({
      langKey: "richPaste",
      langText: "\u5BCC\u6587\u672C\u7C98\u8D34",
      hotkey: "\u21E7\u2318V",
      callback: () => {
        this._lastHotkeyToggleTime = Date.now();
        this._triggerRichPaste();
      }
    });
    this.addCommand({
      langKey: "selectionToLiteral",
      langText: "\u9009\u533A\u8F6C\u5B57\u9762\u91CF\uFF08\u884C\u5185\u4EE3\u7801\uFF09",
      callback: () => this._selectionToLiteral("code")
    });
    this.addCommand({
      langKey: "selectionToEscape",
      langText: "\u9009\u533A\u8F6C\u8F6C\u4E49\uFF08\u7EAF\u6587\u672C\uFF09",
      callback: () => this._selectionToLiteral("escape")
    });
    this.addCommand({
      langKey: "literalBlockInput",
      langText: "\u5B57\u9762\u6587\u672C\u5757\uFF08\u591A\u884C\uFF09",
      callback: () => this._showLiteralBlockDialog()
    });
    this.addCommand({
      langKey: "unescapeSelection",
      langText: "\u53CD\u5B57\u9762\uFF08\u8FD8\u539F\u4E3A\u666E\u901A\u6587\u672C\uFF09",
      callback: () => this._unescapeSelection()
    });
    this.addCommand({
      langKey: "convertToHalf",
      langText: "\u5168\u89D2\u8F6C\u534A\u89D2",
      callback: () => this._convertWidth("toHalf")
    });
    this.addCommand({
      langKey: "convertToFull",
      langText: "\u534A\u89D2\u8F6C\u5168\u89D2",
      callback: () => this._convertWidth("toFull")
    });
    this._registerFallbackHotkeys();
    this._setupContextMenus();
    this.protyleSlash = [
      {
        filter: ["\u5B57\u9762\u6587\u672C", "\u8F6C\u4E49\u6587\u672C", "literal", "escape", "zmbw", "zywb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5B57\u9762/\u8F6C\u4E49\u6587\u672C\u8F93\u5165</span><span class="b3-list-item__meta">*# \u4E0D\u88AB\u6E32\u67D3</span></div>',
        id: "literal-escape-input",
        callback: (protyle) => this._showLiteralDialog("code", protyle)
      },
      {
        filter: ["\u5BCC\u6587\u672C\u7C98\u8D34", "rich paste", "fwbzt"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5BCC\u6587\u672C\u7C98\u8D34</span><span class="b3-list-item__meta">\u81EA\u52A8\u4E0B\u8F7D\u56FE\u7247</span></div>',
        id: "rich-paste",
        callback: (protyle) => this._triggerRichPaste(protyle)
      },
      {
        filter: ["\u9009\u533A\u8F6C\u5B57\u9762", "selection literal", "xqzmb", "xqzzy"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u9009\u533A\u8F6C\u5B57\u9762</span><span class="b3-list-item__meta">\u9009\u4E2D\u6587\u672C\u2192\u884C\u5185\u4EE3\u7801/\u8F6C\u4E49</span></div>',
        id: "selection-literal",
        callback: () => this._openSelectionModeMenu()
      },
      {
        filter: ["\u5B57\u9762\u5757", "literal block", "zmk"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5B57\u9762\u6587\u672C\u5757</span><span class="b3-list-item__meta">\u63D2\u5165\u591A\u884C\u4EE3\u7801\u5757</span></div>',
        id: "literal-block",
        callback: () => this._showLiteralBlockDialog()
      },
      {
        filter: ["\u53CD\u5B57\u9762", "unwrap", "flz"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u53CD\u5B57\u9762</span><span class="b3-list-item__meta">\u8FD8\u539F\u884C\u5185\u4EE3\u7801/\u8F6C\u4E49</span></div>',
        id: "un-literal",
        callback: () => this._unescapeSelection()
      },
      {
        filter: ["\u5168\u534A\u89D2", "width", "qjzhb", "bjzqj"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5168\u534A\u89D2\u5207\u6362</span><span class="b3-list-item__meta">\uFF11\uFF0E\uFF15\u21C41.5</span></div>',
        id: "width-toggle",
        callback: () => this._openWidthModeMenu()
      }
    ];
    this._buildSettingPanel();
    this._initPaste();
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
    }
  }
  onLayoutReady() {
    try {
      this.addTopBar({
        icon: ICON_CODE_ID,
        title: "\u5B57\u9762\u6587\u672C\uFF08Ctrl+Shift+L\uFF09",
        position: "right",
        callback: () => this._handleQuickInput()
      });
      this.addTopBar({
        icon: ICON_PASTE_ID,
        title: "\u5BCC\u7C98\u8D34\uFF08Ctrl+Shift+V\uFF09",
        position: "right",
        callback: () => this._triggerRichPaste()
      });
      const escIcon = this.autoEscapeMode ? ICON_ESCAPE_ON_ID : ICON_ESCAPE_OFF_ID;
      const escTitle = this.autoEscapeMode ? "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5F00\u542F\uFF08\u70B9\u51FB\u6216 Ctrl+Shift+E \u5173\u95ED\uFF09" : "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5173\u95ED\uFF08\u70B9\u51FB\u6216 Ctrl+Shift+E \u5F00\u542F\uFF09";
      this._escapeTopBarBtn = this.addTopBar({
        icon: escIcon,
        title: escTitle,
        position: "right",
        callback: () => this._toggleAutoEscape()
      });
    } catch (e) {
      console.warn("[\u8F6C\u4E49] \u9876\u680F\u6309\u94AE\u6CE8\u518C\u5931\u8D25\uFF08\u79FB\u52A8\u7AEF\u53EF\u80FD\u4E0D\u652F\u6301\uFF09:", e.message);
    }
  }
  onunload() {
    this._destroyed = true;
    this._removeEscapeListener();
    this._unregisterFallbackHotkeys();
    if (this.pasteHandler) {
      this.eventBus.off("paste", this.pasteHandler);
      this.pasteHandler = null;
    }
    if (this._contextMenuHandler) {
      this.eventBus.off("open-menu-content", this._contextMenuHandler);
      this._contextMenuHandler = null;
    }
    if (this._blockIconMenuHandler) {
      this.eventBus.off("click-blockicon", this._blockIconMenuHandler);
      this._blockIconMenuHandler = null;
    }
    this._escapeTopBarBtn = null;
  }
  /** 判断事件目标是否在 protyle 编辑器可编辑区域内 */
  _isInProtyle(e) {
    const target = e.target;
    if (!target) return false;
    if (typeof target.closest !== "function") return false;
    if (!target.closest(".protyle-wysiwyg")) return false;
    if (target.closest(".code-block, [data-type='code-block'], code")) return false;
    return true;
  }
  /** 集中移除全局 keydown / beforeinput 拦截监听器 */
  _removeEscapeListener() {
    const h = this._escapeHandler;
    if (h) {
      document.removeEventListener("keydown", h, true);
    }
    if (_getEscSlot() === h) _setEscSlot(null);
    this._escapeHandler = null;
    const b = this._beforeInputHandler;
    if (b) {
      document.removeEventListener("beforeinput", b, true);
    }
    this._beforeInputHandler = null;
  }
  /**
   * 读取某命令在「设置→快捷键」中的 keymap 项，兼容插件名带/不带 siyuan-plugin- 前缀。
   * 返回结构形如 { default, custom, bindings? }，找不到返回 undefined。
   */
  _getKeymapItem(langKey) {
    const pluginKm = window.siyuan?.config?.keymap?.plugin;
    if (!pluginKm || typeof pluginKm !== "object") return void 0;
    const candidates = [
      this.name,
      "siyuan-plugin-" + this.name,
      this.name.replace(/^siyuan-plugin-/, "")
    ];
    for (const key of candidates) {
      const item = pluginKm[key] && pluginKm[key][langKey];
      if (item && typeof item.custom === "string") return item;
    }
    for (const pk of Object.keys(pluginKm)) {
      const item = pluginKm[pk] && pluginKm[pk][langKey];
      if (item && typeof item.custom === "string") return item;
    }
    return void 0;
  }
  /**
   * 返回某命令当前生效的快捷键字符串数组（忠实复刻 keymapBindings.getKeymapBindings）：
   * - item 完全缺失（配置未就绪）→ 回退默认热键
   * - 有 bindings(version===1, keys 数组) → 去重后的 keys
   * - 无 bindings 且 custom 非空 → [custom]
   * - custom 为空串 → []（用户已清空绑定，视为未绑定，兜底不应触发）
   */
  _getEffectiveHotkeys(langKey) {
    const item = this._getKeymapItem(langKey);
    if (!item) return DEFAULT_HOTKEYS[langKey] ? [DEFAULT_HOTKEYS[langKey]] : [];
    if (item.bindings) {
      if (item.bindings.version !== 1 || !Array.isArray(item.bindings.keys)) return [];
      return [...new Set(item.bindings.keys.filter((k) => typeof k === "string" && k.length > 0))];
    }
    return typeof item.custom === "string" && item.custom ? [item.custom] : [];
  }
  /**
   * 注册 addCommand 热键的兜底监听器（解决 v3.8.0+ 部分环境下热键不触发的问题）。
   * 关键修复（集市 issue #1）：兜底不再硬编码 ⇧⌘E/L/V，而是实时读取用户当前生效绑定
   * （_getEffectiveHotkeys，忠实复刻思源 getKeymapBindings / matchHotKey），
   * 仅当用户实际绑定（或配置缺失时回退默认）被按下才触发，
   * 从而尊重用户在「设置→快捷键」的改绑/删除，不再覆盖用户配置。
   */
  _registerFallbackHotkeys() {
    this._unregisterFallbackHotkeys();
    const handler = (e) => {
      if (this._destroyed) return;
      const commands = [
        { langKey: "quickLiteralInput", action: () => this._handleQuickInput() },
        { langKey: "toggleAutoEscape", action: () => this._toggleAutoEscape() },
        { langKey: "richPaste", action: () => this._triggerRichPaste() }
      ];
      let matched = null;
      for (const cmd of commands) {
        const hotkeys = this._getEffectiveHotkeys(cmd.langKey);
        if (hotkeys.some((hk) => _matchHotKey(hk, e))) {
          matched = cmd.action;
          break;
        }
      }
      if (!matched) return;
      const now = Date.now();
      if (now - this._lastHotkeyToggleTime < 150) return;
      this._lastHotkeyToggleTime = now;
      e.preventDefault();
      e.stopPropagation();
      matched();
    };
    this._fallbackKeydownHandler = handler;
    window.addEventListener("keydown", handler, true);
  }
  _unregisterFallbackHotkeys() {
    const h = this._fallbackKeydownHandler;
    if (h) {
      window.removeEventListener("keydown", h, true);
      this._fallbackKeydownHandler = null;
    }
  }
  /* ---------- 右键/块标菜单 ---------- */
  _setupContextMenus() {
    this._contextMenuHandler = (event) => this._onOpenMenuContent(event.detail);
    this._blockIconMenuHandler = (event) => this._onOpenMenuContent(event.detail);
    this.eventBus.on("open-menu-content", this._contextMenuHandler);
    this.eventBus.on("click-blockicon", this._blockIconMenuHandler);
  }
  _onOpenMenuContent(detail) {
    if (!detail?.menu || typeof detail.menu.addItem !== "function") return;
    const sel = window.getSelection();
    const hasSelection = sel ? !sel.isCollapsed : false;
    detail.menu.addItem({
      label: "\u53CD\u5B57\u9762\uFF08\u8FD8\u539F\u4E3A Markdown\uFF09",
      disabled: !hasSelection,
      click: () => {
        if (hasSelection) this._unescapeSelection();
      }
    });
  }
  _openSelectionModeMenu() {
    const menu = new import_siyuan.Menu("literal-selection-mode");
    menu.addItem({
      label: "\u8F6C\u6210\u884C\u5185\u4EE3\u7801",
      click: () => {
        menu.close();
        this._selectionToLiteral("code");
      }
    });
    menu.addItem({
      label: "\u8F6C\u6210\u53CD\u659C\u6760\u8F6C\u4E49",
      click: () => {
        menu.close();
        this._selectionToLiteral("escape");
      }
    });
    const rect = this._getSelectionRect();
    menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
  }
  _openWidthModeMenu() {
    const menu = new import_siyuan.Menu("literal-width-mode");
    menu.addItem({
      label: "\u5168\u89D2\u8F6C\u534A\u89D2",
      click: () => {
        menu.close();
        this._convertWidth("toHalf");
      }
    });
    menu.addItem({
      label: "\u534A\u89D2\u8F6C\u5168\u89D2",
      click: () => {
        menu.close();
        this._convertWidth("toFull");
      }
    });
    const rect = this._getSelectionRect();
    menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
  }
  _getSelectionRect() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return rect;
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      left: cx,
      top: cy,
      bottom: cy,
      right: cx,
      x: cx,
      y: cy,
      width: 0,
      height: 0
    };
  }
  /* ---------- 配置持久化 ---------- */
  async _saveConfig() {
    this.config.autoEscape = this.autoEscapeMode;
    this.config.richPaste = this.richPasteEnabled;
    this.config.escapeChars = this.escapeChars;
    this.config.assetSubdir = this.assetSubdir;
    try {
      await this.saveData(STORAGE_KEY, this.config);
      return true;
    } catch (err) {
      console.error("[\u8F6C\u4E49] \u914D\u7F6E\u4FDD\u5B58\u5931\u8D25:", err);
      (0, import_siyuan.showMessage)("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (err?.message || String(err)), 5e3, "error");
      return false;
    }
  }
  /** 更新顶栏转义按钮状态（同步 tooltip 的 aria-label） */
  _updateEscapeButton() {
    if (!this._escapeTopBarBtn) return;
    try {
      const title = this.autoEscapeMode ? "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5F00\u542F\uFF08\u70B9\u51FB\u6216 Ctrl+Shift+E \u5173\u95ED\uFF09" : "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5173\u95ED\uFF08\u70B9\u51FB\u6216 Ctrl+Shift+E \u5F00\u542F\uFF09";
      this._escapeTopBarBtn.title = title;
      this._escapeTopBarBtn.setAttribute("aria-label", title);
      const menuLabel = this._escapeTopBarBtn.querySelector(".b3-menu__label");
      if (menuLabel) {
        menuLabel.textContent = title;
      }
      const svg = this._escapeTopBarBtn.querySelector("svg");
      const use = this._escapeTopBarBtn.querySelector("use");
      if (use && svg) {
        const newId = this.autoEscapeMode ? ICON_ESCAPE_ON_ID : ICON_ESCAPE_OFF_ID;
        use.setAttribute("href", "#" + newId);
        svg.style.color = this.autoEscapeMode ? "var(--b3-theme-primary)" : "var(--b3-empty-color)";
      }
    } catch (e) {
    }
  }
  _getActiveProtyle() {
    try {
      const p = (0, import_siyuan.getActiveEditor)();
      if (p) return p;
    } catch (e) {
    }
    try {
      const editors = (0, import_siyuan.getAllEditor)();
      if (editors?.length) return editors[0];
    } catch (e) {
    }
    return null;
  }
  // 光标保存与恢复
  _saveCursorPosition(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) return;
    try {
      const range = p.toolbar?.range;
      if (range?.cloneRange) {
        this._savedRange = range.cloneRange();
        this._savedProtyle = p;
        return;
      }
    } catch (e) {
    }
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        this._savedRange = sel.getRangeAt(0).cloneRange();
        this._savedProtyle = p;
        return;
      }
    } catch (e) {
    }
    this._savedBlockId = this._getCurrentBlockId(p);
    this._savedProtyle = p;
  }
  _restoreCursorPosition() {
    const p = this._savedProtyle || this._getActiveProtyle();
    if (!p) return false;
    try {
      const el = p.element?.querySelector(".protyle-wysiwyg") || p.element;
      if (el) el.focus({ preventScroll: true });
      if (this._savedRange) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(this._savedRange);
          return true;
        }
      }
    } catch (e) {
    }
    this._clearSavedPosition();
    return false;
  }
  _clearSavedPosition() {
    this._savedRange = null;
    this._savedBlockId = null;
  }
  // 一、字面文本输入
  _handleQuickInput(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel) {
      this._insertTextAtFocus("`" + sel.replace(/`/g, "\\`") + "`", p);
      (0, import_siyuan.showMessage)("\u5DF2\u5305\u88F9\u4E3A\u884C\u5185\u4EE3\u7801", 2e3, "info");
    } else {
      this._saveCursorPosition(p);
      this._showLiteralDialog("code", p);
    }
  }
  _showLiteralDialog(defaultMode, protyle) {
    const mobile = _isMobile();
    if (!this._savedRange && !this._savedBlockId) this._saveCursorPosition(protyle);
    const dialog = new import_siyuan.Dialog({
      title: "\u5B57\u9762\u6587\u672C\u8F93\u5165",
      width: mobile ? "92%" : "520px",
      content: `
        <div style="padding:20px 24px 8px;">
          <div class="lt-dialog-hint">
            \u8F93\u5165\u7684\u5185\u5BB9\u4E0D\u4F1A\u88AB Markdown \u6E32\u67D3\uFF0C\u4EE5\u539F\u59CB\u683C\u5F0F\u663E\u793A\u3002<br/>
            \u9002\u7528\u4E8E\u6D88\u9632\u8BBE\u5907\u578B\u53F7\u3001\u7535\u7F06\u89C4\u683C\u7B49\u542B\u7279\u6B8A\u7B26\u53F7\u7684\u6587\u672C\u3002
          </div>
          <input id="lt-input" class="b3-text-field lt-dialog-input"
                 style="width:100%;padding:${mobile ? "12px 14px" : "9px 12px"};font-size:${mobile ? "16px" : "14px"};"
                 placeholder="*#JTW-ZD-9911 \u70B9\u578B\u5149\u7535\u611F\u70DF\u63A2\u6D4B\u5668" />
          <div class="lt-mode-row">
            <label class="lt-mode-label">
              <input type="radio" name="lt-mode" value="code" ${defaultMode === "code" ? "checked" : ""}/>
              <span>\u884C\u5185\u4EE3\u7801</span>
              <span class="lt-mode-hint">\uFF08\u7070\u8272\u5E95\u6846\uFF09</span>
            </label>
            <label class="lt-mode-label">
              <input type="radio" name="lt-mode" value="escape" ${defaultMode === "escape" ? "checked" : ""}/>
              <span>\u8F6C\u4E49\u5B57\u7B26</span>
              <span class="lt-mode-hint">\uFF08\u7EAF\u6587\u672C\uFF09</span>
            </label>
          </div>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="lt-cancel" style="margin-right:8px;">\u53D6\u6D88</button>
          <button class="b3-button b3-button--primary" id="lt-ok">\u63D2\u5165</button>
        </div>`
    });
    const $ = (s) => dialog.element.querySelector(s);
    const input = $("#lt-input");
    setTimeout(() => input?.focus(), mobile ? 200 : 80);
    const confirm = () => {
      const text = input.value.trim();
      if (!text) {
        dialog.destroy();
        this._clearSavedPosition();
        return;
      }
      const mode = dialog.element.querySelector('input[name="lt-mode"]:checked')?.value || "code";
      this._restoreAndInsert(text, mode, protyle);
      dialog.destroy();
    };
    $("#lt-ok").addEventListener("click", confirm);
    $("#lt-cancel").addEventListener("click", () => {
      dialog.destroy();
      this._clearSavedPosition();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirm();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dialog.destroy();
        this._clearSavedPosition();
      }
    });
  }
  _restoreAndInsert(text, mode, protyle) {
    const restored = this._restoreCursorPosition();
    this._clearSavedPosition();
    const p = protyle || this._savedProtyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    if (mode === "code") {
      this._insertTextAtFocus("`" + text.replace(/`/g, "\\`") + "`", p, restored);
    } else {
      this._insertTextAtFocus(this._escapeText(text), p, restored);
    }
  }
  /** 转义模式字符安全替换（与字面文本输入共用） */
  _escapeText(text) {
    return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/([{}[\]()+.\-!~|><])/g, "\\$&").replace(/\*/g, SAFE_ASTERISK).replace(/#/g, SAFE_HASH);
  }
  /** 按字符返回其"安全替换"形式：*→\*，#→\#（反斜杠转义），其它→\X 反斜杠前缀 */
  _safeCharFor(ch) {
    if (ch === "*") return SAFE_ASTERISK;
    if (ch === "#") return SAFE_HASH;
    return "\\" + ch;
  }
  // 文本插入
  _insertTextAtFocus(text, protyle, cursorRestored = false) {
    const p = protyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    if (cursorRestored) {
      try {
        if (document.execCommand("insertText", false, text)) return;
      } catch (e) {
      }
    }
    try {
      const wysiwyg = p.element?.querySelector(".protyle-wysiwyg");
      if (wysiwyg) wysiwyg.focus({ preventScroll: true });
      setTimeout(() => {
        if (typeof p.insert === "function") {
          try {
            p.insert(text);
            return;
          } catch (e) {
          }
        }
        this._fallbackInsert(text);
      }, 0);
      return;
    } catch (e) {
    }
    this._fallbackInsert(text);
  }
  /**
   * 转义重插入：优先用 protyle 官方 insert()（走思源输入管线，lite protyle 下最可靠），
   * 仅在拿不到 protyle 实例时回退 document.execCommand("insertText")。
   */
  _insertTextSync(text) {
    const p = this._getActiveProtyle();
    if (p && typeof p.insert === "function") {
      try {
        p.insert(text);
        return true;
      } catch (e) {
        console.warn("[\u8F6C\u4E49] protyle.insert \u5931\u8D25\uFF0C\u56DE\u9000 execCommand:", e.message);
      }
    }
    try {
      if (document.execCommand("insertText", false, text)) return true;
    } catch (e) {
    }
    return false;
  }
  _fallbackInsert(text) {
    const blockId = this._getCurrentBlockId();
    if (blockId) {
      this._insertBlockAfter(blockId, text).catch(() => {
      });
      return;
    }
    (0, import_siyuan.showMessage)("\u63D2\u5165\u5931\u8D25", 3e3, "error");
  }
  // 选区转字面量 / 字符全半角转换（L1 / L2）
  /** 用 text 替换当前选区（execCommand 会替换已选内容）；无选区时退化为焦点插入 */
  _replaceSelection(text) {
    const sel = window.getSelection();
    const p = this._getActiveProtyle();
    try {
      const wysiwyg = p?.element?.querySelector(".protyle-wysiwyg");
      if (wysiwyg) wysiwyg.focus({ preventScroll: true });
    } catch (e) {
    }
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      if (document.execCommand("insertText", false, text)) return true;
    }
    this._insertTextAtFocus(text, p);
    return false;
  }
  /** L1：将当前选区转为字面量（code=行内代码，escape=纯文本转义） */
  _selectionToLiteral(mode) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u9009\u4E2D\u8981\u8F6C\u6362\u7684\u6587\u672C", 2500, "warning");
      return;
    }
    const literal = mode === "code" ? "`" + text.replace(/`/g, "\\`") + "`" : this._escapeText(text);
    this._replaceSelection(literal);
    (0, import_siyuan.showMessage)(mode === "code" ? "\u5DF2\u8F6C\u4E3A\u884C\u5185\u4EE3\u7801 " : "\u5DF2\u8F6C\u4E49\u4E3A\u7EAF\u6587\u672C ", 2e3, "info");
  }
  /** L2：全角 ⇄ 半角 字符转换（target: toHalf / toFull） */
  _convertWidth(target) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u9009\u4E2D\u8981\u8F6C\u6362\u7684\u6587\u672C", 2500, "warning");
      return;
    }
    let out = "";
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (target === "toHalf") {
        if (code === 12288) out += " ";
        else if (code >= 65281 && code <= 65374) out += String.fromCodePoint(code - 65248);
        else out += ch;
      } else {
        if (code === 32) out += "\u3000";
        else if (code >= 33 && code <= 126) out += String.fromCodePoint(code + 65248);
        else out += ch;
      }
    }
    this._replaceSelection(out);
    (0, import_siyuan.showMessage)(target === "toHalf" ? "\u5168\u89D2\u5DF2\u8F6C\u534A\u89D2 " : "\u534A\u89D2\u5DF2\u8F6C\u5168\u89D2 ", 2e3, "info");
  }
  // 二、自动转义
  _toggleAutoEscape() {
    this.autoEscapeMode = !this.autoEscapeMode;
    this._saveConfig();
    this._updateEscapeButton();
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
      (0, import_siyuan.showMessage)("\u81EA\u52A8\u8F6C\u4E49\u5DF2\u5F00\u542F\uFF1A*\u2192*  #\u2192#", 2500, "info");
    } else {
      this._disableAutoEscape();
      (0, import_siyuan.showMessage)("\u81EA\u52A8\u8F6C\u4E49\u5DF2\u5173\u95ED", 2e3, "info");
    }
  }
  _enableAutoEscape() {
    const handler = (e) => {
      if (this._destroyed || _getEscSlot() !== handler) {
        document.removeEventListener("keydown", handler, true);
        if (_getEscSlot() === handler) _setEscSlot(null);
        this._escapeHandler = null;
        return;
      }
      if (e.isComposing || e.key === "Process") return;
      if (!this.autoEscapeMode) return;
      if (!this._isInProtyle(e)) return;
      if (!this.escapeChars.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const safeChar = this._safeCharFor(e.key);
      this._insertTextSync(safeChar);
    };
    const beforeInputHandler = (e) => {
      if (this._destroyed || _getEscSlot() !== handler) {
        document.removeEventListener("beforeinput", beforeInputHandler, true);
        return;
      }
      if (!this.autoEscapeMode) return;
      if (!this._isInProtyle(e)) return;
      if (e.inputType !== "insertText" || !e.data) return;
      const ch = e.data;
      if (ch.length !== 1 || !this.escapeChars.includes(ch)) return;
      e.preventDefault();
      e.stopPropagation();
      const safeChar = this._safeCharFor(ch);
      this._insertTextSync(safeChar);
    };
    const prev = _getEscSlot();
    if (prev) document.removeEventListener("keydown", prev, true);
    this._escapeHandler = handler;
    this._beforeInputHandler = beforeInputHandler;
    document.addEventListener("keydown", handler, true);
    document.addEventListener("beforeinput", beforeInputHandler, true);
    _setEscSlot(handler);
  }
  _disableAutoEscape() {
    this._removeEscapeListener();
  }
  // 三、富文本粘贴
  _initPaste() {
    this.pasteHandler = async (event) => {
      if (!this.richPasteEnabled) return;
      const detail = event.detail;
      if (!detail) return;
      const textHTML = detail.textHTML || "";
      const textPlain = detail.textPlain || "";
      if (!textHTML || textHTML.length < 50) return;
      const hasRich = /<(img|table|h[1-6]|div|span|p|ul|ol)/i.test(textHTML);
      if (!hasRich) return;
      event.preventDefault();
      const toastId = this._showToast("\u5904\u7406\u4E2D...", 0);
      try {
        const md = await this._pasteHtmlToMarkdown(textHTML, detail.protyle);
        this._removeToast(toastId);
        if (md?.trim()) {
          detail.resolve({ textPlain: md });
          (0, import_siyuan.showMessage)("\u7C98\u8D34\u5B8C\u6210 ", 2e3, "info");
        } else {
          detail.resolve({ textPlain });
        }
      } catch (err) {
        this._removeToast(toastId);
        detail.resolve({ textPlain });
      }
    };
    this.eventBus.on("paste", this.pasteHandler);
  }
  async _triggerRichPaste(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    this._saveCursorPosition(p);
    const mobile = _isMobile();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          const tid = this._showToast("\u5904\u7406\u4E2D...", 0);
          try {
            const md = await this._pasteHtmlToMarkdown(html, p);
            this._removeToast(tid);
            if (md?.trim()) {
              this._restoreCursorPosition();
              this._clearSavedPosition();
              this._insertTextAtFocus(md, p, true);
              (0, import_siyuan.showMessage)("\u7C98\u8D34\u5B8C\u6210 ", 2e3, "info");
            } else {
              this._clearSavedPosition();
            }
          } catch (err) {
            this._removeToast(tid);
            this._clearSavedPosition();
            (0, import_siyuan.showMessage)("\u5931\u8D25:" + err.message, 4e3, "error");
          }
          return;
        }
      }
      this._clearSavedPosition();
      (0, import_siyuan.showMessage)("\u526A\u8D34\u677F\u65E0 HTML \u5185\u5BB9", 3e3, "warning");
    } catch (err) {
      this._clearSavedPosition();
      console.warn("[\u8F6C\u4E49] clipboard.read \u5931\u8D25:", err.message);
      (0, import_siyuan.showMessage)(
        mobile ? "\u79FB\u52A8\u7AEF\u4E0D\u652F\u6301\u624B\u52A8\u5BCC\u7C98\u8D34\uFF0C\u8BF7\u76F4\u63A5 Ctrl+V \u7C98\u8D34" : "\u8BF7\u76F4\u63A5 Ctrl+V \u7C98\u8D34\uFF08\u6216\u68C0\u67E5\u6D4F\u89C8\u5668\u6743\u9650\uFF09",
        mobile ? 4e3 : 3e3,
        "info"
      );
    }
  }
  _htmlToMarkdown(html, protyle) {
    const fd = new FormData();
    fd.append("dom", html);
    const nb = this._getNotebookId(protyle);
    if (nb) fd.append("notebook", nb);
    return fetch(API_COPY, { method: "POST", body: fd }).then((r) => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))).then((resp) => resp.code === 0 ? resp.data?.md || "" : Promise.reject(new Error(resp.msg)));
  }
  _getNotebookId(protyle) {
    return protyle?.notebook?.id || protyle?.notebookId || protyle?.block?.rootID || (() => {
      try {
        return new URL(location.href).searchParams.get("id");
      } catch {
        return "";
      }
    })();
  }
  _insertBlockAfter(prevId, md) {
    return fetch(API_INSERT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: md, dataType: "markdown", previousID: prevId })
    }).then((r) => r.json()).then((resp) => resp.code === 0 ? void 0 : Promise.reject(resp.msg));
  }
  // 三·五、富粘贴图片子目录迁移
  /** HTML → Markdown（含图片本地化），并依据设置把图片迁到 assets/<subdir>/ */
  async _pasteHtmlToMarkdown(html, protyle) {
    const md = await this._htmlToMarkdown(html, protyle);
    if (!md || !this.assetSubdir) return md;
    try {
      return await this._relocateAssets(md, this.assetSubdir, protyle);
    } catch (e) {
      console.warn("[\u8F6C\u4E49] \u56FE\u7247\u5B50\u76EE\u5F55\u8FC1\u79FB\u5931\u8D25\uFF0C\u4FDD\u7559\u9ED8\u8BA4 assets:", e.message);
      return md;
    }
  }
  /**
   * 把 Markdown 中 assets/ 下的图片迁到 assets/<subdir>/（思源内核 API）。
   * 任何一步失败都会保留原引用，绝不破坏粘贴结果。
   */
  async _relocateAssets(md, subdir, protyle) {
    const safe = (subdir || "").replace(/[^a-zA-Z0-9_\-]/g, "");
    if (!safe) return md;
    const re = /(!\[[^\]]*\]\(\s*)(\.\/)?assets\/([^)\s]+?)(\s*(?:"[^"]*")?\s*\))/g;
    const matches = [...md.matchAll(re)];
    if (!matches.length) return md;
    let out = md;
    for (const m of matches) {
      const file = m[3];
      const srcUrl = "/assets/" + encodeURI(file);
      try {
        const resp = await fetch(srcUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const destPath = `assets/${safe}/${file}`;
        const fd = new FormData();
        fd.append("path", destPath);
        fd.append("file", blob, file);
        const up = await fetch("/api/file/putFile", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
        if (up && up.code === 0) {
          out = out.split(m[0]).join(m[1] + destPath + m[4]);
          fetch("/api/file/removeFile?path=" + encodeURIComponent("assets/" + file), { method: "POST" }).catch(() => {
          });
        }
      } catch (e) {
        console.warn("[\u8F6C\u4E49] \u5355\u5F20\u56FE\u7247\u8FC1\u79FB\u5931\u8D25\uFF0C\u4FDD\u7559\u539F\u5F15\u7528:", file, e.message);
      }
    }
    return out;
  }
  // 三·六、字面文本块（多行）
  _showLiteralBlockDialog(protyle) {
    const mobile = _isMobile();
    const p = protyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    this._saveCursorPosition(p);
    const dialog = new import_siyuan.Dialog({
      title: "\u5B57\u9762\u6587\u672C\u5757\uFF08\u591A\u884C\uFF09",
      width: mobile ? "92%" : "560px",
      content: `
        <div style="padding:20px 24px 8px;">
          <div class="lt-dialog-hint">
            \u63D2\u5165\u4E00\u4E2A\u591A\u884C\u4EE3\u7801\u5757\uFF0C\u5185\u5BB9\u539F\u6837\u663E\u793A\u3001\u4E0D\u88AB Markdown \u6E32\u67D3\u3002<br/>
            \u9002\u5408\u6D88\u9632\u8BBE\u5907\u578B\u53F7\u8868\u3001\u591A\u884C\u89C4\u683C\u3001\u957F\u4EE3\u7801\u7247\u6BB5\u7B49\u3002
          </div>
          <textarea id="lt-block-input" class="b3-text-field"
                    style="width:100%;min-height:${mobile ? "160px" : "140px"};padding:${mobile ? "12px 14px" : "9px 12px"};font-size:${mobile ? "16px" : "14px"};resize:vertical;"
                    placeholder="JTW-ZD-9911*2&#10;JTW-ZD-9912*4&#10;... (\u6BCF\u884C\u4E00\u6761\uFF0C\u539F\u6837\u4FDD\u7559 * # \u7B49\u7B26\u53F7)"></textarea>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="ltb-cancel" style="margin-right:8px;">\u53D6\u6D88</button>
          <button class="b3-button b3-button--primary" id="ltb-ok">\u63D2\u5165\u4EE3\u7801\u5757</button>
        </div>`
    });
    const $ = (s) => dialog.element.querySelector(s);
    const input = $("#lt-block-input");
    setTimeout(() => input?.focus(), mobile ? 200 : 80);
    const confirm = () => {
      const text = input.value;
      dialog.destroy();
      this._clearSavedPosition();
      if (!text.trim()) return;
      this._insertCodeBlock(text, p);
    };
    $("#ltb-ok").addEventListener("click", confirm);
    $("#ltb-cancel").addEventListener("click", () => {
      dialog.destroy();
      this._clearSavedPosition();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirm();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dialog.destroy();
        this._clearSavedPosition();
      }
    });
  }
  /** 在当前块后插入一个代码块（多行字面文本） */
  async _insertCodeBlock(text, protyle) {
    const p = protyle || this._getActiveProtyle() || this._savedProtyle;
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    const md = "```\n" + text.replace(/\n+$/, "") + "\n```\n";
    const blockId = this._savedBlockId || this._getCurrentBlockId(p);
    try {
      if (blockId) {
        await this._insertBlockAfter(blockId, md);
      } else if (typeof p.insert === "function") {
        p.insert(md);
      } else {
        throw new Error("no insert target");
      }
      (0, import_siyuan.showMessage)("\u5DF2\u63D2\u5165\u5B57\u9762\u6587\u672C\u5757 ", 2e3, "info");
    } catch (err) {
      console.error("[\u8F6C\u4E49] \u63D2\u5165\u4EE3\u7801\u5757\u5931\u8D25:", err);
      (0, import_siyuan.showMessage)("\u63D2\u5165\u5931\u8D25\uFF0C\u5DF2\u9000\u56DE\u7126\u70B9\u63D2\u5165", 3e3, "error");
      this._insertTextAtFocus(md, p);
    }
  }
  // 三·七、反字面（还原为普通文本）
  _unescapeSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u9009\u4E2D\u8981\u8FD8\u539F\u7684\u6587\u672C", 2500, "warning");
      return;
    }
    const unescaped = text.replace(/\\([*#_~`+\-!|><[\](){}])/g, "$1");
    this._replaceSelection(unescaped);
    (0, import_siyuan.showMessage)("\u5DF2\u8FD8\u539F\u4E3A\u666E\u901A\u6587\u672C ", 2e3, "info");
  }
  // 四、设置面板（标准位置：设置 -> 集市 -> 已下载 -> 插件齿轮）
  _buildSettingPanel() {
    const mobile = _isMobile();
    this.setting = new import_siyuan.Setting({
      width: mobile ? "92%" : "560px",
      height: mobile ? "auto" : "auto",
      confirmCallback: async () => {
        const ok = await this._saveConfig();
        if (ok) (0, import_siyuan.showMessage)("\u5DF2\u4FDD\u5B58", 2e3, "info");
      }
    });
    this.setting.addItem({
      title: "\u81EA\u52A8\u8F6C\u4E49",
      description: "\u5F00\u542F\u540E\u8F93\u5165 * # _ \u7B49\u4F1A\u88AB\u81EA\u52A8\u4FDD\u62A4\uFF08* -> *\uFF0C# -> #\uFF09\u3002\u4EE3\u7801\u5757\u5185\u4E0D\u53D7\u5F71\u54CD\u3002",
      createActionElement: () => {
        const el = document.createElement("input");
        el.type = "checkbox";
        el.id = "cfg-auto-escape";
        el.checked = this.autoEscapeMode;
        el.addEventListener("change", () => {
          const v = el.checked;
          if (v !== this.autoEscapeMode) {
            this.autoEscapeMode = v;
            v ? this._enableAutoEscape() : this._disableAutoEscape();
            this._updateEscapeButton();
          }
        });
        return el;
      }
    });
    this.setting.addItem({
      title: "\u81EA\u52A8\u8F6C\u4E49\u7684\u5B57\u7B26",
      description: "\u9ED8\u8BA4 * \u548C #\u3002# \u7528\u53CD\u659C\u6760\u8F6C\u4E49\uFF08\\#\uFF09\uFF0C\u4E0E * \u884C\u4E3A\u4E00\u81F4\uFF1B\u5176\u5B83\u7528\u53CD\u659C\u6760\u524D\u7F00\u3002",
      createActionElement: () => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 12px;";
        const candidates = ["*", "#", "_", "~", ">", "[", "]", "|", "+", "!"];
        candidates.forEach((c) => {
          const label = document.createElement("label");
          label.style.cssText = "display:inline-flex;align-items:center;gap:4px;cursor:pointer;";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = c;
          cb.className = "cfg-escape-char";
          cb.checked = this.escapeChars.includes(c);
          const span = document.createElement("span");
          span.innerHTML = "<code>" + c + "</code>";
          label.appendChild(cb);
          label.appendChild(span);
          wrap.appendChild(label);
        });
        wrap.addEventListener("change", () => {
          const chars = Array.from(wrap.querySelectorAll("input.cfg-escape-char:checked")).map((cb) => cb.value);
          this.escapeChars = chars.length ? chars : ["*", "#"];
        });
        return wrap;
      }
    });
    this.setting.addItem({
      title: "\u5BCC\u6587\u672C\u7C98\u8D34",
      description: "\u81EA\u52A8\u62E6\u622A\u7C98\u8D34\uFF0C\u8C03\u7528\u5185\u6838 API \u672C\u5730\u5316\u56FE\u7247\uFF08/api/extension/copy\uFF09\u3002",
      createActionElement: () => {
        const el = document.createElement("input");
        el.type = "checkbox";
        el.id = "cfg-rich-paste";
        el.checked = this.richPasteEnabled;
        el.addEventListener("change", () => {
          this.richPasteEnabled = el.checked;
        });
        return el;
      }
    });
    this.setting.addItem({
      title: "\u56FE\u7247\u4FDD\u5B58\u5B50\u76EE\u5F55",
      description: "\u5982\u586B wechat\uFF0C\u56FE\u7247\u5B58\u5230 assets/wechat/\uFF08\u4EC5\u5B57\u6BCD\u6570\u5B57\u4E0B\u5212\u7EBF\u8FDE\u5B57\u7B26\uFF09\u3002\u7559\u7A7A=\u9ED8\u8BA4 assets/\u3002",
      createActionElement: () => {
        const el = document.createElement("input");
        el.type = "text";
        el.id = "cfg-asset-subdir";
        el.className = "b3-text-field fn__size200";
        el.value = this.assetSubdir;
        el.placeholder = "\u7559\u7A7A=\u9ED8\u8BA4 assets/";
        el.addEventListener("input", () => {
          this.assetSubdir = el.value.trim();
        });
        return el;
      }
    });
  }
  // 工具方法
  _getCurrentBlockId(protyle) {
    try {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return null;
      const node = sel.getRangeAt(0).startContainer.parentElement;
      return node?.closest?.("[data-node-id]")?.getAttribute("data-node-id") || null;
    } catch (e) {
      return null;
    }
  }
  _showToast(msg, dur) {
    const id = "lt-t-" + Date.now();
    const el = document.createElement("div");
    el.id = id;
    el.className = "lt-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    if (dur > 0) setTimeout(() => el.remove(), dur);
    return id;
  }
  _removeToast(id) {
    document.getElementById(id)?.remove();
  }
};
module.exports = module.exports.default || module.exports;
