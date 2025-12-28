/**
 * @file Enhancer 4 Google - Gemini Content Script
 * @description GeminiのUI改善（ショートカット、Enterキー、幅調整、Gem検索、入力拡大エディタ）を行うコンテンツスクリプトです。
 */

// 設定値
let settings = {
  geminiToolShortcuts: true,
  geminiEnterKey: true,
  geminiLayoutWidthEnabled: false,
  geminiLayoutWidthValue: 1200,
  submitKeyModifier: 'shift',
  enableGemManagerSearch: true,
  geminiExpandInput: true
};

// SVGアイコン定義 (Material Symbols)
const EDITOR_ICONS = {
  format_bold: '<path d="M15.6 11.81C16.5 11.05 17 10.05 17 9C17 6.24 14.76 4 12 4H7V20H12.6C15.03 20 17 17.97 17 15.6C17 13.9 16.5 12.65 15.6 11.81ZM10 6.5H11.8C13.18 6.5 14.3 7.62 14.3 9C14.3 10.38 13.18 11.5 11.8 11.5H10V6.5ZM12.2 17.5H10V13.5H12.2C13.58 13.5 14.7 14.62 14.7 16C14.7 17.38 13.58 17.5 12.2 17.5Z" />',
  format_italic: '<path d="M10 4V7H12.21L8.79 17H6V20H14V17H11.79L15.21 7H18V4H10Z" />',
  format_list_bulleted: '<path d="M4 10.5C3.17 10.5 2.5 11.17 2.5 12C2.5 12.83 3.17 13.5 4 13.5C4.83 13.5 5.5 12.83 5.5 12C5.5 11.17 4.83 10.5 4 10.5ZM4 4.5C3.17 4.5 2.5 5.17 2.5 6C2.5 6.83 3.17 7.5 4 7.5C4.83 7.5 5.5 6.83 5.5 6C5.5 5.17 4.83 4.5 4 4.5ZM4 16.5C3.17 16.5 2.5 17.17 2.5 18C2.5 18.83 3.17 19.5 4 19.5C4.83 19.5 5.5 18.83 5.5 18C5.5 17.17 4.83 16.5 4 16.5ZM7 19H22V17H7V19ZM7 13H22V11H7V13ZM7 5V7H22V5H7Z" />',
  format_list_numbered: '<path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>',
  check_box: '<path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" />',
  code: '<path d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z" />',
  table_chart: '<path d="M10 10.02H5V21H10V10.02ZM17 21H12V10.02H17V21ZM22 10.02H19V21H22V10.02ZM20 3H5C3.9 3 3 3.9 3 5V8H22V5C22 3.9 21.1 3 20 3Z" />',
  visibility: '<path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" />'
};

/**
 * 設定の読み込みと適用
 */
function loadSettings() {
  chrome.storage.sync.get({
    geminiToolShortcuts: true,
    geminiEnterKey: true,
    geminiLayoutWidthEnabled: false,
    geminiLayoutWidthValue: 1200,
    submitKeyModifier: 'shift',
    enableGemManagerSearch: true,
    geminiExpandInput: true
  }, (items) => {
    settings = items;
    applyCustomContentWidth();
    // 初回ロード時にGemマネージャー画面なら検索バーを表示
    if (settings.enableGemManagerSearch) {
      initGemManagerSearch();
    }
    if (settings.geminiExpandInput) {
      tryInjectExpandButtons();
    }
  });
}

/**
 * 設定変更監視とリアルタイム反映
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  
  if (changes.geminiToolShortcuts) {
    settings.geminiToolShortcuts = changes.geminiToolShortcuts.newValue;
    if (settings.geminiToolShortcuts === false) removeToolShortcuts();
  }
  
  if (changes.geminiEnterKey) {
    settings.geminiEnterKey = changes.geminiEnterKey.newValue;
    if (settings.geminiEnterKey === false) {
      document.querySelectorAll('[data-enter-hijacked="true"]').forEach(removeEnterKeyHijack);
    }
  }
  
  if (changes.geminiLayoutWidthEnabled || changes.geminiLayoutWidthValue) {
    if (changes.geminiLayoutWidthEnabled) settings.geminiLayoutWidthEnabled = changes.geminiLayoutWidthEnabled.newValue;
    if (changes.geminiLayoutWidthValue) settings.geminiLayoutWidthValue = changes.geminiLayoutWidthValue.newValue;
    applyCustomContentWidth();
  }

  if (changes.enableGemManagerSearch) {
    settings.enableGemManagerSearch = changes.enableGemManagerSearch.newValue;
    if (settings.enableGemManagerSearch) {
      initGemManagerSearch();
    } else {
      // OFF時は検索ボックスを削除
      const searchBox = document.getElementById('enhancer-gem-manager-search');
      if (searchBox) searchBox.parentElement.remove();
      updateSectionVisibility();
    }
  }

  if (changes.geminiExpandInput) {
    settings.geminiExpandInput = changes.geminiExpandInput.newValue;
    if (settings.geminiExpandInput) {
      tryInjectExpandButtons();
    } else {
      document.querySelectorAll('.enhancer-expand-btn').forEach(btn => btn.remove());
    }
  }
});

loadSettings();

// --- 定数・セレクタ定義 ---
const PROMPT_AREA_SELECTOR = 'input-area-v2';
const TEXT_AREA_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
const EDIT_TEXT_AREA_SELECTOR = 'textarea[cdktextareaautosize][enterkeyhint="send"]';
const INJECTION_TARGET_SELECTOR = '.leading-actions-wrapper';
const TOOL_MENU_SELECTOR = 'mat-card.toolbox-drawer-card';
const SUBMIT_BUTTON_SELECTOR = 'button.send-button.submit:not([disabled])';
const EDIT_SUBMIT_BUTTON_SELECTOR = 'button.update-button:not([disabled])';
const PROMPT_CONTAINER_SELECTOR = '.input-area-container';
const CHAT_HISTORY_CONTAINER_SELECTOR = '.conversation-container';
const HISTORY_USER_QUERY_SELECTOR = 'user-query';
const HISTORY_MODEL_RESPONSE_SELECTOR = 'model-response';
const USER_BUBBLE_BACKGROUND_SELECTOR = '.user-query-bubble-with-background:not(.edit-mode)';
const CUSTOM_WIDTH_STYLE_ID = 'gemini-content-width-style';

const TOOLS_TO_INJECT = [
  { id: 'deep-research', label: 'Deep Research', icon: 'travel_explore', iconSelector: 'mat-icon[fonticon="travel_explore"]' },
  { id: 'canvas', label: 'Canvas', icon: 'note_stack_add', iconSelector: 'mat-icon[fonticon="note_stack_add"]' }
];

// --- ツールショートカット機能 ---

function activateTool(toolIconSelector, toolIcon) {
  const inactiveToolButton = document.querySelector('button.toolbox-drawer-button-with-label');
  if (inactiveToolButton) {
    inactiveToolButton.click();
    waitForMenuAndClick(toolIconSelector);
  } else {
    // 既に他のツールが開いている場合の切り替え処理
    const activeToolChip = document.querySelector('button.toolbox-drawer-item-deselect-button');
    if (!activeToolChip) return;
    
    const activeIcon = activeToolChip.querySelector(`mat-icon[fonticon="${toolIcon}"]`);
    if (activeIcon) return; // 既に選択中なら何もしない
    
    const deactivateObserver = new MutationObserver((mutations, obs) => {
      const newInactiveButton = document.querySelector('button.toolbox-drawer-button-with-label');
      if (newInactiveButton) {
        obs.disconnect();
        newInactiveButton.click();
        waitForMenuAndClick(toolIconSelector);
      }
    });
    const toolboxDrawer = document.querySelector('toolbox-drawer');
    if(toolboxDrawer) deactivateObserver.observe(toolboxDrawer, { childList: true, subtree: true });
    activeToolChip.click();
  }
}

function waitForMenuAndClick(toolIconSelector) {
  const observer = new MutationObserver((mutations, obs) => {
    const toolMenu = document.querySelector(TOOL_MENU_SELECTOR);
    if (toolMenu) {
      const toolIconEl = toolMenu.querySelector(toolIconSelector);
      if (toolIconEl) {
        const toolButton = toolIconEl.closest('button.mat-mdc-list-item');
        if (toolButton) toolButton.click();
      }
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function injectToolShortcuts(targetWrapper, referenceNode) {
  const fragment = document.createDocumentFragment();
  TOOLS_TO_INJECT.forEach(tool => {
    const button = document.createElement('button');
    button.className = 'mdc-button mat-mdc-button-base mat-unthemed enhancer-shortcut-button';
    button.dataset.toolIcon = tool.icon;
    
    const icon = document.createElement('mat-icon');
    icon.setAttribute('role', 'img');
    icon.setAttribute('fonticon', tool.icon);
    icon.className = 'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color';
    
    const label = document.createElement('span');
    label.className = 'mdc-button__label';
    label.textContent = tool.label; 
    
    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activateTool(tool.iconSelector, tool.icon);
    });
    fragment.appendChild(button);
  });
  
  if (referenceNode) {
    targetWrapper.insertBefore(fragment, referenceNode);
  } else {
    targetWrapper.appendChild(fragment); 
  }
  injectGeminiStyles();
}

function updateAllShortcutVisibility() {
  const currentURL = window.location.href;
  let showDeepResearch = false;
  let showCanvas = false;

  // URLに応じたボタンの表示制御
  if (currentURL.includes('/gems/edit')) {
    showDeepResearch = false;
    showCanvas = false;
  } else {
    const toolButton = document.querySelector('toolbox-drawer');
    if (toolButton) {
      if (currentURL.includes('/gem/')) {
        showDeepResearch = false;
        showCanvas = true;
      } else {
        showDeepResearch = true;
        showCanvas = true;
      }
    } else {
      showDeepResearch = false;
      showCanvas = false;
    }
  }

  const activeToolChip = document.querySelector('button.toolbox-drawer-item-deselect-button');
  let activeIconName = null;
  if (activeToolChip) {
    const iconEl = activeToolChip.querySelector('mat-icon[fonticon]');
    if (iconEl) activeIconName = iconEl.getAttribute('fonticon');
  }

  TOOLS_TO_INJECT.forEach(tool => {
    const shortcutButton = document.querySelector(`.enhancer-shortcut-button[data-tool-icon="${tool.icon}"]`);
    if (!shortcutButton) return;
    
    let isVisible = false;
    if (tool.id === 'deep-research' && showDeepResearch) isVisible = true;
    if (tool.id === 'canvas' && showCanvas) isVisible = true;
    if (tool.icon === activeIconName) isVisible = false; // 選択中は非表示
    
    shortcutButton.style.display = isVisible ? 'inline-flex' : 'none';
  });
}

function removeToolShortcuts() {
    document.querySelectorAll('.enhancer-shortcut-button').forEach(button => {
        button.remove();
    });
}

function injectGeminiStyles() {
  const STYLE_ID = 'notebooklm-enhancer-gemini-styles';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .enhancer-shortcut-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      position: relative;
      padding: 0 12px 0 8px;
      min-width: 64px;
      height: 40px;
      border: none;
      border-radius: 999px;
      background-color: transparent;
      color: var(--mat-sys-color-on-surface-variant);
      cursor: pointer;
      font-family: "Google Sans", sans-serif;
      font-size: 14px;
      font-weight: 500;
      margin-left: 4px;
      margin-right: 4px;
    }
    .enhancer-shortcut-button:hover {
      background-color: var(--mat-sys-color-surface-container-low-hover);
    }
    .enhancer-shortcut-button mat-icon {
      margin-right: 6px;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .enhancer-shortcut-button .mdc-button__label {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }

    .enhancer-input-container {
      position: relative !important; /* 親要素の基準化を強制 */
    }
    .enhancer-expand-btn {
      position: absolute;
      right: 12px; /* 少し内側に */
      top: 12px;
      z-index: 999; /* 他の要素より手前に */
      width: 32px;
      height: 32px;
      background: var(--gem-sys-color-surface-container-high, #f0f4f9); /* 背景色をつけて目立たせる */
      border: 1px solid var(--gem-sys-color-outline-variant, #ccc);
      border-radius: 4px;
      cursor: pointer;
      color: var(--gem-sys-color-on-surface, #444746);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: all 0.2s;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .enhancer-expand-btn:hover {
      opacity: 1;
      background-color: var(--gem-sys-color-surface-container-highest, #e1e3e1);
      transform: scale(1.05);
    }

    /* モーダルオーバーレイ */
    .enhancer-editor-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.6); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(2px);
    }
    .enhancer-editor-card {
      background: var(--gem-sys-color-surface, #fff);
      width: 80vw; max-width: 1100px; height: 80vh;
      border-radius: 16px; display: flex; flex-direction: column;
      box-shadow: 0 12px 32px rgba(0,0,0,0.2);
      animation: enhancer-pop-in 0.2s cubic-bezier(0.2, 0, 0.2, 1);
    }
    @keyframes enhancer-pop-in {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .enhancer-editor-header {
      padding: 12px 24px; border-bottom: 1px solid var(--gem-sys-color-outline-variant, #e0e0e0);
      display: flex; justify-content: space-between; align-items: center;
      font-weight: bold; color: var(--gem-sys-color-on-surface, #1f1f1f);
      background: var(--gem-sys-color-surface-container-high, #f9f9f9);
      border-radius: 16px 16px 0 0;
    }
    .enhancer-editor-body {
      flex: 1; padding: 0; display: flex; flex-direction: column;
      position: relative; overflow: hidden;
    }
    
    /* ツールバー */
    .enhancer-editor-toolbar {
      display: flex; gap: 8px; padding: 8px 16px;
      border-bottom: 1px solid var(--gem-sys-color-outline-variant, #e0e0e0);
      background: var(--gem-sys-color-surface, #fff);
      overflow-x: auto;
    }
    .enhancer-toolbar-btn {
      background: transparent; border: 1px solid transparent; cursor: pointer;
      padding: 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
      color: var(--gem-sys-color-on-surface-variant, #444746);
      transition: background 0.2s;
      min-width: 32px;
    }
    .enhancer-toolbar-btn:hover {
      background: var(--gem-sys-color-surface-container-high, #f0f4f9);
      color: var(--gem-sys-color-primary, #0b57d0);
    }
    .enhancer-toolbar-btn.text-icon {
      font-weight: 700;
      font-size: 14px;
      width: auto;
      padding: 6px 8px;
    }
    .enhancer-separator {
      width: 1px; height: 20px; background: #ccc; margin: 0 4px;
    }
    
/* エディタエリア & プレビューエリア */
    .enhancer-editor-textarea {
      flex: 1; width: 100%; height: 100%; resize: none; border: none; outline: none;
      font-family: "Google Sans Mono", "Roboto Mono", monospace;
      font-size: 14px; line-height: 1.6; color: var(--gem-sys-color-on-surface, #1f1f1f);
      background: transparent; padding: 16px; box-sizing: border-box;
    }
    .enhancer-preview-area {
      flex: 1; width: 100%; height: 100%; padding: 16px; box-sizing: border-box;
      overflow-y: auto; display: none; background: #fff;
      font-family: "Google Sans", sans-serif; font-size: 15px; line-height: 1.6;
    }
    .enhancer-preview-area.active { display: block; }
    
    /* プレビュースタイル */
    .enhancer-preview-area h1 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; margin-top: 0; }
    .enhancer-preview-area h2 { font-size: 1.3em; margin-top: 1em; }
    .enhancer-preview-area h3 { font-size: 1.1em; margin-top: 1em; }
    .enhancer-preview-area pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .enhancer-preview-area code { font-family: monospace; background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
    .enhancer-preview-area blockquote { border-left: 4px solid #ddd; padding-left: 12px; color: #666; margin: 0; }
    .enhancer-preview-area ul, .enhancer-preview-area ol { padding-left: 24px !important; margin: 1em 0 !important; }
    .enhancer-preview-area ul { list-style-type: disc !important; }
    .enhancer-preview-area ol { list-style-type: decimal !important; }
    .enhancer-preview-area ul ul, .enhancer-preview-area ol ul { list-style-type: circle !important; }
    .enhancer-preview-area ol ol, .enhancer-preview-area ul ol { list-style-type: lower-alpha !important; }
    .enhancer-preview-area table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    .enhancer-preview-area th, .enhancer-preview-area td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .enhancer-preview-area th { background-color: #f2f2f2; font-weight: bold; }

    /* ダイアログスタイル */
    .enhancer-dialog-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(255,255,255,0.8); z-index: 10;
      display: flex; align-items: center; justify-content: center;
      border-radius: 0 0 16px 16px;
    }
    .enhancer-dialog {
      background: #fff; padding: 20px; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e0e0e0;
      width: 280px; text-align: left;
    }
    .enhancer-dialog h3 { margin: 0 0 12px 0; font-size: 16px; color: #333; }
    .enhancer-dialog-row { margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
    .enhancer-dialog-row label { flex: 1; font-size: 13px; color: #555; }
    .enhancer-dialog-row input { width: 60px; padding: 4px; border: 1px solid #ccc; border-radius: 4px; }
    .enhancer-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .enhancer-dialog-btn {
        padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; border: none;
    }
    .enhancer-dialog-btn.primary { background: #1a73e8; color: #fff; }
    .enhancer-dialog-btn.secondary { background: #f1f3f4; color: #333; }

    .enhancer-editor-footer {
      padding: 16px 24px; border-top: 1px solid var(--gem-sys-color-outline-variant, #e0e0e0);
      display: flex; justify-content: flex-end; gap: 12px;
      background: var(--gem-sys-color-surface, #fff);
      border-radius: 0 0 16px 16px;
    }
    .enhancer-btn-primary {
      background: var(--gem-sys-color-primary, #1a73e8); color: white;
      border: none; padding: 8px 24px; border-radius: 18px; cursor: pointer; font-weight: 500;
    }
    .enhancer-btn-secondary {
      background: transparent; color: var(--gem-sys-color-primary, #1a73e8);
      border: 1px solid var(--gem-sys-color-outline, #747775);
      padding: 8px 24px; border-radius: 18px; cursor: pointer; font-weight: 500;
    }
  `;
  document.head.appendChild(style);
}

// --- Enterキー動作変更機能 ---

const handleKeyDown = (event) => {
  if (settings.geminiEnterKey === false) return;
  if (event.key !== 'Enter') return;
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  let isSubmitModifierPressed = false;

  if (settings.submitKeyModifier === 'ctrl') {
    isSubmitModifierPressed = isMac ? event.metaKey : event.ctrlKey;
  } else {
    isSubmitModifierPressed = event.shiftKey;
  }

  if (isSubmitModifierPressed) {
    event.preventDefault();
    event.stopImmediatePropagation();
    let submitButton = document.querySelector(EDIT_SUBMIT_BUTTON_SELECTOR);
    if (!submitButton) submitButton = document.querySelector(SUBMIT_BUTTON_SELECTOR);
    if (submitButton) submitButton.click();
  } else {
    // 改行を許可 (デフォルト動作) だが、イベント伝播を止めてGeminiの送信ロジックを防ぐ
    event.stopImmediatePropagation(); 
  }
};

function attachEnterKeyHijack(textAreaElement) {
  if (!textAreaElement || textAreaElement.dataset.enterHijacked === 'true') return;
  textAreaElement.addEventListener('keydown', handleKeyDown, true);
  textAreaElement.dataset.enterHijacked = 'true';
}

function removeEnterKeyHijack(textAreaElement) {
  if (textAreaElement && textAreaElement.dataset.enterHijacked === 'true') {
    textAreaElement.removeEventListener('keydown', handleKeyDown, true);
    textAreaElement.dataset.enterHijacked = 'false';
  }
}

// --- 幅カスタマイズ機能 ---

function applyCustomContentWidth() {
  const styleId = CUSTOM_WIDTH_STYLE_ID;
  let styleTag = document.getElementById(styleId);

  if (settings.geminiLayoutWidthEnabled) {
    const width = parseInt(settings.geminiLayoutWidthValue, 10);
    if (isNaN(width) || width <= 760) {
      if (styleTag) styleTag.remove();
      return;
    }
    const bubbleWidth = width - 284; // サイドパネル等の幅を考慮
    const cssText = `
      ${PROMPT_CONTAINER_SELECTOR}, ${CHAT_HISTORY_CONTAINER_SELECTOR}, 
      ${HISTORY_USER_QUERY_SELECTOR}, ${HISTORY_MODEL_RESPONSE_SELECTOR} { max-width: ${width}px !important; }
      ${USER_BUBBLE_BACKGROUND_SELECTOR} { max-width: calc(${bubbleWidth}px - var(--gem-sys-spacing--m) * 2) !important; }
    `;

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    if (styleTag.textContent !== cssText) styleTag.textContent = cssText;

  } else {
    if (styleTag) styleTag.remove();
  }
}

// --- Gemマネージャー検索機能 ---

function initGemManagerSearch() {
  if (!settings.enableGemManagerSearch) return;
  if (!location.href.includes('/gems/view')) return;
  if (document.getElementById('enhancer-gem-manager-search')) return;

  const headerTitle = document.querySelector('h1.gds-headline-m');
  if (!headerTitle) return;

  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `
    margin: 16px 0 24px 0;
    position: relative;
    max-width: 760px;
  `;

  // 虫眼鏡アイコン (SVG)
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    pointer-events: none;
  `;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("height", "24");
  svg.setAttribute("width", "24");
  svg.style.fill = "var(--gem-sys-color-on-surface-variant, #444746)";
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z");
  svg.appendChild(path);
  iconWrapper.appendChild(svg);

  const searchInput = document.createElement('input');
  searchInput.id = 'enhancer-gem-manager-search';
  searchInput.type = 'text';
  searchInput.placeholder = 'Gem を検索 (名前、説明文)...';
  searchInput.style.cssText = `
    width: 100%;
    height: 48px;
    padding: 0 16px 0 52px;
    border-radius: 24px;
    border: 1px solid var(--gem-sys-color-outline, #747775);
    background-color: var(--gem-sys-color-surface-container-high, #f0f4f9);
    color: var(--gem-sys-color-on-surface, #1f1f1f);
    font-family: "Google Sans", Roboto, sans-serif;
    font-size: 16px;
    outline: none;
    transition: all 0.2s ease;
  `;

  // フォーカス時のスタイル調整
  searchInput.addEventListener('focus', () => {
    searchInput.style.backgroundColor = 'var(--gem-sys-color-surface, #fff)';
    searchInput.style.boxShadow = '0 1px 6px rgba(32, 33, 36, 0.28)';
    searchInput.style.borderColor = 'transparent';
  });
  searchInput.addEventListener('blur', () => {
    searchInput.style.backgroundColor = 'var(--gem-sys-color-surface-container-high, #f0f4f9)';
    searchInput.style.boxShadow = 'none';
    searchInput.style.borderColor = 'var(--gem-sys-color-outline, #747775)';
  });

  searchContainer.appendChild(iconWrapper);
  searchContainer.appendChild(searchInput);

  headerTitle.parentElement.insertBefore(searchContainer, headerTitle.nextSibling);

  searchInput.addEventListener('input', (e) => {
    executeGemSearch(e.target.value);
  });
}

function executeGemSearch(query) {
  const term = query.trim().toLowerCase();

  // カード形式のGem (Google製)
  const premadeCards = document.querySelectorAll('template-gallery-card');
  premadeCards.forEach(card => {
    const title = card.querySelector('.template-gallery-card-title')?.textContent || '';
    const desc = card.querySelector('.template-gallery-card-content')?.textContent || '';
    const match = title.toLowerCase().includes(term) || desc.toLowerCase().includes(term);
    card.style.display = match ? '' : 'none';
  });

  // リスト形式のGem (マイGem)
  const botRows = document.querySelectorAll('bot-list-row');
  botRows.forEach(row => {
    const titleEl = row.querySelector('.bot-title .title') || row.querySelector('.bot-title');
    const title = titleEl?.textContent || '';
    const desc = row.querySelector('.bot-desc')?.textContent || '';
    const match = title.toLowerCase().includes(term) || desc.toLowerCase().includes(term);
    row.style.display = match ? '' : 'none';
  });

  updateSectionVisibility();
}

/**
 * 検索結果が0件のセクションを非表示にする
 */
function updateSectionVisibility() {
  // 検索ボックスがない(機能OFF)なら全表示
  if (!document.getElementById('enhancer-gem-manager-search')) {
    document.querySelectorAll('.premade-gems, .bot-list-container, .list-header').forEach(el => {
      el.style.display = '';
    });
    document.querySelectorAll('template-gallery-card, bot-list-row').forEach(el => {
      el.style.display = '';
    });
    return;
  }

  const premadeSection = document.querySelector('.premade-gems');
  if (premadeSection) {
    const visibleCards = premadeSection.querySelectorAll('template-gallery-card:not([style*="display: none"])');
    premadeSection.style.display = (visibleCards.length > 0) ? '' : 'none';
  }

  const listContainers = document.querySelectorAll('.bot-list-container');
  listContainers.forEach(container => {
    const visibleRows = container.querySelectorAll('bot-list-row:not([style*="display: none"])');
    const isVisible = visibleRows.length > 0;
    container.style.display = isVisible ? '' : 'none';

    // 直前のヘッダー (h2) も連動して隠す
    let prev = container.previousElementSibling;
    while (prev && !prev.classList.contains('list-header')) {
      prev = prev.previousElementSibling;
    }
    if (prev && prev.classList.contains('list-header')) {
      prev.style.display = isVisible ? '' : 'none';
    }
  });
}

/**
 * ページ内のtextareaまたはリッチテキスト入力欄を探して拡大ボタンを注入する
 */
function tryInjectExpandButtons() {
  if (!settings.geminiExpandInput) return;
  if (!location.href.includes('/gems/')) return;

  injectGeminiStyles();

  const target = document.querySelector('div.ql-editor.textarea');
  
  // 既にボタンがあるか、非表示の要素は無視
  if (target.dataset.hasExpandBtn === 'true') return;
  if (target.offsetParent === null) return;

  // ★修正: ボタンを注入するコンテナを決定
  // エディタ内部(rich-textarea)に入れると高さ計算バグの原因になるため、
  // その外側の '.instructions-input-container' を優先的に探して親とする。
  let container = target.closest('.instructions-input-container');
  
  // 見つからない場合は従来の親要素(ただしリスクあり)へフォールバック
  if (!container) {
      container = target.parentElement;
  }

  if (!container) return;

  // コンテナ内に既にボタンがないか確認
  if (container.querySelector('.enhancer-expand-btn')) {
      target.dataset.hasExpandBtn = 'true';
      return;
  }

  // 親要素のスタイルを調整 (ボタンの絶対配置のため)
  if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
  }
  container.classList.add('enhancer-input-container');

  const btn = document.createElement('button');
  btn.className = 'enhancer-expand-btn';
  btn.type = 'button';
  btn.title = chrome.i18n.getMessage("btnExpandEdit");
  
  // アイコン (open_in_full) - サイズ調整済み
  btn.innerHTML = `
    <svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor">
      <path d="M160-160v-200h40v131.69l144-144L372.31-344l-144 144H360v40H160Zm440 0v-40h131.69l-144-144L616-372.31l144 144V-360h40v200H600ZM344-587.69l-144-144V-600h-40v-200h200v40H228.31l144 144L344-587.69Zm272 0L587.69-616l144-144H600v-40h200v200h-40v-131.69l-144 144Z"/>
    </svg>
  `;btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEditorModal(target);
  });

  container.appendChild(btn);
  target.dataset.hasExpandBtn = 'true';
}

/**
 * テキストエリアへの挿入ヘルパー
 * document.execCommand('insertText') を使用することで、
 * ブラウザ標準のUndo/Redoスタックに履歴が積まれるようにします。
 */
function insertTextAtCursor(textarea, before, after = "") {
  textarea.focus();

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selection = textarea.value.substring(start, end);
  const replacement = before + selection + after;

  // setRangeText の代わりに execCommand を使用 (DeprecatedだがUndo対応のため必須)
  // これによりブラウザネイティブの Ctrl+Z / Ctrl+Y (Mac: Cmd+Z) が機能する
  const success = document.execCommand('insertText', false, replacement);
  
  // 万が一 execCommand が機能しない環境へのフォールバック
  if (!success) {
    textarea.setRangeText(replacement);
  }

  // カーソル位置をタグの内側（選択テキスト部分）に設定
  const newStart = start + before.length;
  const newEnd = newStart + selection.length;
  
  textarea.setSelectionRange(newStart, newEnd);
}

/**
 * HTMLエスケープ関数
 */
function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 簡易テーブル挿入ダイアログを表示する
 */
function showTableInsertDialog(targetElement, onInsert) {
  // 既存のオーバーレイがあれば削除
  const existing = document.querySelector('.enhancer-dialog-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'enhancer-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'enhancer-dialog';
  dialog.innerHTML = `
    <h3>Insert Table</h3>
    <div class="enhancer-dialog-row">
      <label>Rows:</label>
      <input type="number" id="tblRows" value="3" min="1" max="50">
    </div>
    <div class="enhancer-dialog-row">
      <label>Columns:</label>
      <input type="number" id="tblCols" value="3" min="1" max="20">
    </div>
    <div class="enhancer-dialog-actions">
      <button class="enhancer-dialog-btn secondary" id="tblCancel">Cancel</button>
      <button class="enhancer-dialog-btn primary" id="tblInsert">Insert</button>
    </div>
  `;

  overlay.appendChild(dialog);
  targetElement.appendChild(overlay);

  const rowInput = dialog.querySelector('#tblRows');
  const colInput = dialog.querySelector('#tblCols');
  
  // フォーカス
  setTimeout(() => rowInput.focus(), 50);

  const close = () => overlay.remove();

  dialog.querySelector('#tblCancel').onclick = close;
  dialog.querySelector('#tblInsert').onclick = () => {
    const rows = parseInt(rowInput.value, 10) || 3;
    const cols = parseInt(colInput.value, 10) || 3;
    onInsert(rows, cols);
    close();
  };

  // Enterキーで挿入
  const handleKey = (e) => {
      if(e.key === 'Enter') dialog.querySelector('#tblInsert').click();
      if(e.key === 'Escape') close();
  };
  dialog.addEventListener('keydown', handleKey);
}

/**
 * リストの番号を振り直す関数
 */
function renumberList(textarea) {
  const value = textarea.value;
  const lines = value.split('\n');
  const cursorPos = textarea.selectionStart;
  
  // カーソルがある行のインデックスを探す
  let charCount = 0;
  let currentLineIndex = -1;
  for(let i=0; i<lines.length; i++) {
      const lineLen = lines[i].length + 1; // +1 for \n
      if (charCount <= cursorPos && cursorPos < charCount + lineLen) {
          currentLineIndex = i;
          break;
      }
      // カーソルが末尾にある場合への対応
      if (i === lines.length - 1 && cursorPos === charCount + lines[i].length) {
           currentLineIndex = i;
      }
      charCount += lineLen;
  }
  if (currentLineIndex === -1) return;

  // リストマーカー(番号付き)の検出
  const listRegex = /^(\s*)(\d+)\.\s/;
  
  // 探索: 現在行から上下にリストブロック範囲を特定
  let startRow = currentLineIndex;
  while(startRow > 0 && listRegex.test(lines[startRow-1])) {
      startRow--;
  }
  let endRow = currentLineIndex;
  while(endRow < lines.length - 1 && listRegex.test(lines[endRow+1])) {
      endRow++;
  }
  
  // リストブロックが見つからなかった、あるいは現在行がリストでない場合は何もしない
  // (ただしEnterで空行を作った直後は現在行が空なので、直前がリストなら反応させる等の工夫もありうるが、今回はシンプルに)
  if (!listRegex.test(lines[currentLineIndex]) && startRow === endRow) return;

  // リナンバリング処理
  let hierarchy = []; 
  let changed = false;

  for (let i = startRow; i <= endRow; i++) {
      const line = lines[i];
      const match = line.match(listRegex);
      if (!match) continue; 

      const indentStr = match[1];
      const indentLen = indentStr.length;
      const currentNum = parseInt(match[2], 10);
      const content = line.substring(match[0].length);

      // 階層ロジック
      if (hierarchy.length === 0) {
          hierarchy.push({indent: indentLen, count: 1});
      } else {
          const top = hierarchy[hierarchy.length - 1];
          if (indentLen > top.indent) {
              // ネスト開始
              hierarchy.push({indent: indentLen, count: 1});
          } else if (indentLen === top.indent) {
              // 同階層
              top.count++;
          } else {
              // 親階層へ戻る
              while(hierarchy.length > 0 && hierarchy[hierarchy.length - 1].indent > indentLen) {
                  hierarchy.pop();
              }
              if (hierarchy.length === 0) {
                  hierarchy.push({indent: indentLen, count: 1});
              } else {
                  const newTop = hierarchy[hierarchy.length - 1];
                  if (newTop.indent === indentLen) {
                      newTop.count++;
                  } else {
                      // インデント不整合時は新規階層扱い
                      hierarchy.push({indent: indentLen, count: 1});
                  }
              }
          }
      }

      const correctNum = hierarchy[hierarchy.length - 1].count;
      if (currentNum !== correctNum) {
          lines[i] = `${indentStr}${correctNum}. ${content}`;
          changed = true;
      }
  }

  if (changed) {
      const newValue = lines.join('\n');
      
      // カーソル位置の復元（行内の相対位置を維持）
      let oldLineStart = 0;
      for(let i=0; i<currentLineIndex; i++) oldLineStart += (textarea.value.split('\n')[i].length + 1);
      const offset = cursorPos - oldLineStart;

      textarea.value = newValue;

      let newLineStart = 0;
      for(let i=0; i<currentLineIndex; i++) newLineStart += (lines[i].length + 1);
      let newCursor = newLineStart + offset;
      
      // 行の長さが変わってオーバーフローした場合の補正
      if (offset > lines[currentLineIndex].length) {
          newCursor = newLineStart + lines[currentLineIndex].length;
      }

      textarea.setSelectionRange(newCursor, newCursor);
      
      // イベント発火
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * 拡大編集モーダルを開く
 * @param {HTMLElement} sourceInput - 元の入力要素 (textarea or div)
 */
function openEditorModal(sourceInput) {
  injectGeminiStyles();

  const overlay = document.createElement('div');
  overlay.className = 'enhancer-editor-overlay';
  
  const card = document.createElement('div');
  card.className = 'enhancer-editor-card';

  // --- ヘッダー ---
  const header = document.createElement('div');
  header.className = 'enhancer-editor-header';
  header.textContent = chrome.i18n.getMessage("modalTitleEdit") || "Edit Text";
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:20px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);

  // --- ツールバー ---
  const toolbar = document.createElement('div');
  toolbar.className = 'enhancer-editor-toolbar';

  const createBtn = (iconName, title, action) => {
    const b = document.createElement('button');
    b.className = 'enhancer-toolbar-btn';
    b.title = title;
    
    // SVGを挿入
    if (iconName && EDITOR_ICONS[iconName]) {
      b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${EDITOR_ICONS[iconName]}</svg>`;
    } else if (iconName) {
      // 万が一SVGが見つからない場合は文字でフォールバック
      b.textContent = title.substring(0, 1);
    }
    
    b.onclick = action;
    return b;
  };

  // 太字・斜体
  toolbar.appendChild(createBtn('format_bold', 'Bold', () => insertTextAtCursor(textarea, '**', '**')));
  toolbar.appendChild(createBtn('format_italic', 'Italic', () => insertTextAtCursor(textarea, '*', '*')));
  
  const sep1 = document.createElement('div'); sep1.className = 'enhancer-separator'; toolbar.appendChild(sep1);

  // 見出し H1 ~ H4 (テキストアイコン)
  const addHeadingBtn = (level) => {
      const btn = createBtn(null, `Heading ${level}`, () => insertTextAtCursor(textarea, '#'.repeat(level) + ' '));
      btn.textContent = `H${level}`;
      btn.classList.add('text-icon');
      toolbar.appendChild(btn);
  };
  addHeadingBtn(1);
  addHeadingBtn(2);
  addHeadingBtn(3);
  addHeadingBtn(4);

  const sep2 = document.createElement('div'); sep2.className = 'enhancer-separator'; toolbar.appendChild(sep2);

  // リスト (バレット・番号付き)
  toolbar.appendChild(createBtn('format_list_bulleted', 'List', () => insertTextAtCursor(textarea, '- ')));
  toolbar.appendChild(createBtn('format_list_numbered', 'Ordered List', () => insertTextAtCursor(textarea, '1. '))); // New
  toolbar.appendChild(createBtn('check_box', 'Checklist', () => insertTextAtCursor(textarea, '- [ ] ')));

  const sep3 = document.createElement('div'); sep3.className = 'enhancer-separator'; toolbar.appendChild(sep3);

  // コードブロック
  toolbar.appendChild(createBtn('code', 'Code Block', () => insertTextAtCursor(textarea, '```\n', '\n```')));
  
  // テーブル挿入 (リッチダイアログ)
  toolbar.appendChild(createBtn('table_chart', 'Insert Table', () => {
      showTableInsertDialog(body, (rows, cols) => {
          let tableMd = "\n";
          // Header
          tableMd += "|";
          for(let c=1; c<=cols; c++) { tableMd += ` Header ${c} |`; }
          tableMd += "\n|";
          // Separator
          for(let c=1; c<=cols; c++) { tableMd += " --- |"; }
          tableMd += "\n";
          // Data rows
          for(let r=1; r<=rows; r++) {
              tableMd += "|";
              for(let c=1; c<=cols; c++) { tableMd += ` Cell ${r}-${c} |`; }
              tableMd += "\n";
          }
          tableMd += "\n";
          insertTextAtCursor(textarea, tableMd);
      });
  }));

  // スペーサー
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  toolbar.appendChild(spacer);

  // プレビュー切り替え
  const previewBtn = createBtn('visibility', 'Toggle Preview', () => {
      const isPreview = previewArea.classList.toggle('active');
      textarea.style.display = isPreview ? 'none' : 'block';
      previewBtn.classList.toggle('active', isPreview);
      
      if (isPreview) {
          if (typeof marked !== 'undefined') {
              previewArea.innerHTML = marked.parse(textarea.value, { breaks: true, gfm: true });
          } else {
              previewArea.textContent = "Error: marked.js library not loaded.";
          }
      } else {
          textarea.focus();
      }
  });
  toolbar.appendChild(previewBtn);

  // --- ボディ ---
  const body = document.createElement('div');
  body.className = 'enhancer-editor-body';
  body.style.position = 'relative'; // ダイアログの絶対配置用
  
  const textarea = document.createElement('textarea');
  textarea.className = 'enhancer-editor-textarea';
  
  // 値の取得ロジック
  let initialValue = "";
  if (sourceInput.tagName === 'TEXTAREA' || sourceInput.tagName === 'INPUT') {
      initialValue = sourceInput.value || "";
  } else {
      if (sourceInput.classList.contains('ql-editor')) {
          const paragraphs = sourceInput.querySelectorAll('p');
          if (paragraphs.length > 0) {
              initialValue = Array.from(paragraphs).map(p => {
                  if (p.innerHTML === '<br>' || p.textContent.trim() === '') {
                      return '';
                  }
                  return p.textContent;
              }).join('\n');
          } else {
              initialValue = sourceInput.innerText || "";
          }
      } else {
           initialValue = (sourceInput.innerText || sourceInput.textContent || "").trim();
      }
  }
  textarea.value = initialValue;

  // テキストエリアへのキーハンドリング (リスト自動継続・インデント)
  textarea.addEventListener('keydown', (e) => {
    // 変換確定中などは無視
    if (e.isComposing) return;

    // --- リスト自動継続 (Enter) ---
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const val = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        // カーソル行の先頭を取得
        const lastLf = val.lastIndexOf('\n', start - 1);
        const lineStart = lastLf + 1;
        const currentLineUpToCursor = val.substring(lineStart, start);
        
        // リストマーカーの検出 (- * + 数字.)
        const match = currentLineUpToCursor.match(/^(\s*)([-*+]|\d+[\.\)])\s/);
        
        if (match) {
            const fullMatch = match[0];
            const indent = match[1];
            const marker = match[2];
            
            // 行がマーカーのみで空の場合 (例: "- " の状態でEnter) -> リスト終了
            const contentAfterMarker = currentLineUpToCursor.substring(fullMatch.length);
            if (contentAfterMarker.trim().length === 0 && start === end) {
                e.preventDefault();
                // 行をクリアして改行
                textarea.setSelectionRange(lineStart, start);
                document.execCommand('delete'); // マーカー削除
                // 空行を残すか、単にリストモード終了とするか。ここでは行を消して空行にする
                return;
            }

            // 次のマーカーを生成
            let nextMarker = marker;
            const numMatch = marker.match(/^(\d+)([\.\)])$/);
            if (numMatch) {
                const num = parseInt(numMatch[1], 10);
                nextMarker = (num + 1) + numMatch[2];
            }

            e.preventDefault();
            const insertion = '\n' + indent + nextMarker + ' ';
            document.execCommand('insertText', false, insertion);

            // リナンバリング実行 (Enter後)
            setTimeout(() => renumberList(textarea), 0);
            return;
        }
    }

    // --- インデント制御 (Tab) ---
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const lastLf = val.lastIndexOf('\n', start - 1);
        const lineStart = lastLf + 1;

        if (e.shiftKey) {
            // Un-indent (4スペース)
            const firstFour = val.substring(lineStart, lineStart + 4);
            const firstTwo = val.substring(lineStart, lineStart + 2);
            
            if (firstFour === '    ') {
                textarea.setSelectionRange(lineStart, lineStart + 4);
                document.execCommand('delete');
                textarea.setSelectionRange(Math.max(lineStart, start - 4), Math.max(lineStart, end - 4));
            } else if (firstTwo === '  ') {
                textarea.setSelectionRange(lineStart, lineStart + 2);
                document.execCommand('delete');
                textarea.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
            }
        } else {
            // Indent (4スペース)
            textarea.setSelectionRange(lineStart, lineStart);
            document.execCommand('insertText', false, '    ');
            textarea.setSelectionRange(start + 4, end + 4);
        }
        setTimeout(() => renumberList(textarea), 0);
    }
  });

  // プレビューエリア
  const previewArea = document.createElement('div');
  previewArea.className = 'enhancer-preview-area';

  body.appendChild(toolbar);
  body.appendChild(textarea);
  body.appendChild(previewArea);

  // --- フッター ---
  const footer = document.createElement('div');
  footer.className = 'enhancer-editor-footer';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'enhancer-btn-secondary';
  cancelBtn.textContent = chrome.i18n.getMessage("modalBtnCancel") || "Cancel";
  cancelBtn.onclick = () => overlay.remove();

  const saveBtn = document.createElement('button');
  saveBtn.className = 'enhancer-btn-primary';
  saveBtn.textContent = chrome.i18n.getMessage("btnApply") || "Apply";
  
  saveBtn.onclick = () => {
    const newValue = textarea.value;
    
    if (sourceInput.tagName === 'TEXTAREA' || sourceInput.tagName === 'INPUT') {
        sourceInput.value = newValue;
    } else {
        const html = newValue.split('\n').map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
        sourceInput.innerHTML = html;
    }

    sourceInput.focus();
    sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
    sourceInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    overlay.remove();
  };

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // 初期フォーカスとカーソル位置のリセット
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(0, 0); // 先頭に
    textarea.scrollTop = 0;           // スクロールも上へ
  });

  const handleEsc = (e) => {
    // ダイアログが出ているときはダイアログだけ閉じる
    if(document.querySelector('.enhancer-dialog-overlay')) return;
    
    if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// --- メイン監視ロジック ---
const mainObserver = new MutationObserver((mutationsList, obs) => {
  // ツールショートカット
  if (settings.geminiToolShortcuts) {
    const promptArea = document.querySelector(PROMPT_AREA_SELECTOR);
    if (promptArea) {
      let injectionTargetWrapper = null;
      let injectionReferenceNode = null;
      injectionTargetWrapper = promptArea.querySelector(INJECTION_TARGET_SELECTOR);
      if (injectionTargetWrapper) {
        injectionReferenceNode = injectionTargetWrapper.querySelector('toolbox-drawer');
      } else {
        injectionReferenceNode = promptArea.querySelector('toolbox-drawer');
        if (injectionReferenceNode) injectionTargetWrapper = injectionReferenceNode.parentNode;
      }

      if (injectionTargetWrapper) {
        const existingButton = injectionTargetWrapper.querySelector('.enhancer-shortcut-button');
        if (!existingButton) injectToolShortcuts(injectionTargetWrapper, injectionReferenceNode);
        updateAllShortcutVisibility();
      }
    }
  }
  
  // Enterキー
  if (settings.geminiEnterKey) {
    const mainTextArea = document.querySelector(TEXT_AREA_SELECTOR);
    attachEnterKeyHijack(mainTextArea);
    const editTextArea = document.querySelector(EDIT_TEXT_AREA_SELECTOR);
    attachEnterKeyHijack(editTextArea);
  }

  // 幅調整
  applyCustomContentWidth();

  // Gem検索
  if (settings.enableGemManagerSearch) {
    initGemManagerSearch();
  }

  // 拡大ボタンの注入
  if (settings.geminiExpandInput) {
    tryInjectExpandButtons();
  }
});

mainObserver.observe(document.body, { childList: true, subtree: true });

// ユーザー操作時にも念のためチェック (DOM描画遅延対策)
document.addEventListener('click', () => {
  if (settings.geminiExpandInput) setTimeout(tryInjectExpandButtons, 500);
});
document.addEventListener('focusin', (e) => {
  // ターゲット要素の条件
  if (settings.geminiExpandInput && 
      !e.target.classList.contains('new-input-ui') && 
      (e.target.classList.contains('ql-editor') || e.target.getAttribute('contenteditable') === 'true')) {
      tryInjectExpandButtons();
  }
});