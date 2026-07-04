// src/index.js
import { Plugin, showMessage, Dialog, isMobile, fetchPost } from "siyuan";
var STORAGE_KEY = "literal-text-config";
var API_COPY = "/api/extension/copy";
var API_INSERT = "/api/block/insertBlock";
var LiteralTextPlugin = class extends Plugin {
  /* ---------- 生命周期 ---------- */
  async onload() {
    console.log("[\u5B57\u9762+\u5BCC\u7C98\u8D34] \u5F00\u59CB\u52A0\u8F7D...");
    this.config = await this.loadData(STORAGE_KEY).catch(() => ({})) || {};
    this.autoEscapeMode = this.config.autoEscape ?? false;
    this.richPasteEnabled = this.config.richPaste ?? true;
    this.pasteMode = this.config.pasteMode ?? "markdown";
    this.escapeIndicator = null;
    this.pasteHandler = null;
    this.activeProtyle = null;
    this._initLiteralText();
    this._initRichPaste();
    this._initSettings();
    showMessage("\u5B57\u9762\u6587\u672C+\u5BCC\u7C98\u8D34 \u63D2\u4EF6\u5DF2\u52A0\u8F7D v1.1.0", 3e3, "info");
    console.log("[\u5B57\u9762+\u5BCC\u7C98\u8D34] \u52A0\u8F7D\u5B8C\u6210");
  }
  onunload() {
    if (this._escapeHandler) {
      document.removeEventListener("keydown", this._escapeHandler, true);
    }
    this._disablePasteInterception();
    this._hideEscapeIndicator();
    console.log("[\u5B57\u9762+\u5BCC\u7C98\u8D34] \u5DF2\u5378\u8F7D");
  }
  /* ---------- 配置持久化 ---------- */
  async _saveConfig() {
    this.config.autoEscape = this.autoEscapeMode;
    this.config.richPaste = this.richPasteEnabled;
    this.config.pasteMode = this.pasteMode;
    await this.saveData(STORAGE_KEY, this.config);
  }
  /* ==========================================================
     一、字面文本输入功能
     ========================================================== */
  _initLiteralText() {
    this.addCommand({
      langKey: "quickLiteralInput",
      hotkey: "\u2325\u21E7L",
      callback: () => this._handleQuickInput()
    });
    this.addCommand({
      langKey: "toggleAutoEscape",
      hotkey: "\u2325\u21E7E",
      callback: () => this._toggleAutoEscape()
    });
    this.protyleSlash = [
      {
        filter: ["\u5B57\u9762\u6587\u672C", "literal", "zmbw"],
        html: `<div class="b3-list-item__first">
                 <span class="b3-list-item__text">\u5B57\u9762\u6587\u672C\u8F93\u5165</span>
                 <span class="b3-list-item__meta">*# \u4E0D\u88AB\u6E32\u67D3</span>
               </div>`,
        id: "literal-input",
        callback: (protyle) => {
          this.activeProtyle = protyle;
          this._showLiteralDialog("code");
        }
      },
      {
        filter: ["\u8F6C\u4E49\u6587\u672C", "escape", "zywb"],
        html: `<div class="b3-list-item__first">
                 <span class="b3-list-item__text">\u8F6C\u4E49\u6587\u672C\u8F93\u5165</span>
                 <span class="b3-list-item__meta">\\*\\# \u7EAF\u6587\u672C</span>
               </div>`,
        id: "escape-input",
        callback: (protyle) => {
          this.activeProtyle = protyle;
          this._showLiteralDialog("escape");
        }
      }
    ];
    this.addTopBar({
      icon: "iconCode",
      title: "\u5B57\u9762\u6587\u672C\u8F93\u5165\uFF08Ctrl+Shift+L\uFF09",
      position: "right",
      callback: () => {
        this.activeProtyle = this._getActiveProtyle();
        this._showLiteralDialog("code");
      }
    });
    this._escapeHandler = (e) => {
      if (!this.autoEscapeMode) return;
      if (!this._isEditorFocused()) return;
      if (["*", "#"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        this._insertText("\\" + e.key);
      }
    };
    document.addEventListener("keydown", this._escapeHandler, true);
    if (this.autoEscapeMode) this._showEscapeIndicator();
  }
  /* ---------- 快速输入入口 ---------- */
  _handleQuickInput() {
    this.activeProtyle = this._getActiveProtyle();
    const sel = window.getSelection().toString().trim();
    if (sel) {
      this._insertText("`" + sel.replace(/`/g, "\\`") + "`");
      showMessage("\u5DF2\u5305\u88F9\u4E3A\u884C\u5185\u4EE3\u7801", 2e3, "info");
    } else {
      this._showLiteralDialog("code");
    }
  }
  /* ---------- 字面文本弹窗 ---------- */
  _showLiteralDialog(defaultMode) {
    const dialog = new Dialog({
      title: "\u5B57\u9762\u6587\u672C\u8F93\u5165",
      width: isMobile() ? "92%" : "540px",
      content: `
        <div style="padding:20px 24px 8px;">
          <div style="font-size:12px;color:var(--b3-empty-color);margin-bottom:16px;line-height:1.7;">
            \u8F93\u5165\u7684\u5185\u5BB9\u4E0D\u4F1A\u88AB Markdown \u6E32\u67D3\uFF0C\u4EE5\u539F\u59CB\u683C\u5F0F\u663E\u793A\u3002<br/>
            \u9002\u7528\u4E8E\u6D88\u9632\u8BBE\u5907\u578B\u53F7\u3001\u7535\u7F06\u89C4\u683C\u7B49\u542B\u7279\u6B8A\u7B26\u53F7\u7684\u6587\u672C\u3002
          </div>
          <input id="lt-input" class="b3-text-field" style="width:100%;padding:9px 12px;font-size:14px;"
                 placeholder="*#JTW-ZD-9911 \u70B9\u578B\u5149\u7535\u611F\u70DF\u63A2\u6D4B\u5668" />
          <div style="display:flex;gap:24px;margin-top:14px;font-size:13px;color:var(--b3-list-line-height);">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="lt-mode" value="code" ${defaultMode === "code" ? "checked" : ""}/>
              <span>\u884C\u5185\u4EE3\u7801</span>
              <span style="color:var(--b3-empty-color);font-size:11px;">\uFF08\u7070\u8272\u5E95\u6846\uFF09</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="lt-mode" value="escape" ${defaultMode === "escape" ? "checked" : ""}/>
              <span>\u8F6C\u4E49\u5B57\u7B26</span>
              <span style="color:var(--b3-empty-color);font-size:11px;">\uFF08\u7EAF\u6587\u672C\uFF09</span>
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
    const okBtn = $("#lt-ok");
    const cancelBtn = $("#lt-cancel");
    setTimeout(() => input?.focus(), 80);
    const confirm2 = () => {
      const text = input.value.trim();
      if (!text) {
        dialog.destroy();
        return;
      }
      const mode = dialog.element.querySelector('input[name="lt-mode"]:checked')?.value || "code";
      this._insertLiteralText(text, mode);
      dialog.destroy();
    };
    okBtn.addEventListener("click", confirm2);
    cancelBtn.addEventListener("click", () => dialog.destroy());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirm2();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dialog.destroy();
      }
    });
  }
  /* ---------- 插入字面文本 ---------- */
  _insertLiteralText(text, mode) {
    if (mode === "code") {
      const safe = text.replace(/`/g, "\\`");
      this._insertText("`" + safe + "`");
    } else {
      const escaped = text.replace(/([\\`*_{}\[\]()#+\-.!~|><])/g, "\\$1");
      this._insertText(escaped);
    }
  }
  /* ---------- 自动转义切换 ---------- */
  _toggleAutoEscape() {
    this.autoEscapeMode = !this.autoEscapeMode;
    this._saveConfig();
    if (this.autoEscapeMode) {
      this._showEscapeIndicator();
      showMessage("\u81EA\u52A8\u8F6C\u4E49\u5DF2\u5F00\u542F\uFF1A\u8F93\u5165 * # \u5C06\u81EA\u52A8\u52A0 \\", 2500, "info");
    } else {
      this._hideEscapeIndicator();
      showMessage("\u81EA\u52A8\u8F6C\u4E49\u5DF2\u5173\u95ED", 2e3, "info");
    }
  }
  _showEscapeIndicator() {
    if (this.escapeIndicator) return;
    this.escapeIndicator = document.createElement("div");
    Object.assign(this.escapeIndicator.style, {
      position: "fixed",
      bottom: "14px",
      right: "14px",
      background: "var(--b3-theme-primary)",
      color: "#fff",
      padding: "5px 14px",
      borderRadius: "14px",
      fontSize: "12px",
      zIndex: "999998",
      boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      cursor: "pointer",
      userSelect: "none",
      fontFamily: "system-ui,sans-serif"
    });
    this.escapeIndicator.textContent = "\u81EA\u52A8\u8F6C\u4E49 ON";
    this.escapeIndicator.title = "\u70B9\u51FB\u5173\u95ED";
    this.escapeIndicator.addEventListener("click", () => this._toggleAutoEscape());
    document.body.appendChild(this.escapeIndicator);
  }
  _hideEscapeIndicator() {
    if (this.escapeIndicator) {
      this.escapeIndicator.remove();
      this.escapeIndicator = null;
    }
  }
  /* ==========================================================
     二、富文本粘贴功能
     ========================================================== */
  _initRichPaste() {
    this.addCommand({
      langKey: "richPaste",
      hotkey: "\u2325\u21E7V",
      callback: () => this._triggerRichPaste()
    });
    this.protyleSlash.push({
      filter: ["\u5BCC\u6587\u672C\u7C98\u8D34", "rich paste", "fwbzt"],
      html: `<div class="b3-list-item__first">
               <span class="b3-list-item__text">\u5BCC\u6587\u672C\u7C98\u8D34</span>
               <span class="b3-list-item__meta">\u81EA\u52A8\u4E0B\u8F7D\u56FE\u7247</span>
             </div>`,
      id: "rich-paste",
      callback: (protyle) => {
        this.activeProtyle = protyle;
        this._triggerRichPaste();
      }
    });
    this.addTopBar({
      icon: "iconImage",
      title: "\u5BCC\u6587\u672C\u7C98\u8D34\uFF08Ctrl+Shift+V\uFF09",
      position: "right",
      callback: () => {
        this.activeProtyle = this._getActiveProtyle();
        this._triggerRichPaste();
      }
    });
    if (this.richPasteEnabled) {
      this._enablePasteInterception();
    }
  }
  /* ---------- 粘贴拦截 ---------- */
  _enablePasteInterception() {
    if (this.pasteHandler) return;
    this.pasteHandler = async (e) => {
      const protyleEl = e.target.closest?.(".protyle");
      if (!protyleEl) return;
      const html = e.clipboardData?.getData("text/html");
      if (!html || html.length < 50) return;
      const hasRich = /<(img|table|h[1-6]|div|span|p|ul|ol)/i.test(html);
      if (!hasRich) return;
      e.preventDefault();
      e.stopPropagation();
      this.activeProtyle = protyleEl.protyle || this._getActiveProtyle();
      await this._processRichPaste(html);
    };
    document.addEventListener("paste", this.pasteHandler, true);
    console.log("[\u5BCC\u7C98\u8D34] \u7C98\u8D34\u62E6\u622A\u5DF2\u542F\u7528");
  }
  _disablePasteInterception() {
    if (this.pasteHandler) {
      document.removeEventListener("paste", this.pasteHandler, true);
      this.pasteHandler = null;
      console.log("[\u5BCC\u7C98\u8D34] \u7C98\u8D34\u62E6\u622A\u5DF2\u5173\u95ED");
    }
  }
  /* ---------- 手动触发 ---------- */
  async _triggerRichPaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const html = await blob.text();
          await this._processRichPaste(html);
          return;
        }
      }
      showMessage("\u526A\u8D34\u677F\u4E2D\u65E0 HTML \u5185\u5BB9\uFF0C\u8BF7\u5148\u590D\u5236\u7F51\u9875\u5185\u5BB9", 3e3, "warning");
    } catch (err) {
      showMessage("\u8BF7\u76F4\u63A5\u7C98\u8D34\uFF08Ctrl+V\uFF09\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5904\u7406", 4e3, "info");
    }
  }
  /* ---------- 核心：处理富粘贴 ---------- */
  async _processRichPaste(html) {
    const toastId = this._showToast("\u6B63\u5728\u5904\u7406\uFF0C\u8BF7\u7A0D\u5019...", 0);
    try {
      let content;
      if (this.pasteMode === "markdown") {
        content = await this._htmlToMarkdown(html);
      } else {
        content = await this._htmlToHtmlBlock(html);
      }
      this._removeToast(toastId);
      await this._insertAtCursor(content);
      showMessage("\u5BCC\u6587\u672C\u7C98\u8D34\u5B8C\u6210 \u2705", 2e3, "info");
    } catch (err) {
      this._removeToast(toastId);
      console.error("[\u5BCC\u7C98\u8D34] \u5931\u8D25\uFF1A", err);
      showMessage("\u5904\u7406\u5931\u8D25\uFF1A" + err.message, 5e3, "error");
      if (confirm("\u5BCC\u6587\u672C\u5904\u7406\u5931\u8D25\uFF0C\u662F\u5426\u4EE5 HTML \u5757\u5F62\u5F0F\u63D2\u5165\u539F\u59CB\u5185\u5BB9\uFF1F")) {
        await this._insertAtCursor("```html\n" + html + "\n```");
      }
    }
  }
  /* ---------- HTML → Markdown（调用内核 API） ---------- */
  _htmlToMarkdown(html) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("dom", html);
      const nb = this.activeProtyle?.notebook?.id || this._getCurrentNotebookId();
      if (nb) fd.append("notebook", nb);
      fetch(API_COPY, { method: "POST", body: fd }).then((r) => r.json()).then((resp) => {
        if (resp.code === 0) {
          resolve(resp.data?.md || "");
        } else {
          reject(new Error(resp.msg || "\u5185\u6838API\u8FD4\u56DE\u9519\u8BEF"));
        }
      }).catch(reject);
    });
  }
  /* ---------- HTML → HTML块（下载图片后包装） ---------- */
  async _htmlToHtmlBlock(html) {
    const urls = [...new Set(
      [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
    )];
    let processed = html;
    for (const url of urls) {
      if (!url.startsWith("http")) continue;
      try {
        const local = await this._downloadAndUploadImage(url);
        processed = processed.split(url).join(local);
      } catch (e) {
        console.warn("[\u5BCC\u7C98\u8D34] \u56FE\u7247\u4E0B\u8F7D\u5931\u8D25\uFF1A", url, e);
      }
    }
    return "```html\n" + processed + "\n```";
  }
  /* ---------- 下载图片并上传到 assets ---------- */
  _downloadAndUploadImage(url) {
    return new Promise((resolve, reject) => {
      fetch(API_COPY, {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("dom", `<img src="${url.replace(/"/g, '\\"')}">`);
          const nb = this._getCurrentNotebookId();
          if (nb) fd.append("notebook", nb);
          return fd;
        })()
      }).then((r) => r.json()).then((resp) => {
        if (resp.code === 0 && resp.data?.md) {
          const m = resp.data.md.match(/\(([^)]+)\)/);
          if (m) {
            resolve(m[1]);
            return;
          }
        }
        reject(new Error("\u5185\u6838\u5904\u7406\u56FE\u7247\u5931\u8D25"));
      }).catch(reject);
    });
  }
  /* ---------- 在光标处插入内容 ---------- */
  async _insertAtCursor(content) {
    const protyle = this._getActiveProtyle();
    if (!protyle) {
      showMessage("\u8BF7\u5148\u70B9\u51FB\u7F16\u8F91\u5668", 3e3, "error");
      return;
    }
    if (typeof protyle.insert === "function") {
      protyle.insert(content);
      return;
    }
    if (document.execCommand("insertText", false, content)) return;
    const blockId = this._getCurrentBlockId();
    if (blockId) {
      await this._insertBlockAfter(blockId, content);
      return;
    }
    showMessage("\u65E0\u6CD5\u63D2\u5165\u5185\u5BB9\uFF0C\u8BF7\u5C1D\u8BD5\u5237\u65B0\u601D\u6E90", 3e3, "warning");
  }
  async _insertBlockAfter(prevId, markdown) {
    return new Promise((resolve, reject) => {
      fetchPost(API_INSERT, {
        data: markdown,
        dataType: "markdown",
        previousID: prevId
      }, (resp) => {
        if (resp.code === 0) resolve();
        else reject(new Error(resp.msg));
      });
    });
  }
  /* ==========================================================
     三、设置面板
     ========================================================== */
  _initSettings() {
    this.protyleSlash.push({
      filter: ["\u5B57\u9762\u8BBE\u7F6E", "literal setting", "zbsz"],
      html: `<div class="b3-list-item__first">
               <span class="b3-list-item__text">\u63D2\u4EF6\u8BBE\u7F6E</span>
               <span class="b3-list-item__meta">\u5B57\u9762\u6587\u672C+\u5BCC\u7C98\u8D34</span>
             </div>`,
      id: "literal-settings",
      callback: () => this._showSettingsDialog()
    });
  }
  _showSettingsDialog() {
    const dialog = new Dialog({
      title: "\u5B57\u9762\u6587\u672C + \u5BCC\u7C98\u8D34 \xB7 \u8BBE\u7F6E",
      width: isMobile() ? "92%" : "500px",
      content: `
        <div style="padding:20px 24px 0;font-size:13px;line-height:2;">
          <div style="font-weight:600;font-size:14px;margin-bottom:12px;color:var(--b3-theme-on-background);">
            \u5B57\u9762\u6587\u672C\u8F93\u5165</div>

          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;">
            <input type="checkbox" id="cfg-auto-escape" ${this.autoEscapeMode ? "checked" : ""}/>
            <span>\u9ED8\u8BA4\u5F00\u542F\u81EA\u52A8\u8F6C\u4E49\uFF08\u8F93\u5165 * # \u81EA\u52A8\u52A0 \\\uFF09</span>
          </label>

          <div style="height:1px;background:var(--b3-border-color);margin:16px 0;"></div>

          <div style="font-weight:600;font-size:14px;margin-bottom:12px;color:var(--b3-theme-on-background);">
            \u5BCC\u6587\u672C\u7C98\u8D34</div>

          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
            <input type="checkbox" id="cfg-rich-paste" ${this.richPasteEnabled ? "checked" : ""}/>
            <span>\u81EA\u52A8\u62E6\u622A\u7C98\u8D34\uFF0C\u8C03\u7528\u5185\u6838 API \u672C\u5730\u5316\u56FE\u7247</span>
          </label>

          <div style="margin-bottom:4px;">\u7C98\u8D34\u6A21\u5F0F\uFF1A</div>
          <div style="display:flex;gap:20px;margin-bottom:14px;padding-left:4px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="cfg-paste-mode" value="markdown" ${this.pasteMode === "markdown" ? "checked" : ""}/>
              <span>Markdown \u6A21\u5F0F</span>
              <span style="color:var(--b3-empty-color);font-size:11px;">\uFF08\u63A8\u8350\uFF0C\u53EF\u7F16\u8F91\uFF09</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="radio" name="cfg-paste-mode" value="html" ${this.pasteMode === "html" ? "checked" : ""}/>
              <span>HTML \u5757\u6A21\u5F0F</span>
              <span style="color:var(--b3-empty-color);font-size:11px;">\uFF08\u4FDD\u771F\uFF0C\u96BE\u7F16\u8F91\uFF09</span>
            </label>
          </div>

          <div style="background:var(--b3-card-error-background);border-radius:6px;padding:10px 14px;font-size:12px;line-height:1.7;color:var(--b3-theme-on-background);">
            \u{1F4A1} <b>\u63D0\u793A</b><br/>
            Markdown \u6A21\u5F0F\u8C03\u7528\u601D\u6E90\u5185\u6838 <code>/api/extension/copy</code>\uFF0C\u81EA\u52A8\u5C06 HTML \u8F6C\u4E3A Markdown \u5E76\u4E0B\u8F7D\u56FE\u7247\u5230\u672C\u5730 assets \u76EE\u5F55\u3002<br/>
            \u82E5\u7C98\u8D34\u516C\u4F17\u53F7\u6587\u7AE0\u56FE\u7247\u4E22\u5931\uFF0C\u8BF7\u786E\u8BA4\u601D\u6E90\u5185\u6838\u53EF\u8BBF\u95EE\u5916\u7F51\uFF08\u5FAE\u4FE1\u56FE\u7247 CDN\uFF09\u3002
          </div>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="cfg-cancel" style="margin-right:8px;">\u53D6\u6D88</button>
          <button class="b3-button b3-button--primary" id="cfg-ok">\u4FDD\u5B58</button>
        </div>`
    });
    const $ = (s) => dialog.element.querySelector(s);
    $("#cfg-ok").addEventListener("click", async () => {
      const newAutoEscape = $("#cfg-auto-escape").checked;
      const newRichPaste = $("#cfg-rich-paste").checked;
      const newPasteMode = dialog.element.querySelector('input[name="cfg-paste-mode"]:checked')?.value || "markdown";
      this.autoEscapeMode = newAutoEscape;
      this.pasteMode = newPasteMode;
      if (newRichPaste !== this.richPasteEnabled) {
        this.richPasteEnabled = newRichPaste;
        newRichPaste ? this._enablePasteInterception() : this._disablePasteInterception();
      }
      newAutoEscape ? this._showEscapeIndicator() : this._hideEscapeIndicator();
      await this._saveConfig();
      dialog.destroy();
      showMessage("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58", 2e3, "info");
    });
    $("#cfg-cancel").addEventListener("click", () => dialog.destroy());
  }
  /* ==========================================================
     工具方法
     ========================================================== */
  _getActiveProtyle() {
    const els = document.querySelectorAll(".protyle:not(.protyle--preview)");
    for (const el of els) {
      if (el.offsetParent !== null && getComputedStyle(el).display !== "none") {
        if (el.protyle) return el.protyle;
        const vue = el.__vue__ || el.closest("[data-protyle]")?.__vue__;
        if (vue?.protyle) return vue.protyle;
      }
    }
    return null;
  }
  _isEditorFocused() {
    const el = document.activeElement;
    return el ? el.closest?.(".protyle-wysiwyg") !== null || el.isContentEditable : false;
  }
  _getCurrentBlockId() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.getRangeAt(0).startContainer.parentElement;
    const block = node?.closest?.("[data-node-id]");
    return block?.getAttribute("data-node-id") || null;
  }
  _getCurrentNotebookId() {
    const protyle = this._getActiveProtyle();
    return protyle?.notebook?.id || protyle?.block?.rootID || "";
  }
  _insertText(text) {
    const protyle = this._getActiveProtyle();
    if (protyle?.insert) {
      protyle.insert(text);
      return;
    }
    document.execCommand("insertText", false, text);
  }
  /* ---------- Toast ---------- */
  _showToast(msg, duration) {
    const id = "toast-" + Date.now();
    const el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      background: "rgba(0,0,0,.72)",
      color: "#fff",
      padding: "10px 22px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: "999999",
      pointerEvents: "none",
      fontFamily: "system-ui,sans-serif",
      whiteSpace: "nowrap"
    });
    el.textContent = msg;
    document.body.appendChild(el);
    if (duration > 0) setTimeout(() => el.remove(), duration);
    return id;
  }
  _removeToast(id) {
    document.getElementById(id)?.remove();
  }
};
export {
  LiteralTextPlugin as default
};
