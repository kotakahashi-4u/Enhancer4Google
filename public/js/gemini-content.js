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
  enableGemManagerSearch: true
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
    enableGemManagerSearch: true
  }, (items) => {
    settings = items;
    applyCustomContentWidth();
    // 初回ロード時にGemマネージャー画面なら検索バーを表示
    if (settings.enableGemManagerSearch) {
      initGemManagerSearch();
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
  if (settings.enableGemManagerSearch) initGemManagerSearch();
});

mainObserver.observe(document.body, { childList: true, subtree: true });