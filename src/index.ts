/**
 * 思源笔记插件 - 转义 v2.7.0
 *
 * 功能一：字面文本输入
 *   Ctrl+Shift+L  弹窗输入，不被 Markdown 渲染
 *   Ctrl+Shift+E  切换自动转义模式
 *   /字面  /literal  斜杠命令
 *
 * 功能二：自动转义（核心）
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

import { Plugin, Dialog, showMessage, getFrontend, getActiveEditor, getAllEditor, Setting } from "siyuan";

// 常量
const STORAGE_KEY = "escape-config";
const API_COPY = "/api/extension/copy";
const API_INSERT = "/api/block/insertBlock";

/**
 * 安全字符映射（# 行内代码包裹是唯一可靠方案）
 *
 * 经过实测验证：反斜杠转义 \* 可被 Lute 正确保留（不渲染为斜体）；
 * 行内代码包裹 `#` 时 Lute 不解析内部内容，而 \# 与 \u200B# 两种方案均失败。
 */
const SAFE_ASTERISK = "\\*";       // 反斜杠转义 * — 对斜体有效
const SAFE_HASH = "`#`";           // 反引号行内代码包裹 # — 对标签/标题有效

// 图标定义（SVG Symbol 格式，通过 addIcons 注册） 思源 addTopBar 的 icon 参数接受 Symbol ID 字符串，不是原始 SVG！

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

// 辅助函数
const _isMobile = () => {
  const f = getFrontend();
  return f === "mobile" || f === "browser-mobile";
};

// 插件主类
interface LiteralTextConfig {
  autoEscape?: boolean;
  richPaste?: boolean;
  escapeChars?: string[];
  assetSubdir?: string;
}

export default class LiteralTextPlugin extends Plugin {
  /* ---------- 实例属性（供严格模式类型检查） ---------- */
  config!: LiteralTextConfig;
  autoEscapeMode!: boolean;
  richPasteEnabled!: boolean;
  escapeChars!: string[];
  assetSubdir!: string;
  pasteHandler!: ((event: any) => Promise<void>) | null;
  _escapeHandler!: ((e: any) => void) | null;
  _escapeTopBarBtn!: any;
  _savedRange!: Range | null;
  _savedBlockId!: string | null;
  _savedProtyle!: any;
  protyleSlash!: any;

  /* ---------- 生命周期 ---------- */
  async onload() {
    console.log("[转义] v2.7.0 开始加载...");

    /* --- 加载配置（带日志） --- */
    this.config = await this.loadData(STORAGE_KEY).catch((err) => {
      console.warn("[转义] 配置加载失败，使用默认值:", err);
      return {};
    }) || {};
    console.log("[转义] 已加载配置:", JSON.stringify(this.config));

    // 默认开启自动转义（用户首次安装即生效）
    this.autoEscapeMode = this.config.autoEscape ?? true;
    this.richPasteEnabled = this.config.richPaste ?? true;
    // 自动转义字符集（默认 * 和 #，与历史行为一致）
    this.escapeChars = Array.isArray(this.config.escapeChars) && this.config.escapeChars.length
      ? this.config.escapeChars.filter((c) => typeof c === "string" && c.length === 1)
      : ["*", "#"];
    // 富粘贴图片保存子目录（assets/ 下，为空则用默认 assets/）
    this.assetSubdir = typeof this.config.assetSubdir === "string" ? this.config.assetSubdir : "";

    console.log("[转义] autoEscape=" + this.autoEscapeMode + " richPaste=" + this.richPasteEnabled +
      " escapeChars=" + JSON.stringify(this.escapeChars) + " assetSubdir=" + this.assetSubdir);

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
    this.addCommand({
      langKey: "selectionToLiteral",
      langText: "选区转字面量（行内代码）",
      callback: () => this._selectionToLiteral("code"),
    });
    this.addCommand({
      langKey: "selectionToEscape",
      langText: "选区转转义（纯文本）",
      callback: () => this._selectionToLiteral("escape"),
    });
    this.addCommand({
      langKey: "literalBlockInput",
      langText: "字面文本块（多行）",
      callback: () => this._showLiteralBlockDialog(),
    });
    this.addCommand({
      langKey: "unescapeSelection",
      langText: "反字面（还原为普通文本）",
      callback: () => this._unescapeSelection(),
    });
    this.addCommand({
      langKey: "convertToHalf",
      langText: "全角转半角",
      callback: () => this._convertWidth("toHalf"),
    });
    this.addCommand({
      langKey: "convertToFull",
      langText: "半角转全角",
      callback: () => this._convertWidth("toFull"),
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
        filter: ["选区转字面", "selection literal", "xqzmb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">选区转字面量</span><span class="b3-list-item__meta">选中文本→行内代码</span></div>',
        id: "selection-literal",
        callback: () => this._selectionToLiteral("code"),
      },
      {
        filter: ["选区转转义", "selection escape", "xqzzy"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">选区转转义</span><span class="b3-list-item__meta">选中文本→纯文本</span></div>',
        id: "selection-escape",
        callback: () => this._selectionToLiteral("escape"),
      },
      {
        filter: ["字面块", "literal block", "zmk"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">字面文本块</span><span class="b3-list-item__meta">插入多行代码块</span></div>',
        id: "literal-block",
        callback: () => this._showLiteralBlockDialog(),
      },
      {
        filter: ["反字面", "unwrap", "flz"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">反字面</span><span class="b3-list-item__meta">还原行内代码/转义</span></div>',
        id: "un-literal",
        callback: () => this._unescapeSelection(),
      },
      {
        filter: ["全角转半角", "tohalf", "qjzhb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">全角转半角</span><span class="b3-list-item__meta">１．５→1.5</span></div>',
        id: "to-half",
        callback: () => this._convertWidth("toHalf"),
      },
      {
        filter: ["半角转全角", "tofull", "bjzqj"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">半角转全角</span><span class="b3-list-item__meta">1.5→１．５</span></div>',
        id: "to-full",
        callback: () => this._convertWidth("toFull"),
      },
    ];

    /* --- 2.5 设置面板（标准位置：设置 → 集市 → 已下载 → 插件齿轮） --- */
    this._buildSettingPanel();

    /* --- 3. 粘贴事件 --- */
    this._initPaste();

    /* --- 4. 恢复自动转义 --- */
    if (this.autoEscapeMode) {
      this._enableAutoEscape();
    }

    showMessage("转义 v2.7.0 已加载 ", 2500, "info");
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

      // 按钮3：自动转义开关
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

      // 按钮4：选区转转义（L1，纯文本字面量；行内代码可由 Ctrl+Shift+L / 第一个按钮完成）
      this.addTopBar({
        icon: ICON_CODE_ID,
        title: "选区转转义（选中文本→纯文本字面量）",
        position: "right",
        callback: () => this._selectionToLiteral("escape"),
      });
    } catch (e: any) {
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
    this.config.escapeChars = this.escapeChars;
    this.config.assetSubdir = this.assetSubdir;
    console.log("[转义] 保存配置:", JSON.stringify(this.config));
    try {
      await this.saveData(STORAGE_KEY, this.config);
    } catch (err: any) {
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
    } catch (e: any) { /* 静默 */ }
  }

  _getActiveProtyle(): any {
    try { const p = getActiveEditor(); if (p) return p; } catch (e: any) {}
    try { const editors = getAllEditor(); if (editors?.length) return editors[0]; } catch (e: any) {}
    return null;
  }

// 光标保存与恢复
  _saveCursorPosition(protyle) {
    const p = protyle || this._getActiveProtyle();
    if (!p) return;
    try {
      const range = p.toolbar?.range;
      if (range?.cloneRange) { this._savedRange = range.cloneRange(); this._savedProtyle = p; return; }
    } catch (e: any) {}
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) { this._savedRange = sel.getRangeAt(0).cloneRange(); this._savedProtyle = p; return; }
    } catch (e: any) {}
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
    } catch (e: any) {}
    this._clearSavedPosition();
    return false;
  }

  _clearSavedPosition() { this._savedRange = null; this._savedBlockId = null; }

// 一、字面文本输入
  _handleQuickInput(protyle?) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }
    const sel = window.getSelection()?.toString().trim() ?? "";
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
      const mode = (dialog.element.querySelector('input[name="lt-mode"]:checked') as HTMLInputElement | null)?.value || "code";
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
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }

    if (mode === "code") {
      this._insertTextAtFocus("`" + text.replace(/`/g, "\\`") + "`", p, restored);
    } else {
      this._insertTextAtFocus(this._escapeText(text), p, restored);
    }
  }

  /** 转义模式字符安全替换（与字面文本输入共用） */
  _escapeText(text) {
    return text
      .replace(/\\/g, "\\\\")                       // 反斜杠先转义
      .replace(/`/g, "\\`")                         // 反引号
      .replace(/([{}[\]()+.\-!~|><])/g, "\\$&")     // 其它 MD 特殊字符（不含 * #，避免二次转义）
      .replace(/\*/g, SAFE_ASTERISK)                // 最后处理 * 和 #，确保不被上面正则破坏
      .replace(/#/g, SAFE_HASH);
  }

  /** 按字符返回其"安全替换"形式：*→\*，#→`#`（行内代码包裹），其它→\X 反斜杠前缀 */
  _safeCharFor(ch) {
    if (ch === "*") return SAFE_ASTERISK;
    if (ch === "#") return SAFE_HASH;
    return "\\" + ch;
  }

// 文本插入
  _insertTextAtFocus(text, protyle, cursorRestored = false) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }

    if (cursorRestored) {
      try { if (document.execCommand("insertText", false, text)) return; } catch (e: any) {}
    }

    try {
      const wysiwyg = p.element?.querySelector(".protyle-wysiwyg");
      if (wysiwyg) wysiwyg.focus({ preventScroll: true });
      setTimeout(() => {
        if (typeof p.insert === "function") {
          try { p.insert(text); return; } catch (e: any) {}
        }
        this._fallbackInsert(text);
      }, 0);
      return;
    } catch (e: any) {}

    this._fallbackInsert(text);
  }

  _insertTextSync(text) {
    try { if (document.execCommand("insertText", false, text)) return true; } catch (e: any) {}
    const p = this._getActiveProtyle();
    if (p?.insert) { try { p.insert(text); return true; } catch (e: any) {} }
    return false;
  }

  _fallbackInsert(text) {
    const blockId = this._getCurrentBlockId();
    if (blockId) { this._insertBlockAfter(blockId, text).catch(() => {}); return; }
    showMessage("插入失败", 3000, "error");
  }

// 选区转字面量 / 字符全半角转换（L1 / L2）
  /** 用 text 替换当前选区（execCommand 会替换已选内容）；无选区时退化为焦点插入 */
  _replaceSelection(text) {
    const sel = window.getSelection();
    const p = this._getActiveProtyle();
    try {
      const wysiwyg = (p as any)?.element?.querySelector(".protyle-wysiwyg");
      if (wysiwyg) wysiwyg.focus({ preventScroll: true });
    } catch (e: any) {}
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      if (document.execCommand("insertText", false, text)) return true;
    }
    // 选区为空或替换失败 → 退化为焦点插入
    this._insertTextAtFocus(text, p);
    return false;
  }

  /** L1：将当前选区转为字面量（code=行内代码，escape=纯文本转义） */
  _selectionToLiteral(mode) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      showMessage("请先选中要转换的文本", 2500, "warning" as any);
      return;
    }
    const literal = mode === "code"
      ? "`" + text.replace(/`/g, "\\`") + "`"
      : this._escapeText(text);
    this._replaceSelection(literal);
    showMessage(mode === "code" ? "已转为行内代码 " : "已转义为纯文本 ", 2000, "info");
  }

  /** L2：全角 ⇄ 半角 字符转换（target: toHalf / toFull） */
  _convertWidth(target) {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      showMessage("请先选中要转换的文本", 2500, "warning" as any);
      return;
    }
    let out = "";
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (target === "toHalf") {
        if (code === 0x3000) out += " ";
        else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCodePoint(code - 0xfee0);
        else out += ch;
      } else { // toFull
        if (code === 0x20) out += "　";
        else if (code >= 0x21 && code <= 0x7e) out += String.fromCodePoint(code + 0xfee0);
        else out += ch;
      }
    }
    this._replaceSelection(out);
    showMessage(target === "toHalf" ? "全角已转半角 " : "半角已转全角 ", 2000, "info");
  }

// 二、自动转义

  _toggleAutoEscape() {
    this.autoEscapeMode = !this.autoEscapeMode;
    this._saveConfig();
    this._updateEscapeButton();

    if (this.autoEscapeMode) {
      this._enableAutoEscape();
      showMessage("自动转义已开启：*→\\*  #→\`#\`", 2500, "info");
    } else {
      this._disableAutoEscape();
      showMessage("自动转义已关闭", 2000, "info");
    }
  }

  _enableAutoEscape() {
    if (this._escapeHandler) return;

    /**
     * # 字符自动转义：
     * 经多次验证，\# 会被 Lute 块级扫描器吃掉仍渲染为标签，\u200B# 的零宽空格被 Lute 忽略继续解析 #，
     * 最终采用 `#` 行内代码包裹方案，Lute 不解析行内代码内部内容。
     */
    this._escapeHandler = (e) => {
      // 输入法合成中（中文/日文等）不拦截，避免干扰正常输入
      if (e.isComposing || e.key === "Process") return;
      if (!this.autoEscapeMode) return;
      if (!e.target.closest?.(".protyle-wysiwyg")) return;
      // 代码块 / 行内代码内不打断：里面本就是字面量，再加转义是画蛇添足
      if (e.target.closest?.(".code-block, [data-type='code-block'], code")) return;
      if (!this.escapeChars.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      const safeChar = this._safeCharFor(e.key);
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
      const toastId = this._showToast("处理中...", 0);
      try {
        const md = await this._pasteHtmlToMarkdown(textHTML, detail.protyle);
        this._removeToast(toastId);
        if (md?.trim()) {
          detail.resolve({ textPlain: md });
          showMessage("粘贴完成 ", 2000, "info");
        } else {
          detail.resolve({ textPlain: textPlain });
        }
      } catch (err: any) {
        this._removeToast(toastId);
        detail.resolve({ textPlain: textPlain });
      }
    };
    this.eventBus.on("paste", this.pasteHandler);
  }

  async _triggerRichPaste(protyle?) {
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }
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
            const md = await this._pasteHtmlToMarkdown(html, p);
            this._removeToast(tid);
            if (md?.trim()) {
              this._restoreCursorPosition();
              this._clearSavedPosition();
              this._insertTextAtFocus(md, p, true);
              showMessage("粘贴完成 ", 2000, "info");
            } else { this._clearSavedPosition(); }
          } catch (err: any) {
            this._removeToast(tid);
            this._clearSavedPosition();
            showMessage("失败:" + err.message, 4000, "error");
          }
          return;
        }
      }
      this._clearSavedPosition();
      showMessage("剪贴板无 HTML 内容", 3000, "warning" as any);
    } catch (err: any) {
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

// 三·五、富粘贴图片子目录迁移

  /** HTML → Markdown（含图片本地化），并依据设置把图片迁到 assets/<subdir>/ */
  async _pasteHtmlToMarkdown(html, protyle) {
    const md = await this._htmlToMarkdown(html, protyle);
    if (!md || !this.assetSubdir) return md;
    try {
      return await this._relocateAssets(md, this.assetSubdir, protyle);
    } catch (e: any) {
      console.warn("[转义] 图片子目录迁移失败，保留默认 assets:", e.message);
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
          // 清理原位置图片
          fetch("/api/file/removeFile?path=" + encodeURIComponent("assets/" + file), { method: "POST" }).catch(() => {});
        }
      } catch (e: any) {
        console.warn("[转义] 单张图片迁移失败，保留原引用:", file, e.message);
      }
    }
    return out;
  }

// 三·六、字面文本块（多行）
  _showLiteralBlockDialog(protyle?) {
    const mobile = _isMobile();
    const p = protyle || this._getActiveProtyle();
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }
    this._saveCursorPosition(p);

    const dialog = new Dialog({
      title: "字面文本块（多行）",
      width: mobile ? "92%" : "560px",
      content: `
        <div style="padding:20px 24px 8px;">
          <div class="lt-dialog-hint">
            插入一个多行代码块，内容原样显示、不被 Markdown 渲染。<br/>
            适合消防设备型号表、多行规格、长代码片段等。
          </div>
          <textarea id="lt-block-input" class="b3-text-field"
                    style="width:100%;min-height:${mobile ? "160px" : "140px"};padding:${mobile ? "12px 14px" : "9px 12px"};font-size:${mobile ? "16px" : "14px"};resize:vertical;"
                    placeholder="JTW-ZD-9911*2&#10;JTW-ZD-9912*4&#10;... (每行一条，原样保留 * # 等符号)"></textarea>
        </div>
        <div class="b3-dialog__action" style="padding:12px 24px 16px;">
          <button class="b3-button" id="ltb-cancel" style="margin-right:8px;">取消</button>
          <button class="b3-button b3-button--primary" id="ltb-ok">插入代码块</button>
        </div>`,
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
    $("#ltb-cancel").addEventListener("click", () => { dialog.destroy(); this._clearSavedPosition(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirm(); }
      if (e.key === "Escape") { e.preventDefault(); dialog.destroy(); this._clearSavedPosition(); }
    });
  }

  /** 在当前块后插入一个代码块（多行字面文本） */
  async _insertCodeBlock(text, protyle) {
    const p = protyle || this._getActiveProtyle() || this._savedProtyle;
    if (!p) { showMessage("请先打开文档", 3000, "warning" as any); return; }
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
      showMessage("已插入字面文本块 ", 2000, "info");
    } catch (err: any) {
      console.error("[转义] 插入代码块失败:", err);
      showMessage("插入失败，已退回焦点插入", 3000, "error");
      this._insertTextAtFocus(md, p);
    }
  }

// 三·七、反字面（还原为普通文本）
  _unescapeSelection() {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || !text.trim()) {
      showMessage("请先选中要还原的文本", 2500, "warning" as any);
      return;
    }
    // 去掉紧接在特殊字符前的转义反斜杠；选区替换会同时清除行内代码格式（unwrap）
    const unescaped = text.replace(/\\([*#_~`+\-!|><[\](){}])/g, "$1");
    this._replaceSelection(unescaped);
    showMessage("已还原为普通文本 ", 2000, "info");
  }

// 四、设置面板（标准位置：设置 -> 集市 -> 已下载 -> 插件齿轮）
  _buildSettingPanel() {
    const mobile = _isMobile();
    this.setting = new Setting({
      width: mobile ? "92%" : "560px",
      height: mobile ? "auto" : "auto",
      confirmCallback: () => {
        this._saveConfig();
        showMessage("已保存", 2000, "info");
      },
    });

    this.setting.addItem({
      title: "自动转义",
      description: "开启后输入 * # _ 等会被自动保护（* -> \*，# -> 行内代码）。代码块内不受影响。",
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
      },
    });

    this.setting.addItem({
      title: "自动转义的字符",
      description: "默认 * 和 #。# 用行内代码包裹，其它用反斜杠前缀。",
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
          const chars = Array.from(wrap.querySelectorAll("input.cfg-escape-char:checked"))
            .map((cb) => (cb as HTMLInputElement).value);
          this.escapeChars = chars.length ? chars : ["*", "#"];
        });
        return wrap;
      },
    });

    this.setting.addItem({
      title: "富文本粘贴",
      description: "自动拦截粘贴，调用内核 API 本地化图片（/api/extension/copy）。",
      createActionElement: () => {
        const el = document.createElement("input");
        el.type = "checkbox";
        el.id = "cfg-rich-paste";
        el.checked = this.richPasteEnabled;
        el.addEventListener("change", () => { this.richPasteEnabled = el.checked; });
        return el;
      },
    });

    this.setting.addItem({
      title: "图片保存子目录",
      description: "如填 wechat，图片存到 assets/wechat/（仅字母数字下划线连字符）。留空=默认 assets/。",
      createActionElement: () => {
        const el = document.createElement("input");
        el.type = "text";
        el.id = "cfg-asset-subdir";
        el.className = "b3-text-field fn__size200";
        el.value = this.assetSubdir;
        el.placeholder = "留空=默认 assets/";
        el.addEventListener("input", () => { this.assetSubdir = el.value.trim(); });
        return el;
      },
    });
  }


// 工具方法
  _getCurrentBlockId(protyle?) {
    try {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return null;
      const node = sel.getRangeAt(0).startContainer.parentElement;
      return node?.closest?.("[data-node-id]")?.getAttribute("data-node-id") || null;
    } catch (e: any) { return null; }
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
