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

// src/index.js
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
var SAFE_HASH = "`#`";
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
var _isMobile = () => {
  const f = (0, import_siyuan.getFrontend)();
  return f === "mobile" || f === "browser-mobile";
};
var LiteralTextPlugin = class extends import_siyuan.Plugin {
  /* ---------- 生命周期 ---------- */
  async onload() {
    console.log("[\u8F6C\u4E49] v2.7.0 \u5F00\u59CB\u52A0\u8F7D...");
    this.config = await this.loadData(STORAGE_KEY).catch((err) => {
      console.warn("[\u8F6C\u4E49] \u914D\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", err);
      return {};
    }) || {};
    console.log("[\u8F6C\u4E49] \u5DF2\u52A0\u8F7D\u914D\u7F6E:", JSON.stringify(this.config));
    this.autoEscapeMode = this.config.autoEscape ?? true;
    this.richPasteEnabled = this.config.richPaste ?? true;
    console.log("[\u8F6C\u4E49] autoEscape=" + this.autoEscapeMode + " richPaste=" + this.richPasteEnabled);
    this.pasteHandler = null;
    this._escapeHandler = null;
    this._escapeTopBarBtn = null;
    this._savedRange = null;
    this._savedBlockId = null;
    this._savedProtyle = null;
    this.addIcons(ICON_SYMBOLS);
    this.addCommand({
      langKey: "quickLiteralInput",
      langText: "\u5B57\u9762\u6587\u672C\u5FEB\u901F\u8F93\u5165",
      hotkey: "\u21E7\u2318L",
      callback: () => this._handleQuickInput()
    });
    this.addCommand({
      langKey: "toggleAutoEscape",
      langText: "\u5207\u6362\u81EA\u52A8\u8F6C\u4E49",
      hotkey: "\u21E7\u2318E",
      callback: () => this._toggleAutoEscape()
    });
    this.addCommand({
      langKey: "richPaste",
      langText: "\u5BCC\u6587\u672C\u7C98\u8D34",
      hotkey: "\u21E7\u2318V",
      callback: () => this._triggerRichPaste()
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
      langKey: "convertToHalf",
      langText: "\u5168\u89D2\u8F6C\u534A\u89D2",
      callback: () => this._convertWidth("toHalf")
    });
    this.addCommand({
      langKey: "convertToFull",
      langText: "\u534A\u89D2\u8F6C\u5168\u89D2",
      callback: () => this._convertWidth("toFull")
    });
    this.protyleSlash = [
      {
        filter: ["\u5B57\u9762\u6587\u672C", "literal", "zmbw"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5B57\u9762\u6587\u672C\u8F93\u5165</span><span class="b3-list-item__meta">*# \u4E0D\u88AB\u6E32\u67D3</span></div>',
        id: "literal-input",
        callback: (protyle) => this._showLiteralDialog("code", protyle)
      },
      {
        filter: ["\u8F6C\u4E49\u6587\u672C", "escape", "zywb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u8F6C\u4E49\u6587\u672C\u8F93\u5165</span><span class="b3-list-item__meta">\\*\\# \u7EAF\u6587\u672C</span></div>',
        id: "escape-input",
        callback: (protyle) => this._showLiteralDialog("escape", protyle)
      },
      {
        filter: ["\u5BCC\u6587\u672C\u7C98\u8D34", "rich paste", "fwbzt"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5BCC\u6587\u672C\u7C98\u8D34</span><span class="b3-list-item__meta">\u81EA\u52A8\u4E0B\u8F7D\u56FE\u7247</span></div>',
        id: "rich-paste",
        callback: (protyle) => this._triggerRichPaste(protyle)
      },
      {
        filter: ["\u8BBE\u7F6E", "setting"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u63D2\u4EF6\u8BBE\u7F6E</span></div>',
        id: "settings",
        callback: () => this._showSettingsDialog()
      },
      {
        filter: ["\u9009\u533A\u8F6C\u5B57\u9762", "selection literal", "xqzmb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u9009\u533A\u8F6C\u5B57\u9762\u91CF</span><span class="b3-list-item__meta">\u9009\u4E2D\u6587\u672C\u2192\u884C\u5185\u4EE3\u7801</span></div>',
        id: "selection-literal",
        callback: () => this._selectionToLiteral("code")
      },
      {
        filter: ["\u9009\u533A\u8F6C\u8F6C\u4E49", "selection escape", "xqzzy"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u9009\u533A\u8F6C\u8F6C\u4E49</span><span class="b3-list-item__meta">\u9009\u4E2D\u6587\u672C\u2192\u7EAF\u6587\u672C</span></div>',
        id: "selection-escape",
        callback: () => this._selectionToLiteral("escape")
      },
      {
        filter: ["\u5168\u89D2\u8F6C\u534A\u89D2", "tohalf", "qjzhb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u5168\u89D2\u8F6C\u534A\u89D2</span><span class="b3-list-item__meta">\uFF11\uFF0E\uFF15\u21921.5</span></div>',
        id: "to-half",
        callback: () => this._convertWidth("toHalf")
      },
      {
        filter: ["\u534A\u89D2\u8F6C\u5168\u89D2", "tofull", "bjzqj"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">\u534A\u89D2\u8F6C\u5168\u89D2</span><span class="b3-list-item__meta">1.5\u2192\uFF11\uFF0E\uFF15</span></div>',
        id: "to-full",
        callback: () => this._convertWidth("toFull")
      }
    ];
    this._initPaste();
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
    }
    (0, import_siyuan.showMessage)("\u8F6C\u4E49 v2.7.0 \u5DF2\u52A0\u8F7D \u2705", 2500, "info");
    console.log("[\u8F6C\u4E49] \u52A0\u8F7D\u5B8C\u6210\uFF0C\u524D\u7AEF\uFF1A" + (0, import_siyuan.getFrontend)() + "\uFF0C\u81EA\u52A8\u8F6C\u4E49\uFF1A" + (this.autoEscapeMode ? "\u5F00\u542F" : "\u5173\u95ED"));
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
      this.addTopBar({
        icon: ICON_CODE_ID,
        title: "\u9009\u533A\u8F6C\u8F6C\u4E49\uFF08\u9009\u4E2D\u6587\u672C\u2192\u7EAF\u6587\u672C\u5B57\u9762\u91CF\uFF09",
        position: "right",
        callback: () => this._selectionToLiteral("escape")
      });
    } catch (e) {
      console.warn("[\u8F6C\u4E49] \u9876\u680F\u6309\u94AE\u6CE8\u518C\u5931\u8D25\uFF08\u79FB\u52A8\u7AEF\u53EF\u80FD\u4E0D\u652F\u6301\uFF09:", e.message);
    }
  }
  onunload() {
    if (this._escapeHandler) {
      document.removeEventListener("keydown", this._escapeHandler, true);
      this._escapeHandler = null;
    }
    if (this.pasteHandler) {
      this.eventBus.off("paste", this.pasteHandler);
      this.pasteHandler = null;
    }
    this._escapeTopBarBtn = null;
    console.log("[\u8F6C\u4E49] \u5DF2\u5378\u8F7D");
  }
  /* ---------- 配置持久化 ---------- */
  async _saveConfig() {
    this.config.autoEscape = this.autoEscapeMode;
    this.config.richPaste = this.richPasteEnabled;
    console.log("[\u8F6C\u4E49] \u4FDD\u5B58\u914D\u7F6E:", JSON.stringify(this.config));
    try {
      await this.saveData(STORAGE_KEY, this.config);
    } catch (err) {
      console.error("[\u8F6C\u4E49] \u914D\u7F6E\u4FDD\u5B58\u5931\u8D25:", err);
    }
  }
  /** 更新顶栏转义按钮状态（切换 Symbol 引用） */
  _updateEscapeButton() {
    if (!this._escapeTopBarBtn) return;
    try {
      const svg = this._escapeTopBarBtn.querySelector("svg");
      const use = this._escapeTopBarBtn.querySelector("use");
      if (use && svg) {
        const newId = this.autoEscapeMode ? ICON_ESCAPE_ON_ID : ICON_ESCAPE_OFF_ID;
        use.setAttribute("href", "#" + newId);
        svg.style.color = this.autoEscapeMode ? "var(--b3-theme-primary)" : "var(--b3-empty-color)";
        this._escapeTopBarBtn.title = this.autoEscapeMode ? "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5F00\u542F\uFF08\u70B9\u51FB\u5173\u95ED\uFF09" : "\u81EA\u52A8\u8F6C\u4E49\uFF1A\u5DF2\u5173\u95ED\uFF08\u70B9\u51FB\u5F00\u542F\uFF09";
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
  /* ==========================================================
     光标保存与恢复
     ========================================================== */
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
      if (sel?.rangeCount > 0) {
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
  /* ==========================================================
     一、字面文本输入
     ========================================================== */
  _handleQuickInput(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) {
      (0, import_siyuan.showMessage)("\u8BF7\u5148\u6253\u5F00\u6587\u6863", 3e3, "warning");
      return;
    }
    const sel = window.getSelection().toString().trim();
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
  /* ==========================================================
     文本插入
     ========================================================== */
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
  _insertTextSync(text) {
    try {
      if (document.execCommand("insertText", false, text)) return true;
    } catch (e) {
    }
    const p = this._getActiveProtyle();
    if (p?.insert) {
      try {
        p.insert(text);
        return true;
      } catch (e) {
      }
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
  /* ==========================================================
     选区转字面量 / 字符全半角转换（L1 / L2）
     ========================================================== */
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
    (0, import_siyuan.showMessage)(mode === "code" ? "\u5DF2\u8F6C\u4E3A\u884C\u5185\u4EE3\u7801 \u2705" : "\u5DF2\u8F6C\u4E49\u4E3A\u7EAF\u6587\u672C \u2705", 2e3, "info");
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
      const code = ch.codePointAt(0);
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
    (0, import_siyuan.showMessage)(target === "toHalf" ? "\u5168\u89D2\u5DF2\u8F6C\u534A\u89D2 \u2705" : "\u534A\u89D2\u5DF2\u8F6C\u5168\u89D2 \u2705", 2e3, "info");
  }
  /* ==========================================================
     二、自动转义
     ========================================================== */
  _toggleAutoEscape() {
    this.autoEscapeMode = !this.autoEscapeMode;
    this._saveConfig();
    this._updateEscapeButton();
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
      (0, import_siyuan.showMessage)("\u2705 \u81EA\u52A8\u8F6C\u4E49\u5DF2\u5F00\u542F\uFF1A*\u2192\\*  #\u2192`#`", 2500, "info");
    } else {
      this._disableAutoEscape();
      (0, import_siyuan.showMessage)("\u81EA\u52A8\u8F6C\u4E49\u5DF2\u5173\u95ED", 2e3, "info");
    }
  }
  _enableAutoEscape() {
    if (this._escapeHandler) return;
    this._escapeHandler = (e) => {
      if (e.isComposing || e.key === "Process") return;
      if (!this.autoEscapeMode) return;
      if (!e.target.closest?.(".protyle-wysiwyg")) return;
      if (!["*", "#"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const safeChar = e.key === "#" ? SAFE_HASH : SAFE_ASTERISK;
      if (!document.execCommand("insertText", false, safeChar)) {
        const p = this._getActiveProtyle();
        if (p?.insert) p.insert(safeChar);
      }
    };
    document.addEventListener("keydown", this._escapeHandler, true);
  }
  _disableAutoEscape() {
    if (this._escapeHandler) {
      document.removeEventListener("keydown", this._escapeHandler, true);
      this._escapeHandler = null;
    }
  }
  /* ==========================================================
     三、富文本粘贴
     ========================================================== */
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
        const md = await this._htmlToMarkdown(textHTML, detail.protyle);
        this._removeToast(toastId);
        if (md?.trim()) {
          detail.resolve({ textPlain: md });
          (0, import_siyuan.showMessage)("\u7C98\u8D34\u5B8C\u6210 \u2705", 2e3, "info");
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
            const md = await this._htmlToMarkdown(html, p);
            this._removeToast(tid);
            if (md?.trim()) {
              this._restoreCursorPosition();
              this._clearSavedPosition();
              this._insertTextAtFocus(md, p, true);
              (0, import_siyuan.showMessage)("\u7C98\u8D34\u5B8C\u6210 \u2705", 2e3, "info");
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
  /* ==========================================================
     四、设置面板
     ========================================================== */
  _showSettingsDialog() {
    const mobile = _isMobile();
    const dialog = new import_siyuan.Dialog({
      title: "\u8F6C\u4E49 \xB7 \u8BBE\u7F6E",
      width: mobile ? "92%" : "480px",
      content: `
        <div style="padding:20px 24px 0;font-size:13px;line-height:2;">
          <div class="lt-settings-section">\u81EA\u52A8\u8F6C\u4E49</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;">
            <input type="checkbox" id="cfg-auto-escape" ${this.autoEscapeMode ? "checked" : ""}/>
            <span>\u5F00\u542F\u81EA\u52A8\u8F6C\u4E49\uFF08* \u2192 \\* \uFF0C# \u2192 \u884C\u5185\u4EE3\u7801\uFF09</span>
          </label>

          <div class="lt-settings-divider"></div>

          <div class="lt-settings-section">\u5BCC\u6587\u672C\u7C98\u8D34</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
            <input type="checkbox" id="cfg-rich-paste" ${this.richPasteEnabled ? "checked" : ""}/>
            <span>\u81EA\u52A8\u62E6\u622A\u7C98\u8D34\uFF0C\u8C03\u7528\u5185\u6838 API \u672C\u5730\u5316\u56FE\u7247</span>
          </label>

          <div class="lt-settings-warn">
            <b>\u8BF4\u660E</b><br/>
            \u2022 <b>*</b> \u7528\u53CD\u659C\u6760 <code>\\*</code> \u4FDD\u62A4<br/>
            \u2022 <b>#</b> \u7528\u884C\u5185\u4EE3\u7801 <code>\`#\`</code> \u4FDD\u62A4\uFF08<code>\\#</code> \u548C\u96F6\u5BBD\u7A7A\u683C\u5747\u88AB\u601D\u6E90\u5F15\u64CE\u5FFD\u7565\uFF09<br/>
            \u2022 \u9876\u90E8\u680F\u7B2C\u4E09\u4E2A\u6309\u94AE\u53EF\u4E00\u952E\u5207\u6362\u81EA\u52A8\u8F6C\u4E49<br/>
            \u2022 \u5BCC\u7C98\u8D34\u4F7F\u7528\u5185\u6838 <code>/api/extension/copy</code>
          </div>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="cfg-cancel" style="margin-right:8px;">\u53D6\u6D88</button>
          <button class="b3-button b3-button--primary" id="cfg-ok">\u4FDD\u5B58</button>
        </div>`
    });
    const $ = (s) => dialog.element.querySelector(s);
    $("#cfg-ok").addEventListener("click", async () => {
      const newAE = $("#cfg-auto-escape").checked;
      const newRP = $("#cfg-rich-paste").checked;
      if (newAE !== this.autoEscapeMode) {
        this.autoEscapeMode = newAE;
        newAE ? this._enableAutoEscape() : this._disableAutoEscape();
        this._updateEscapeButton();
      }
      this.richPasteEnabled = newRP;
      await this._saveConfig();
      dialog.destroy();
      (0, import_siyuan.showMessage)("\u5DF2\u4FDD\u5B58", 2e3, "info");
    });
    $("#cfg-cancel").addEventListener("click", () => dialog.destroy());
  }
  /* ==========================================================
     工具方法
     ========================================================== */
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
