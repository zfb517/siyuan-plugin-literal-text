/**
 * 思源笔记插件 - 转义 v2.8.14
 *
 * v2.8.14 变更：
 *   - 修复集市 issue #1（macOS 上 Cmd+Shift+L 无法关闭/被兜底监听覆盖）：兜底 keydown
 *     监听器不再硬编码 ⇧⌘E/L/V，而是实时读取用户在「设置→快捷键」中的生效绑定
 *     （忠实复刻思源 getKeymapBindings / matchHotKey 语义），仅当用户实际绑定被按下才触发，
 *     尊重用户的改绑/删除；用户清空某命令绑定时兜底不再触发该命令。
 *
 * v2.8.11 变更：
 *   - 精简顶部栏：移除「选区转转义」独立按钮，仅保留 字面文本 / 富粘贴 / 自动转义 三个按钮。
 *   - 精简斜杠菜单：9 项合并为 6 项（字面/转义输入合并、选区字面/转义合并为子菜单、
 *     全半角合并为子菜单）。
 *   - 新增右键/块标菜单入口：选中已转义文本后，右键菜单或块标菜单可直接「反字面」
 *     还原为 Markdown。
 *   - 将 # 的安全替换从行内代码包裹统一为反斜杠 \#，与 * 的 \* 行为完全一致。
 *   - 修复 v3.8.0+ 下 Ctrl+Shift+E/L/V 快捷键可能失效的问题：保留 addCommand 注册并增加
 *     window 级兜底监听器（该监听器在 v2.8.14 起改为读取用户键位配置）。
 *   - 清理非必要调试日志。
 *
 * 功能入口：
 *   Ctrl+Shift+L  字面文本输入弹窗（可在「设置→快捷键」改绑/删除）
 *   Ctrl+Shift+E  自动转义开关
 *   Ctrl+Shift+V  富文本粘贴（自动下载图片）
 *   /字面          斜杠命令
 */


import { Plugin, Dialog, showMessage, getFrontend, getActiveEditor, getAllEditor, Setting, Menu } from "siyuan";

// 常量
const STORAGE_KEY = "escape-config";
const API_COPY = "/api/extension/copy";
const API_INSERT = "/api/block/insertBlock";

/**
 * 安全字符映射
 *
 * * 用反斜杠转义 \*，Lute 正确保留（不渲染为斜体/粗体）；
 * # 在旧版 Lute 下 \# 会被块级扫描器吃掉，故曾用行内代码 `#` 包裹；
 * 但行内代码无法阻止行首标题识别（## 仍被识别为标题标记）。
 * 思源官方编辑指南明确支持 \# 显示字面 #（含行首标题/标签），v3.8.0 起稳定，
 * 故统一改用 \#，使 * 与 # 行为完全一致。
 */
const SAFE_ASTERISK = "\\*";       // 反斜杠转义 * — 对斜体有效
const SAFE_HASH = "\\#";           // 反斜杠转义 # — 与 * 一致，对标题/标签有效

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

/**
 * 全局拦截器槽位：以 document 为单一真相源记录"当前生效的 keydown 拦截器"。
 * 思源插件在启用/禁用、热重载时可能创建新实例而旧实例的 onunload 未被调用，
 * 导致旧的 document 级监听器泄漏；本槽位保证全局至多一个生效拦截器，
 * 新实例启用时先摘除旧拦截器，旧拦截器下次触发时也会自我清除，杜绝泄漏后持续拦截 * #。
 */
const ESC_SLOT = "__literalTextEscapeHandler";
function _getEscSlot(): ((e: any) => void) | null {
  return (document as any)[ESC_SLOT] || null;
}
function _setEscSlot(h: ((e: any) => void) | null) {
  (document as any)[ESC_SLOT] = h;
}

/**
 * 兜底快捷键匹配：忠实移植思源内核 app/src/protyle/util/hotKey.ts 的 matchHotKey
 * 与 app/src/util/keymapBindings.ts 的 getKeymapBindings / normalizeShortcutKey，
 * 以及 compatibility.ts 的 isMac/isNotCtrl/isOnlyMeta、constants.ts 的 KEYCODELIST。
 * 目的：让 window 级兜底监听器与思源自家 dispatchPluginShortcut 用同一套匹配语义，
 * 从而尊重用户在「设置→快捷键」里对插件命令的改绑/删除（集市 issue #1 根因修复）。
 */
const DEFAULT_HOTKEYS: Record<string, string> = {
  quickLiteralInput: "⇧⌘L",
  toggleAutoEscape: "⇧⌘E",
  richPaste: "⇧⌘V",
};

// 平台判断（与思源 compatibility.ts 一致）
const _isMac = (): boolean => navigator.platform.toUpperCase().indexOf("MAC") > -1;
const _isNotCtrl = (event: KeyboardEvent): boolean => !event.metaKey && !event.ctrlKey;
const _isOnlyMeta = (event: KeyboardEvent): boolean =>
  _isMac() ? (event.metaKey && !event.ctrlKey) : (!event.metaKey && event.ctrlKey);

// 键码 → 字符映射（与思源 constants.ts KEYCODELIST 一致）
const KEYCODELIST: { [key: number]: string } = (() => {
  const m: { [key: number]: string } = {};
  for (let i = 1; i <= 32; i++) m[i + 111] = "F" + i; // F1..F32
  const entries: Array<[number, string]> = [
    [8, "⌫"], [9, "⇥"], [13, "↩"], [16, "⇧"], [17, "⌃"], [18, "⌥"], [19, "Pause"],
    [20, "CapsLock"], [27, "Escape"], [32, " "], [33, "PageUp"], [34, "PageDown"],
    [35, "End"], [36, "Home"], [37, "←"], [38, "↑"], [39, "→"], [40, "↓"],
    [44, "PrintScreen"], [45, "Insert"], [46, "⌦"],
  ];
  for (let i = 0; i < 10; i++) entries.push([48 + i, String(i)]);        // 0-9
  for (let c = 65; c <= 90; c++) entries.push([c, String.fromCharCode(c)]); // A-Z
  entries.push([91, "⌘"], [92, "⌘"], [93, "ContextMenu"]);
  for (let i = 0; i < 10; i++) entries.push([96 + i, String(i)]);        // 小键盘 0-9
  entries.push([106, "*"], [107, "+"], [109, "-"], [110, "."], [111, "/"]);
  entries.push([144, "NumLock"], [145, "ScrollLock"], [182, "MyComputer"], [183, "MyCalculator"]);
  entries.push([186, ";"], [187, "="], [188, ","], [189, "-"], [190, "."], [191, "/"], [192, "`"]);
  entries.push([219, "["], [220, "\\"], [221, "]"], [222, "'"]);
  for (const [k, v] of entries) m[k] = v;
  return m;
})();

// 与 keymapBindings.ts 一致：非 mac 且以 ⌃ 开头时归一化（⌃ 在非 mac 不被支持）
const _normalizeShortcutKey = (key: string, mac: boolean): string => {
  if (mac || !key.startsWith("⌃")) return key;
  if (key === "⌃D") return "";
  return key.replace("⌘", "").replace("⌃", "⌘")
    .replace("⌘⇧", "⇧⌘").replace("⌘⌥⇧", "⇥⌘").replace("⌘⌥", "⌥⌘");
};

// 忠实移植 matchHotKey（app/src/protyle/util/hotKey.ts）
const _matchHotKey = (hotKey: string, event: KeyboardEvent): boolean => {
  if (!hotKey) return false;
  hotKey = _normalizeShortcutKey(hotKey, _isMac());
  if (!hotKey) return false;

  if (hotKey.indexOf("⇧") === -1 && hotKey.indexOf("⌘") === -1 &&
      hotKey.indexOf("⌥") === -1 && hotKey.indexOf("⌃") === -1) {
    if (_isNotCtrl(event) && !event.altKey && !event.shiftKey && hotKey === KEYCODELIST[event.keyCode]) return true;
    return false;
  }

  const hotKeys: string[] = [];
  let idx = 0;
  while (idx < hotKey.length && "⌃⌥⇧⌘".includes(hotKey[idx])) {
    hotKeys.push(hotKey[idx]);
    idx++;
  }
  const mainKey = hotKey.slice(idx);
  if (mainKey) hotKeys.push(mainKey);

  if (hotKey.startsWith("⇧") && hotKeys.length === 2) {
    if (_isNotCtrl(event) && !event.altKey && event.shiftKey && hotKeys[1] === KEYCODELIST[event.keyCode]) return true;
    return false;
  }

  if (hotKey.startsWith("⌥")) {
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) keyCode = hotKeys[3];
    const isMatchKey = keyCode === KEYCODELIST[event.keyCode];
    if (isMatchKey && event.altKey && !event.shiftKey && hotKeys.length < 4 &&
        (hotKeys.length === 3 ? (_isOnlyMeta(event) && hotKey.startsWith("⌥⌘")) : _isNotCtrl(event))) return true;
    if (isMatchKey && hotKey.startsWith("⌥⇧⌘") && hotKeys.length === 4 &&
        event.altKey && event.shiftKey && _isOnlyMeta(event)) return true;
    if (isMatchKey && hotKey.startsWith("⌥⇧") && hotKeys.length === 3 &&
        event.altKey && event.shiftKey && _isNotCtrl(event)) return true;
    return false;
  }

  if (hotKey.startsWith("⌃")) {
    if (!_isMac()) return false;
    let keyCode = hotKeys.length === 3 ? hotKeys[2] : hotKeys[1];
    if (hotKeys.length === 4) keyCode = hotKeys[3];
    else if (hotKeys.length === 5) keyCode = hotKeys[4];
    const isMatchKey = keyCode === KEYCODELIST[event.keyCode];
    if (isMatchKey && event.ctrlKey && !event.altKey && !event.shiftKey && hotKeys.length < 4 &&
        (hotKeys.length === 3 ? (event.metaKey && hotKey.startsWith("⌃⌘")) : !event.metaKey)) return true;
    if (isMatchKey && hotKey.startsWith("⌃⇧") && hotKeys.length === 3 &&
        event.ctrlKey && !event.altKey && event.shiftKey && !event.metaKey) return true;
    if (isMatchKey && hotKey.startsWith("⌃⌥") && hotKeys.length === 3 &&
        event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey) return true;
    if (isMatchKey && hotKeys.length === 4 && event.ctrlKey &&
        ((hotKey.startsWith("⌃⌥⇧") && event.shiftKey && !event.metaKey && event.altKey) ||
         (hotKey.startsWith("⌃⌥⌘") && !event.shiftKey && event.metaKey && event.altKey) ||
         (hotKey.startsWith("⌃⇧⌘") && event.shiftKey && event.metaKey && !event.altKey))) return true;
    if (isMatchKey && hotKeys.length === 5 && event.ctrlKey && event.shiftKey && event.metaKey && event.altKey) return true;
    return false;
  }

  // ⇧⌘[] / ⌘[]
  const hasShift = hotKeys.length > 2 && hotKeys[0] === "⇧";
  if (_isOnlyMeta(event) && !event.altKey &&
      ((!hasShift && !event.shiftKey) || (hasShift && event.shiftKey))) {
    return (hasShift ? hotKeys[2] : hotKeys[1]) === KEYCODELIST[event.keyCode];
  }
  return false;
};

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
  _beforeInputHandler!: ((e: any) => void) | null;
  _escapeTopBarBtn!: any;
  /** 卸载标记：onunload 第一时间置真，监听器据此自我清除，防止泄漏后持续拦截 * # */
  _destroyed!: boolean;
  _savedRange!: Range | null;
  _savedBlockId!: string | null;
  _savedProtyle!: any;
  protyleSlash!: any;
  /** addCommand 热键失效时的兜底 keydown 监听器 */
  _fallbackKeydownHandler!: ((e: KeyboardEvent) => void) | null;
  /** 防止 addCommand 与兜底监听器重复触发同一快捷键 */
  _lastHotkeyToggleTime!: number;
  /** 右键/块标菜单事件处理器引用，用于 onunload 注销 */
  _contextMenuHandler!: ((e: any) => void) | null;
  _blockIconMenuHandler!: ((e: any) => void) | null;

  /* ---------- 生命周期 ---------- */
  async onload() {
    /* --- 加载配置 --- */
    this.config = await this.loadData(STORAGE_KEY).catch((err) => {
      console.warn("[转义] 配置加载失败，使用默认值:", err);
      return {};
    }) || {};

    // 默认开启自动转义（用户首次安装即生效）
    this.autoEscapeMode = this.config.autoEscape ?? true;
    this.richPasteEnabled = this.config.richPaste ?? true;
    // 自动转义字符集（默认 * 和 #，与历史行为一致）
    this.escapeChars = Array.isArray(this.config.escapeChars) && this.config.escapeChars.length
      ? this.config.escapeChars.filter((c) => typeof c === "string" && c.length === 1)
      : ["*", "#"];
    // 富粘贴图片保存子目录（assets/ 下，为空则用默认 assets/）
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

    /* --- 0. 注册图标（必须在 addTopBar 之前） --- */
    this.addIcons(ICON_SYMBOLS);

    /* --- 1. 快捷键 --- */
    this.addCommand({
      langKey: "quickLiteralInput",
      langText: "字面文本快速输入",
      hotkey: "⇧⌘L",
      callback: () => { this._lastHotkeyToggleTime = Date.now(); this._handleQuickInput(); },
    });
    this.addCommand({
      langKey: "toggleAutoEscape",
      langText: "切换自动转义",
      hotkey: "⇧⌘E",
      callback: () => { this._lastHotkeyToggleTime = Date.now(); this._toggleAutoEscape(); },
    });
    this.addCommand({
      langKey: "richPaste",
      langText: "富文本粘贴",
      hotkey: "⇧⌘V",
      callback: () => { this._lastHotkeyToggleTime = Date.now(); this._triggerRichPaste(); },
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

    // 兜底：部分环境（v3.8.0+ / 快捷键冲突）下 addCommand 可能不触发，额外在 window 捕获阶段
    // 监听。该监听器会实时读取用户在「设置→快捷键」的生效绑定（v2.8.14 起），仅当用户实际
    // 绑定被按下才触发，尊重改绑/删除；用 150ms 防抖避免与 addCommand 重复执行。
    this._registerFallbackHotkeys();

    /* --- 1.5 右键/块标菜单入口 --- */
    this._setupContextMenus();

    /* --- 2. 斜杠命令（精简后 6 项：字面/转义输入合并、选区转字面合并、全半角合并） --- */
    this.protyleSlash = [
      {
        filter: ["字面文本", "转义文本", "literal", "escape", "zmbw", "zywb"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">字面/转义文本输入</span><span class="b3-list-item__meta">*# 不被渲染</span></div>',
        id: "literal-escape-input",
        callback: (protyle) => this._showLiteralDialog("code", protyle),
      },
      {
        filter: ["富文本粘贴", "rich paste", "fwbzt"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">富文本粘贴</span><span class="b3-list-item__meta">自动下载图片</span></div>',
        id: "rich-paste",
        callback: (protyle) => this._triggerRichPaste(protyle),
      },
      {
        filter: ["选区转字面", "selection literal", "xqzmb", "xqzzy"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">选区转字面</span><span class="b3-list-item__meta">选中文本→行内代码/转义</span></div>',
        id: "selection-literal",
        callback: () => this._openSelectionModeMenu(),
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
        filter: ["全半角", "width", "qjzhb", "bjzqj"],
        html: '<div class="b3-list-item__first"><span class="b3-list-item__text">全半角切换</span><span class="b3-list-item__meta">１．５⇄1.5</span></div>',
        id: "width-toggle",
        callback: () => this._openWidthModeMenu(),
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
    } catch (e: any) {
      console.warn("[转义] 顶栏按钮注册失败（移动端可能不支持）:", e.message);
    }
  }

  onunload() {
    // 第一时间置标记：即使后续清理因异常中断，泄漏的监听器也会在下次按键时自我清除
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
  _isInProtyle(e: any): boolean {
    const target = e.target;
    if (!target) return false;
    if (typeof target.closest !== "function") return false;
    if (!target.closest(".protyle-wysiwyg")) return false;
    // 代码块 / 行内代码内不打断：里面本就是字面量
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
  _getKeymapItem(langKey: string): any {
    const pluginKm = (window as any).siyuan?.config?.keymap?.plugin;
    if (!pluginKm || typeof pluginKm !== "object") return undefined;
    const candidates = [
      this.name,
      "siyuan-plugin-" + this.name,
      this.name.replace(/^siyuan-plugin-/, ""),
    ];
    for (const key of candidates) {
      const item = pluginKm[key] && pluginKm[key][langKey];
      if (item && typeof item.custom === "string") return item;
    }
    // 兜底：扫描所有插件条目按 langKey 唯一匹配（防御插件名前缀不一致）
    for (const pk of Object.keys(pluginKm)) {
      const item = pluginKm[pk] && pluginKm[pk][langKey];
      if (item && typeof item.custom === "string") return item;
    }
    return undefined;
  }

  /**
   * 返回某命令当前生效的快捷键字符串数组（忠实复刻 keymapBindings.getKeymapBindings）：
   * - item 完全缺失（配置未就绪）→ 回退默认热键
   * - 有 bindings(version===1, keys 数组) → 去重后的 keys
   * - 无 bindings 且 custom 非空 → [custom]
   * - custom 为空串 → []（用户已清空绑定，视为未绑定，兜底不应触发）
   */
  _getEffectiveHotkeys(langKey: string): string[] {
    const item = this._getKeymapItem(langKey);
    if (!item) return DEFAULT_HOTKEYS[langKey] ? [DEFAULT_HOTKEYS[langKey]] : [];
    if (item.bindings) {
      if (item.bindings.version !== 1 || !Array.isArray(item.bindings.keys)) return [];
      return [...new Set((item.bindings.keys as any[]).filter((k: any) => typeof k === "string" && k.length > 0))] as string[];
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
    const handler = (e: KeyboardEvent) => {
      if (this._destroyed) return;

      const commands: Array<{ langKey: string; action: () => void }> = [
        { langKey: "quickLiteralInput", action: () => this._handleQuickInput() },
        { langKey: "toggleAutoEscape", action: () => this._toggleAutoEscape() },
        { langKey: "richPaste", action: () => this._triggerRichPaste() },
      ];

      let matched: (() => void) | null = null;
      for (const cmd of commands) {
        const hotkeys = this._getEffectiveHotkeys(cmd.langKey);
        if (hotkeys.some((hk) => _matchHotKey(hk, e))) {
          matched = cmd.action;
          break;
        }
      }
      if (!matched) return;

      // 防抖：若 addCommand 已触发同一动作，忽略 150ms 内的重复调用
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
    this._contextMenuHandler = (event: any) => this._onOpenMenuContent(event.detail);
    this._blockIconMenuHandler = (event: any) => this._onOpenMenuContent(event.detail);
    this.eventBus.on("open-menu-content", this._contextMenuHandler);
    this.eventBus.on("click-blockicon", this._blockIconMenuHandler);
  }

  _onOpenMenuContent(detail: any) {
    if (!detail?.menu || typeof detail.menu.addItem !== "function") return;
    const sel = window.getSelection();
    const hasSelection = sel ? !sel.isCollapsed : false;
    detail.menu.addItem({
      label: "反字面（还原为 Markdown）",
      disabled: !hasSelection,
      click: () => {
        if (hasSelection) this._unescapeSelection();
      },
    });
  }

  _openSelectionModeMenu() {
    const menu = new Menu("literal-selection-mode");
    menu.addItem({
      label: "转成行内代码",
      click: () => { menu.close(); this._selectionToLiteral("code"); },
    });
    menu.addItem({
      label: "转成反斜杠转义",
      click: () => { menu.close(); this._selectionToLiteral("escape"); },
    });
    const rect = this._getSelectionRect();
    menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
  }

  _openWidthModeMenu() {
    const menu = new Menu("literal-width-mode");
    menu.addItem({
      label: "全角转半角",
      click: () => { menu.close(); this._convertWidth("toHalf"); },
    });
    menu.addItem({
      label: "半角转全角",
      click: () => { menu.close(); this._convertWidth("toFull"); },
    });
    const rect = this._getSelectionRect();
    menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
  }

  _getSelectionRect(): any {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return rect;
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      left: cx, top: cy, bottom: cy, right: cx,
      x: cx, y: cy, width: 0, height: 0,
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
    } catch (err: any) {
      console.error("[转义] 配置保存失败:", err);
      showMessage("保存失败：" + (err?.message || String(err)), 5000, "error");
      return false;
    }
  }

  /** 更新顶栏转义按钮状态（同步 tooltip 的 aria-label） */
  _updateEscapeButton() {
    if (!this._escapeTopBarBtn) return;
    try {
      const title = this.autoEscapeMode
        ? "自动转义：已开启（点击或 Ctrl+Shift+E 关闭）"
        : "自动转义：已关闭（点击或 Ctrl+Shift+E 开启）";
      // 同步 .title（兜底）和 aria-label（思源桌面端 tooltip 实际读取的属性）
      this._escapeTopBarBtn.title = title;
      this._escapeTopBarBtn.setAttribute("aria-label", title);
      // 移动端：同步 b3-menu__label 文本
      const menuLabel = this._escapeTopBarBtn.querySelector(".b3-menu__label");
      if (menuLabel) {
        menuLabel.textContent = title;
      }

      const svg = this._escapeTopBarBtn.querySelector("svg");
      const use = this._escapeTopBarBtn.querySelector("use");
      if (use && svg) {
        const newId = this.autoEscapeMode ? ICON_ESCAPE_ON_ID : ICON_ESCAPE_OFF_ID;
        use.setAttribute("href", "#" + newId);
        svg.style.color = this.autoEscapeMode
          ? "var(--b3-theme-primary)"
          : "var(--b3-empty-color)";
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

  /** 按字符返回其"安全替换"形式：*→\*，#→\#（反斜杠转义），其它→\X 反斜杠前缀 */
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

  /**
   * 转义重插入：优先用 protyle 官方 insert()（走思源输入管线，lite protyle 下最可靠），
   * 仅在拿不到 protyle 实例时回退 document.execCommand("insertText")。
   */
  _insertTextSync(text) {
    const p = this._getActiveProtyle();
    if (p && typeof p.insert === "function") {
      try { p.insert(text); return true; } catch (e: any) {
        console.warn("[转义] protyle.insert 失败，回退 execCommand:", e.message);
      }
    }
    try { if (document.execCommand("insertText", false, text)) return true; } catch (e: any) {}
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
      showMessage("自动转义已开启：*→\*  #→\#", 2500, "info");
    } else {
      this._disableAutoEscape();
      showMessage("自动转义已关闭", 2000, "info");
    }
  }

  _enableAutoEscape() {
    /**
     * # 字符自动转义：采用 \# 反斜杠方案，与 * 行为一致。
     * 思源官方编辑指南确认 \# 可显示字面 #（含行首标题/标签），v3.8.0 起稳定。
     */
    const handler = (e: any) => {
      // 自我清除：若插件已卸载（onunload 置位）或本监听器已不是当前生效拦截器
      // （被新实例取代，见 ESC_SLOT），则从文档摘除自身并不再拦截，
      // 防止泄漏后持续阻断 markdown 的 * # 输入。
      // 注意：不再依赖顶栏按钮 isConnected 判断存活——v3.7.3 顶栏 DOM 重建会让
      // 该判断误触发，导致拦截器在首次按键时被静默移除、转义失效。
      if (this._destroyed || _getEscSlot() !== handler) {
        document.removeEventListener("keydown", handler, true);
        if (_getEscSlot() === handler) _setEscSlot(null);
        this._escapeHandler = null;
        return;
      }
      // 输入法合成中（中文/日文等）不拦截，避免干扰正常输入
      if (e.isComposing || e.key === "Process") return;
      if (!this.autoEscapeMode) return;
      if (!this._isInProtyle(e)) return;
      if (!this.escapeChars.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      const safeChar = this._safeCharFor(e.key);
      this._insertTextSync(safeChar);
    };

    // beforeinput 兜底：思源 v3.7.3+ 可能在 keydown 阶段阻止插件监听器，
    // 而在文本实际插入前的 beforeinput 事件更接近输入真相，作为第二道防线。
    const beforeInputHandler = (e: any) => {
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

    // 先摘除任何先前注册的拦截器（含其它实例泄漏的），保证全局唯一
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
      confirmCallback: async () => {
        const ok = await this._saveConfig();
        if (ok) showMessage("已保存", 2000, "info");
      },
    });

    this.setting.addItem({
      title: "自动转义",
      description: "开启后输入 * # _ 等会被自动保护（* -> \*，# -> \#）。代码块内不受影响。",
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
      description: "默认 * 和 #。# 用反斜杠转义（\\#），与 * 行为一致；其它用反斜杠前缀。",
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
