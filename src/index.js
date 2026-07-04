/**
 * 思源笔记插件 - 转义 v2.7.0
 *
 * 功能一：字面文本输入
 *   Ctrl+Shift+L  弹窗输入，不被 Markdown 渲染
 *   Ctrl+Shift+E  切换自动转义模式
 *   /字面  /literal  斜杠命令
 *
 * 功能二：自动转义（★ 核心）
 *   开启后：按 * 自动插入 \*  （不被渲染为斜体/粗体）
 *          按 # 自动插入 `#` （不被渲染为标签/标题）
 *   Ctrl+Shift+E 切换 | 顶部栏图标点击切换
 *
 * 功能三：富文本粘贴（公众号/网页粘贴自动下载图片）
 *   Ctrl+Shift+V  手动触发 | /富文本 斜杠命令
 *
 * v2.7.0 变更：
 *   - 代码质量清理：移除 CSS 死代码、僵尸 i18n key、冗余方法
 *   - SVG 图标改用 currentColor 跟随主题
 *   - _htmlToMarkdown 移除多余的 new Promise 包装
 */

import { Plugin, Dialog, showMessage, getFrontend, getActiveEditor, getAllEditor } from "siyuan";

/* ============================================================
   常量
   ============================================================ */
const STORAGE_KEY = "escape-config";
const API_COPY = "/api/extension/copy";
const API_INSERT = "/api/block/insertBlock";

/**
 * 安全字符映射（# 行内代码包裹是唯一可靠方案）
 *
 * 经过实测验证：
 *   \*    → Lute 正确保留，不渲染为斜体 ✅
 *   `#`   → 行内代码包裹，Lute 不解析内容 ✅（\# 和 \u200B# 均失败 ❌）
 */
const SAFE_ASTERISK = "\\*";       // 反斜杠转义 * — 对斜体有效
const SAFE_HASH = "`#`";           // 反引号行内代码包裹 # — 对标签/标题有效

/* ============================================================
   图标定义（SVG Symbol 格式，通过 addIcons 注册）
   思源 addTopBar 的 icon 参数接受 Symbol ID 字符串，不是原始 SVG！
   ============================================================ */

/** 图标注册：一次性注册所有 Symbol 定义（ID 必须以 icon 开头，匹配官方规范） */
const ICON_SYMBOLS = `
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

/** 图标 ID 引用（用于 addTopBar） */
const ICON_CODE_ID     = "iconEscape";
const ICON_PASTE_ID    = "iconPaste";
const ICON_ESCAPE_ON_ID  = "iconShieldOn";
const ICON_ESCAPE_OFF_ID = "iconShieldOff";

/* ============================================================
   辅助函数
   ============================================================ */
const _isMobile = () => {
  const f = getFrontend();
  return f === "mobile" || f === "browser-mobile";
};

/* ============================================================
   插件主类
   ============================================================ */
export default class LiteralTextPlugin extends Plugin {

  /* ---------- 生命周期 ---------- */
  async onload() {
    console.log("[转义] v2.7.0 开始加载...");

    /* --- 加载配置（带日志） --- */
    this.config = await this.loadData(STORAGE_KEY).catch((err) => {
      console.warn("[转义] 配置加载失败，使用默认值:", err);
      return {};
    }) || {};
    console.log("[转义] 已加载配置:", JSON.stringify(this.config));

    // ★ 默认开启自动转义（用户首次安装即生效）
    this.autoEscapeMode = this.config.autoEscape ?? true;
    this.richPasteEnabled = this.config.richPaste ?? true;

    console.log("[转义] autoEscape=" + this.autoEscapeMode + " richPaste=" + this.richPasteEnabled);

    this.pasteHandler = null;
    this._escapeHandler = null;
    this._escapeTopBarBtn = null;

    this._savedRange = null;
    this._savedBlockId = null;
    this._savedProtyle = null;

    /* --- 0. 注册图标（必须在 addTopBar 之前） --- */
    this.addIcons(ICON_SYMBOLS);

    /* --- 1. 快捷键 --- */
    this.addCommand({
      langKey: "quickLiteralInput",
      langText: "字面文本快速输入",
      hotkey: "⇧⌘L",
      callback: () => this._handleQuickInput(),
    });
    this.addCommand({
      langKey: "toggleAutoEscape",
      langText: "切换自动转义",
      hotkey: "⇧⌘E",
      callback: () => this._toggleAutoEscape(),
    });
    this.addCommand({
      langKey: "richPaste",
      langText: "富文本粘贴",
      hotkey: "⇧⌘V",
      callback: () => this._triggerRichPaste(),
    });

    /* --- 2. 斜杠命令 --- */
    this.protyleSlash = [
      {
        filter: ["字面文本", "literal", "zmbw"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">字面文本输入</span><span class="b3-list-item__meta">*# 不被渲染</span></div>',
        id: "literal-input",
        callback: (protyle) => this._showLiteralDialog("code", protyle),
      },
      {
        filter: ["转义文本", "escape", "zywb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">转义文本输入</span><span class="b3-list-item__meta">\\*\\# 纯文本</span></div>',
        id: "escape-input",
        callback: (protyle) => this._showLiteralDialog("escape", protyle),
      },
      {
        filter: ["富文本粘贴", "rich paste", "fwbzt"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">富文本粘贴</span><span class="b3-list-item__meta">自动下载图片</span></div>',
        id: "rich-paste",
        callback: (protyle) => this._triggerRichPaste(protyle),
      },
      {
        filter: ["设置", "setting"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">插件设置</span></div>',
        id: "settings",
        callback: () => this._showSettingsDialog(),
      },
    ];

    /* --- 3. 粘贴事件 --- */
    this._initPaste();

    /* --- 4. 恢复自动转义 --- */
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
    }

    showMessage("转义 v2.7.0 已加载 ✅", 2500, "info");
    console.log("[转义] 加载完成，前端：" + getFrontend() + "，自动转义：" + (this.autoEscapeMode ? "开启" : "关闭"));
  }

  onLayoutReady() {
    // 移动端顶栏可能不存在或行为不同，用 try/catch 容错
    try {
      // 按钮1：字面文本输入
      this.addTopBar({
        icon: ICON_CODE_ID,
        title: "字面文本（Ctrl+Shift+L）",
        position: "right",
        callback: () => this._handleQuickInput(),
      });

      // 按钮2：富文本粘贴
      this.addTopBar({
        icon: ICON_PASTE_ID,
        title: "富粘贴（Ctrl+Shift+V）",
        position: "right",
        callback: () => this._triggerRichPaste(),
      });

      // ★ 按钮3：自动转义开关
      const escIcon = this.autoEscapeMode ? ICON_ESCAPE_ON_ID : ICON_ESCAPE_OFF_ID;
      const escTitle = this.autoEscapeMode
        ? "自动转义：已开启（点击或 Ctrl+Shift+E 关闭）"
        : "自动转义：已关闭（点击或 Ctrl+Shift+E 开启）";
      this._escapeTopBarBtn = this.addTopBar({
        icon: escIcon,
        title: escTitle,
        position: "right",
        callback: () => this._toggleAutoEscape(),
      });
    } catch (e) {
      console.warn("[转义] 顶栏按钮注册失败（移动端可能不支持）:", e.message);
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
    console.log("[转义] 已卸载");
  }

  /* ---------- 配置持久化 ---------- */
  async _saveConfig() {
    this.config.autoEscape = this.autoEscapeMode;
    this.config.richPaste = this.richPasteEnabled;
    console.log("[转义] 保存配置:", JSON.stringify(this.config));
    try {
      await this.saveData(STORAGE_KEY, this.config);
    } catch (err) {
      console.error("[转义] 配置保存失败:", err);
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
        svg.style.color = this.autoEscapeMode
          ? "var(--b3-theme-primary)"
          : "var(--b3-empty-color)";
        this._escapeTopBarBtn.title = this.autoEscapeMode
          ? "自动转义：已开启（点击关闭）"
          : "自动转义：已关闭（点击开启）";
      }
    } catch (e) { /* 静默 */ }
  }

  _getActiveProtyle() {
    try { const p = getActiveEditor(); if (p) return p; } catch (e) {}
    try { const editors = getAllEditor(); if (editors?.length) return editors[0]; } catch (e) {}
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
      if (range?.cloneRange) { this._savedRange = range.cloneRange(); this._savedProtyle = p; return; }
    } catch (e) {}
    try {
      const sel = window.getSelection();
      if (sel?.rangeCount > 0) { this._savedRange = sel.getRangeAt(0).cloneRange(); this._savedProtyle = p; return; }
    } catch (e) {}
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
        if (sel) { sel.removeAllRanges(); sel.addRange(this._savedRange); return true; }
      }
    } catch (e) {}
    this._clearSavedPosition();
    return false;
  }

  _clearSavedPosition() { this._savedRange = null; this._savedBlockId = null; }

  /* ==========================================================
     一、字面文本输入
     ========================================================== */
  _handleQuickInput(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning"); return; }
    const sel = window.getSelection().toString().trim();
    if (sel) {
      this._insertTextAtFocus("`" + sel.replace(/`/g, "\\`") + "`", p);
      showMessage("已包裹为行内代码", 2000, "info");
    } else {
      this._saveCursorPosition(p);
      this._showLiteralDialog("code", p);
    }
  }

  _showLiteralDialog(defaultMode, protyle) {
    const mobile = _isMobile();
    if (!this._savedRange && !this._savedBlockId) this._saveCursorPosition(protyle);

    const dialog = new Dialog({
      title: "字面文本输入",
      width: mobile ? "92%" : "520px",
      content: `
        <div style="padding:20px 24px 8px;">
          <div class="lt-dialog-hint">
            输入的内容不会被 Markdown 渲染，以原始格式显示。<br/>
            适用于消防设备型号、电缆规格等含特殊符号的文本。
          </div>
          <input id="lt-input" class="b3-text-field lt-dialog-input"
                 style="width:100%;padding:${mobile ? "12px 14px" : "9px 12px"};font-size:${mobile ? "16px" : "14px"};"
                 placeholder="*#JTW-ZD-9911 点型光电感烟探测器" />
          <div class="lt-mode-row">
            <label class="lt-mode-label">
              <input type="radio" name="lt-mode" value="code" ${defaultMode === "code" ? "checked" : ""}/>
              <span>行内代码</span>
              <span class="lt-mode-hint">（灰色底框）</span>
            </label>
            <label class="lt-mode-label">
              <input type="radio" name="lt-mode" value="escape" ${defaultMode === "escape" ? "checked" : ""}/>
              <span>转义字符</span>
              <span class="lt-mode-hint">（纯文本）</span>
            </label>
          </div>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="lt-cancel" style="margin-right:8px;">取消</button>
          <button class="b3-button b3-button--primary" id="lt-ok">插入</button>
        </div>`,
    });

    const $ = (s) => dialog.element.querySelector(s);
    const input = $("#lt-input");
    setTimeout(() => input?.focus(), mobile ? 200 : 80);

    const confirm = () => {
      const text = input.value.trim();
      if (!text) { dialog.destroy(); this._clearSavedPosition(); return; }
      const mode = dialog.element.querySelector('input[name="lt-mode"]:checked')?.value || "code";
      this._restoreAndInsert(text, mode, protyle);
      dialog.destroy();
    };

    $("#lt-ok").addEventListener("click", confirm);
    $("#lt-cancel").addEventListener("click", () => { dialog.destroy(); this._clearSavedPosition(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirm(); }
      if (e.key === "Escape") { e.preventDefault(); dialog.destroy(); this._clearSavedPosition(); }
    });
  }

  _restoreAndInsert(text, mode, protyle) {
    const restored = this._restoreCursorPosition();
    this._clearSavedPosition();
    const p = protyle || this._savedProtyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning"); return; }

    if (mode === "code") {
      this._insertTextAtFocus("`" + text.replace(/`/g, "\\`") + "`", p, restored);
    } else {
      /**
       * 转义模式的字符安全替换：
       *   \  → \\   （反斜杠本身需要转义）
       *   `  → \`   （反引号需要转义）
       *   *  → \*   （反斜杠对斜体有效）
       *   #  → `#`  （行内代码包裹！\# 和零宽空格都被 Lute 吃掉）
       *   其他 MD 特殊字符 → 标准反斜杠转义
       */
      const escaped = text
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\*/g, SAFE_ASTERISK)
        .replace(/#/g, SAFE_HASH)
        .replace(/([{}\[\]()#+\-.!~|><])/g, "\\$&")
        .replace(/`#`/g, SAFE_HASH);  // 确保上面正则没把 SAFE_HASH 再次转义
      this._insertTextAtFocus(escaped, p, restored);
    }
  }

  /* ==========================================================
     文本插入
     ========================================================== */
  _insertTextAtFocus(text, protyle, cursorRestored = false) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning"); return; }

    if (cursorRestored) {
      try { if (document.execCommand("insertText", false, text)) return; } catch (e) {}
    }

    try {
      const wysiwyg = p.element?.querySelector(".protyle-wysiwyg");
      if (wysiwyg) wysiwyg.focus({ preventScroll: true });
      setTimeout(() => {
        if (typeof p.insert === "function") {
          try { p.insert(text); return; } catch (e) {}
        }
        this._fallbackInsert(text);
      }, 0);
      return;
    } catch (e) {}

    this._fallbackInsert(text);
  }

  _insertTextSync(text) {
    try { if (document.execCommand("insertText", false, text)) return true; } catch (e) {}
    const p = this._getActiveProtyle();
    if (p?.insert) { try { p.insert(text); return true; } catch (e) {} }
    return false;
  }

  _fallbackInsert(text) {
    const blockId = this._getCurrentBlockId();
    if (blockId) { this._insertBlockAfter(blockId, text).catch(() => {}); return; }
    showMessage("插入失败", 3000, "error");
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
      showMessage("✅ 自动转义已开启：*→\\*  #→\`#\`", 2500, "info");
    } else {
      this._disableAutoEscape();
      showMessage("自动转义已关闭", 2000, "info");
    }
  }

  _enableAutoEscape() {
    if (this._escapeHandler) return;

    /**
     * # 字符自动转义（经过 3 次迭代验证）：
     *
     * 迭代1: \#         → 被 Lute 块级扫描器吃掉，仍渲染为标签 ❌
     * 迭代2: \u200B#     → 零宽空格被 Lute 忽略，继续解析 # ❌
     * 迭代3: `#` (行内代码) → Lute 不解析行内代码内部内容 ✅
     */
    this._escapeHandler = (e) => {
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
      const toastId = this._showToast("处理中...", 0);
      try {
        const md = await this._htmlToMarkdown(textHTML, detail.protyle);
        this._removeToast(toastId);
        if (md?.trim()) {
          detail.resolve({ textPlain: md });
          showMessage("粘贴完成 ✅", 2000, "info");
        } else {
          detail.resolve({ textPlain: textPlain });
        }
      } catch (err) {
        this._removeToast(toastId);
        detail.resolve({ textPlain: textPlain });
      }
    };
    this.eventBus.on("paste", this.pasteHandler);
  }

  async _triggerRichPaste(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning"); return; }
    this._saveCursorPosition(p);

    // 移动端可能不支持 navigator.clipboard.read()（需要 HTTPS + 用户手势）
    const mobile = _isMobile();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          const tid = this._showToast("处理中...", 0);
          try {
            const md = await this._htmlToMarkdown(html, p);
            this._removeToast(tid);
            if (md?.trim()) {
              this._restoreCursorPosition();
              this._clearSavedPosition();
              this._insertTextAtFocus(md, p, true);
              showMessage("粘贴完成 ✅", 2000, "info");
            } else { this._clearSavedPosition(); }
          } catch (err) {
            this._removeToast(tid);
            this._clearSavedPosition();
            showMessage("失败:" + err.message, 4000, "error");
          }
          return;
        }
      }
      this._clearSavedPosition();
      showMessage("剪贴板无 HTML 内容", 3000, "warning");
    } catch (err) {
      this._clearSavedPosition();
      console.warn("[转义] clipboard.read 失败:", err.message);
      showMessage(
        mobile
          ? "移动端不支持手动富粘贴，请直接 Ctrl+V 粘贴"
          : "请直接 Ctrl+V 粘贴（或检查浏览器权限）",
        mobile ? 4000 : 3000,
        "info"
      );
    }
  }

  _htmlToMarkdown(html, protyle) {
    const fd = new FormData();
    fd.append("dom", html);
    const nb = this._getNotebookId(protyle);
    if (nb) fd.append("notebook", nb);
    return fetch(API_COPY, { method: "POST", body: fd })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then(resp => resp.code === 0 ? (resp.data?.md || "") : Promise.reject(new Error(resp.msg)));
  }

  _getNotebookId(protyle) {
    return protyle?.notebook?.id || protyle?.notebookId || protyle?.block?.rootID
      || (() => { try { return new URL(location.href).searchParams.get("id"); } catch { return ""; } })();
  }

  _insertBlockAfter(prevId, md) {
    return fetch(API_INSERT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: md, dataType: "markdown", previousID: prevId }),
    }).then(r => r.json()).then(resp => resp.code === 0 ? undefined : Promise.reject(resp.msg));
  }

  /* ==========================================================
     四、设置面板
     ========================================================== */
  _showSettingsDialog() {
    const mobile = _isMobile();
    const dialog = new Dialog({
      title: "转义 · 设置",
      width: mobile ? "92%" : "480px",
      content: `
        <div style="padding:20px 24px 0;font-size:13px;line-height:2;">
          <div class="lt-settings-section">自动转义</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;">
            <input type="checkbox" id="cfg-auto-escape" ${this.autoEscapeMode ? "checked" : ""}/>
            <span>开启自动转义（* → \\* ，# → 行内代码）</span>
          </label>

          <div class="lt-settings-divider"></div>

          <div class="lt-settings-section">富文本粘贴</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
            <input type="checkbox" id="cfg-rich-paste" ${this.richPasteEnabled ? "checked" : ""}/>
            <span>自动拦截粘贴，调用内核 API 本地化图片</span>
          </label>

          <div class="lt-settings-warn">
            <b>说明</b><br/>
            • <b>*</b> 用反斜杠 <code>\\*</code> 保护<br/>
            • <b>#</b> 用行内代码 <code>\`#\`</code> 保护（<code>\\#</code> 和零宽空格均被思源引擎忽略）<br/>
            • 顶部栏第三个按钮可一键切换自动转义<br/>
            • 富粘贴使用内核 <code>/api/extension/copy</code>
          </div>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="cfg-cancel" style="margin-right:8px;">取消</button>
          <button class="b3-button b3-button--primary" id="cfg-ok">保存</button>
        </div>`,
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
      showMessage("已保存", 2000, "info");
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
    } catch (e) { return null; }
  }

  _showToast(msg, dur) {
    const id = "lt-t-" + Date.now();
    const el = document.createElement("div");
    el.id = id; el.className = "lt-toast"; el.textContent = msg;
    document.body.appendChild(el);
    if (dur > 0) setTimeout(() => el.remove(), dur);
    return id;
  }

  _removeToast(id) { document.getElementById(id)?.remove(); }
}
