/**
 * @file Enhancer 4 Google - Gemini Content Script
 * @description GeminiのUI改善（ショートカット、Enterキー、幅調整、Gem検索）を行うコンテンツスクリプトです。
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

/**
 * HTMLエスケープ関数 (XSS対策)
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
      width: 80vw; max-width: 900px; height: 80vh;
      border-radius: 16px; display: flex; flex-direction: column;
      box-shadow: 0 12px 32px rgba(0,0,0,0.2);
      animation: enhancer-pop-in 0.2s cubic-bezier(0.2, 0, 0.2, 1);
    }
    @keyframes enhancer-pop-in {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .enhancer-editor-header {
      padding: 16px 24px; border-bottom: 1px solid var(--gem-sys-color-outline-variant, #e0e0e0);
      display: flex; justify-content: space-between; align-items: center;
      font-weight: bold; color: var(--gem-sys-color-on-surface, #1f1f1f);
      background: #f8fafd;
      border-radius: 16px 16px 0 0;
    }
    .enhancer-editor-body {
      flex: 1; padding: 16px; display: flex;
    }
    .enhancer-editor-textarea {
      flex: 1; width: 100%; height: 100%; resize: none; border: none; outline: none;
      font-family: "Google Sans Mono", "Roboto Mono", monospace;
      font-size: 14px; line-height: 1.6; color: var(--gem-sys-color-on-surface, #1f1f1f);
      background: transparent;
    }
    .enhancer-editor-footer {
      padding: 16px 24px; border-top: 1px solid var(--gem-sys-color-outline-variant, #e0e0e0);
      display: flex; justify-content: flex-end; gap: 12px;
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

  const targets = document.querySelectorAll('div.ql-editor.textarea:not(.ql-blank)');
  
  targets.forEach(target => {
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
  });
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

  const header = document.createElement('div');
  header.className = 'enhancer-editor-header';
  header.textContent = chrome.i18n.getMessage("modalTitleEdit") || "Edit Text";
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:20px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'enhancer-editor-body';
  const textarea = document.createElement('textarea');
  textarea.className = 'enhancer-editor-textarea';
  
  // ★重要修正: 値の取得ロジック (空行問題への対応)
  let initialValue = "";
  if (sourceInput.tagName === 'TEXTAREA' || sourceInput.tagName === 'INPUT') {
      initialValue = sourceInput.value || "";
  } else {
      // リッチテキストの場合、<p>タグ構造を解析して正確な改行を取得する
      if (sourceInput.classList.contains('ql-editor')) {
          const paragraphs = sourceInput.querySelectorAll('p');
          if (paragraphs.length > 0) {
              // 各<p>タグのテキストコンテンツを取得し、改行で結合
              initialValue = Array.from(paragraphs).map(p => {
                  // <br>のみの段落は空文字として扱う
                  if (p.innerHTML === '<br>' || p.textContent.trim() === '') {
                      return '';
                  }
                  return p.textContent;
              }).join('\n');
          } else {
              // <p>がない場合（フォールバック）
              initialValue = sourceInput.innerText || "";
          }
      } else {
           // その他のcontenteditableの場合（念のため以前のロジックも残す）
           initialValue = (sourceInput.innerText || sourceInput.textContent || "").trim();
      }
  }
  textarea.value = initialValue;
  
  body.appendChild(textarea);

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
        // リッチテキスト(div)の場合は、改行を <p> タグで包んで innerHTML に設定
        // XSS対策として escapeHtml を適用
        const html = newValue.split('\n').map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
        sourceInput.innerHTML = html;
    }

    sourceInput.focus();
    // フレームワークに変更を検知させる
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

  requestAnimationFrame(() => textarea.focus());

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
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
  // 修正: 対象要素の条件を絞り込み
  if (settings.geminiExpandInput && (e.target.classList.contains('ql-editor') || e.target.getAttribute('contenteditable') === 'true')) {
    tryInjectExpandButtons();
  }
});