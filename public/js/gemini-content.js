/**
 * @file Enhancer 4 Google - Gemini Content Script
 * Gemini (gemini.google.com) のUIを改善する機能を提供します。
 * - ツールショートカット (DeepResearch, Canvas) のプロンプトバーへの追加
 * - Enterキーの動作変更 (Enterで改行、Shift+Enterで送信)
 * - コンテンツ幅のカスタマイズ機能
 */

// --- 設定管理 ---
let settings = {
  geminiToolShortcuts: true,
  geminiEnterKey: true,
  geminiLayoutWidthEnabled: false,
  geminiLayoutWidthValue: 1200
};

/**
 * 拡張機能の設定を chrome.storage.sync から読み込み、グローバル変数 `settings` に格納します。
 */
function loadSettings() {
  chrome.storage.sync.get({
    geminiToolShortcuts: true,
    geminiEnterKey: true,
    geminiLayoutWidthEnabled: false,
    geminiLayoutWidthValue: 1200
  }, (items) => {
    settings = items;
    // 読み込み完了時にカスタム幅を適用
    applyCustomContentWidth();
  });
}

/**
 * chrome.storage の変更を監視し、設定が変更された場合に動的に機能をON/OFFします。
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  let settingsChanged = false;
  
  // ツールショートカットのON/OFF
  if (changes.geminiToolShortcuts) {
    settings.geminiToolShortcuts = changes.geminiToolShortcuts.newValue;
    if (settings.geminiToolShortcuts === false) {
      removeToolShortcuts(); // OFFになった場合は即時削除
    }
    settingsChanged = true;
  }
  
  // Enterキーの動作変更のON/OFF
  if (changes.geminiEnterKey) {
    settings.geminiEnterKey = changes.geminiEnterKey.newValue;
    if (settings.geminiEnterKey === false) {
      // OFFになった場合は、アタッチされている全てのリスナーを即時解除
      document.querySelectorAll('[data-enter-hijacked="true"]').forEach(removeEnterKeyHijack);
    }
    settingsChanged = true;
  }
  
  // カスタム幅設定の変更
  if (changes.geminiLayoutWidthEnabled || changes.geminiLayoutWidthValue) {
    if (changes.geminiLayoutWidthEnabled) {
        settings.geminiLayoutWidthEnabled = changes.geminiLayoutWidthEnabled.newValue;
    }
    if (changes.geminiLayoutWidthValue) {
        settings.geminiLayoutWidthValue = changes.geminiLayoutWidthValue.newValue;
    }
    settingsChanged = true;
    applyCustomContentWidth(); // 即時スタイルを更新
  }
});

// 初期ロード
loadSettings();

// --- DOMセレクタ ---
const PROMPT_AREA_SELECTOR = 'input-area-v2';
const TEXT_AREA_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
const EDIT_TEXT_AREA_SELECTOR = 'textarea[cdktextareaautosize][enterkeyhint="send"]';
const INJECTION_TARGET_SELECTOR = '.leading-actions-wrapper'; // ★ /app/ と /gem/ の両方に存在する注入ラッパー
const TOOL_MENU_SELECTOR = 'mat-card.toolbox-drawer-card'; // ツールポップアップメニュー
const SUBMIT_BUTTON_SELECTOR = 'button.send-button.submit:not([disabled])';
const EDIT_SUBMIT_BUTTON_SELECTOR = 'button.update-button:not([disabled])';
const PROMPT_CONTAINER_SELECTOR = '.input-area-container';
const CHAT_HISTORY_CONTAINER_SELECTOR = '.conversation-container';
const HISTORY_USER_QUERY_SELECTOR = 'user-query';
const HISTORY_MODEL_RESPONSE_SELECTOR = 'model-response';
const USER_BUBBLE_BACKGROUND_SELECTOR = '.user-query-bubble-with-background:not(.edit-mode)';
const CUSTOM_WIDTH_STYLE_ID = 'gemini-content-width-style';

/**
 * 注入するツールショートカットの定義
 */
const TOOLS_TO_INJECT = [
  {
    id: 'deep-research',
    label: 'Deep Research',
    icon: 'travel_explore',
    iconSelector: 'mat-icon[fonticon="travel_explore"]'
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: 'note_stack_add',
    iconSelector: 'mat-icon[fonticon="note_stack_add"]'
  }
];

// --- 機能1: ツールショートカット ---

/**
 * ショートカットボタンクリック時に、対応するツールを起動します。
 * @param {string} toolIconSelector - ツールメニュー内で探すアイコンのセレクタ (例: 'mat-icon[fonticon="travel_explore"]')
 * @param {string} toolIcon - ツール名 (例: 'travel_explore')
 */
function activateTool(toolIconSelector, toolIcon) {
  // [ツール]ボタン（非アクティブ状態）を探す
  const inactiveToolButton = document.querySelector('button.toolbox-drawer-button-with-label');
  if (inactiveToolButton) {
    // ツールが非アクティブな場合: 1. メニューを開く -> 2. 目的のツールをクリック
    inactiveToolButton.click();
    waitForMenuAndClick(toolIconSelector);
  } else {
    // ツールが既にアクティブな場合 (例: Canvasがアクティブ)
    const activeToolChip = document.querySelector('button.toolbox-drawer-item-deselect-button');
    if (!activeToolChip) return;
    
    // 既に押したいボタンがアクティブなら何もしない
    const activeIcon = activeToolChip.querySelector(`mat-icon[fonticon="${toolIcon}"]`);
    if (activeIcon) {
      return;
    }
    
    // 別のツールがアクティブな場合: 1. 現在のツールを非アクティブ化 -> 2. メニューが開くのを待つ -> 3. 目的のツールをクリック
    // ★ テクニカルな箇所: ツールを非アクティブ化すると、[ツール]ボタンがDOMに再挿入される。
    // その「再挿入」を MutationObserver で監視する。
    const deactivateObserver = new MutationObserver((mutations, obs) => {
      const newInactiveButton = document.querySelector('button.toolbox-drawer-button-with-label');
      if (newInactiveButton) {
        obs.disconnect(); // 監視終了
        newInactiveButton.click(); // メニューを開く
        waitForMenuAndClick(toolIconSelector); // 目的のツールをクリック
      }
    });
    const toolboxDrawer = document.querySelector('toolbox-drawer');
    if(toolboxDrawer) {
        deactivateObserver.observe(toolboxDrawer, { childList: true, subtree: true });
    }
    activeToolChip.click(); // 1. 現在のツールを非アクティブ化
  }
}

/**
 * ツールメニューのポップアップ (cdk-overlay-pane) が表示されるのを待ち、
 * 目的のツールボタンをクリックします。
 * @param {string} toolIconSelector - クリック対象のツールアイコンのセレクタ
 */
function waitForMenuAndClick(toolIconSelector) {
  // ★ テクニカルな箇所: ツールメニューはDOMのルート (body直下) に動的に挿入されるため、
  // body全体を MutationObserver で監視する。
  const observer = new MutationObserver((mutations, obs) => {
    const toolMenu = document.querySelector(TOOL_MENU_SELECTOR);
    if (toolMenu) {
      // メニューが見つかった
      const toolIconEl = toolMenu.querySelector(toolIconSelector);
      if (toolIconEl) {
        const toolButton = toolIconEl.closest('button.mat-mdc-list-item');
        if (toolButton) {
          toolButton.click(); // 目的のツールをクリック
        }
      }
      obs.disconnect(); // 監視終了
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * ツールショートカットボタンをDOMに挿入します。
 * @param {HTMLElement} targetWrapper - 注入先の親要素 (例: .leading-actions-wrapper)
 * @param {HTMLElement | null} referenceNode - 挿入位置の基準となる要素 (例: toolbox-drawer)
 */
function injectToolShortcuts(targetWrapper, referenceNode) {
  const fragment = document.createDocumentFragment();
  TOOLS_TO_INJECT.forEach(tool => {
    // ★ セキュアコーディング: innerHTMLを使わず、createElementとtextContentでDOMを構築
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
    // 基準ノード (ツールボタン) の「前」に挿入
    targetWrapper.insertBefore(fragment, referenceNode);
  } else {
    // 基準ノードがない場合 (ツールボタンが存在しないUI) は末尾に追加
    targetWrapper.appendChild(fragment); 
  }
  injectGeminiStyles();
}

/**
 * (v1.9.5) 最終ロジック
 * URLと `toolbox-drawer` (ツールボタン) の有無に基づいて、
 * ショートカットボタンの表示/非表示を決定します。
 */
function updateAllShortcutVisibility() {
  const currentURL = window.location.href;
  
  let showDeepResearch = false; // デフォルトは非表示
  let showCanvas = false;       // デフォルトは非表示

  // 仕様1: /gems/edit
  if (currentURL.includes('/gems/edit')) {
    showDeepResearch = false;
    showCanvas = false;
  } else {
    // 仕様2: /app/ または /gem/
    const toolButton = document.querySelector('toolbox-drawer');
    
    if (toolButton) {
      // ツールボタンが「ある」場合
      if (currentURL.includes('/gem/')) {
        // /gem/ の場合 -> Canvasのみ表示
        showDeepResearch = false;
        showCanvas = true;
      } else {
        // /app/ (またはその他) の場合 -> 両方表示
        showDeepResearch = true;
        showCanvas = true;
      }
    } else {
      // ツールボタンが「ない」場合 -> 両方非表示
      showDeepResearch = false;
      showCanvas = false;
    }
  }

  // アクティブなツールが既に選択されているかチェック
  const activeToolChip = document.querySelector('button.toolbox-drawer-item-deselect-button');
  let activeIconName = null;
  if (activeToolChip) {
    const iconEl = activeToolChip.querySelector('mat-icon[fonticon]');
    if (iconEl) {
      activeIconName = iconEl.getAttribute('fonticon');
    }
  }

  // 最終的な表示/非表示を決定
  TOOLS_TO_INJECT.forEach(tool => {
    const shortcutButton = document.querySelector(`.enhancer-shortcut-button[data-tool-icon="${tool.icon}"]`);
    if (!shortcutButton) return;
    
    let isVisible = false; // デフォルトは非表示

    if (tool.id === 'deep-research' && showDeepResearch) {
      isVisible = true;
    }
    if (tool.id === 'canvas' && showCanvas) {
      isVisible = true;
    }
    
    // ★ アクティブなツール自身のショートカットボタンは非表示にする
    if (tool.icon === activeIconName) {
      isVisible = false;
    }
    
    shortcutButton.style.display = isVisible ? 'inline-flex' : 'none';
  });
}

/**
 * 挿入したツールショートカットボタンをDOMから削除します（機能OFF時）。
 */
function removeToolShortcuts() {
    document.querySelectorAll('.enhancer-shortcut-button').forEach(button => {
        button.remove();
    });
}

/**
 * ショートカットボタン用のカスタムCSSを <head> に挿入します。
 */
function injectGeminiStyles() {
  const STYLE_ID = 'notebooklm-enhancer-gemini-styles';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // ★ コード全量を展開
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

// --- 機能2: Enterキーの動作変更 ---

/**
 * Enterキーのキーダウンイベントハンドラ。
 * @param {KeyboardEvent} event
 */
const handleKeyDown = (event) => {
  if (settings.geminiEnterKey === false) {
    return;
  }
  if (event.key !== 'Enter') {
    return;
  }
  
  if (event.shiftKey) {
    // --- Shift + Enter の場合 (送信) ---
    event.preventDefault(); // デフォルトの改行をキャンセル
    event.stopImmediatePropagation(); // 他のリスナー（Geminiネイティブ）を止める

    // 編集中の送信ボタンか、通常の送信ボタンかを探す
    let submitButton = document.querySelector(EDIT_SUBMIT_BUTTON_SELECTOR);
    if (!submitButton) {
      submitButton = document.querySelector(SUBMIT_BUTTON_SELECTOR);
    }
    
    if (submitButton) {
      submitButton.click();
    } else {
      console.warn('Enhancer4Google (Gemini): Could not find submit or update button.');
    }
    
  } else {
    // --- Enter のみの場合 (改行) ---
    // ★ テクニカルな箇所: Geminiのリッチテキストエリアは Enter で送信がデフォルト。
    // ここで stopImmediatePropagation() を呼ぶことで、
    // Geminiの「送信」リスナーの実行をブロックし、「改行」だけを行う。
    event.stopImmediatePropagation(); 
  }
};

/**
 * 対象のテキストエリアにEnterキーハイジャック用リスナーをアタッチします。
 * @param {HTMLElement} textAreaElement - アタッチ対象のテキストエリア
 */
function attachEnterKeyHijack(textAreaElement) {
  if (!textAreaElement || textAreaElement.dataset.enterHijacked === 'true') {
    return; // 既にアタッチ済み
  }
  // ★ キャプチャフェーズ (true) で登録し、Geminiのリスナーより先に実行されるようにする
  textAreaElement.addEventListener('keydown', handleKeyDown, true);
  textAreaElement.dataset.enterHijacked = 'true';
}

/**
 * アタッチしたリスナーを解除します（機能OFF時）。
 * @param {HTMLElement} textAreaElement - 解除対象のテキストエリア
 */
function removeEnterKeyHijack(textAreaElement) {
  if (textAreaElement && textAreaElement.dataset.enterHijacked === 'true') {
    textAreaElement.removeEventListener('keydown', handleKeyDown, true);
    textAreaElement.dataset.enterHijacked = 'false';
  }
}


// --- 機能3: コンテンツ幅のカスタマイズ ---

/**
 * オプションで設定されたカスタム幅を適用/削除します。
 */
function applyCustomContentWidth() {
  const styleId = CUSTOM_WIDTH_STYLE_ID;
  let styleTag = document.getElementById(styleId);

  if (settings.geminiLayoutWidthEnabled) {
    // ★ セキュアコーディング: 念のため parseInt で数値を抽出
    const width = parseInt(settings.geminiLayoutWidthValue, 10);
    
    if (isNaN(width) || width <= 760) {
      if (styleTag) {
        styleTag.remove();
      }
      return;
    }
    
    const bubbleWidth = width - 284; 

    const cssText = `
      ${PROMPT_CONTAINER_SELECTOR},
      ${CHAT_HISTORY_CONTAINER_SELECTOR}, 
      ${HISTORY_USER_QUERY_SELECTOR},
      ${HISTORY_MODEL_RESPONSE_SELECTOR} {
        max-width: ${width}px !important;
      }
      ${USER_BUBBLE_BACKGROUND_SELECTOR} {
        max-width: calc(${bubbleWidth}px - var(--gem-sys-spacing--m) * 2) !important;
      }
    `;

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    
    if (styleTag.textContent !== cssText) {
      styleTag.textContent = cssText;
    }

  } else {
    // 機能がOFFの場合はスタイルタグを削除
    if (styleTag) {
      styleTag.remove();
    }
  }
}


// --- メイン監視ロジック ---

/**
 * ページ全体のDOM変更を監視し、必要な機能をアタッチ/更新します。
 */
const mainObserver = new MutationObserver((mutationsList, obs) => {
  
  // 機能1: ツールショートカット
  if (settings.geminiToolShortcuts) {
    const promptArea = document.querySelector(PROMPT_AREA_SELECTOR); // 'input-area-v2'
    
    if (promptArea) {
      // ★ テクニカルな箇所: /app/ と /gem/ のDOM構造の違いを吸収するハイブリッドロジック
      let injectionTargetWrapper = null;
      let injectionReferenceNode = null;

      // [戦略 1: /app/ & /gem/ 共通]
      // 優先ラッパー(.leading-actions-wrapper)を探す
      injectionTargetWrapper = promptArea.querySelector(INJECTION_TARGET_SELECTOR);
      
      if (injectionTargetWrapper) {
        // [A] ラッパーが見つかった場合、その中のツールボタンを探す
        injectionReferenceNode = injectionTargetWrapper.querySelector('toolbox-drawer');
      } else {
        // [B] ラッパーが見つからない (フォールバック)
        // promptArea直下からツールボタンを探す
        injectionReferenceNode = promptArea.querySelector('toolbox-drawer');
        if (injectionReferenceNode) {
          // その親をラッパーとして扱う
          injectionTargetWrapper = injectionReferenceNode.parentNode;
        }
      }

      // [最終チェック]
      if (injectionTargetWrapper) { // ラッパーさえ見つかればOK
        
        // 二重注入を防ぐ
        const existingButton = injectionTargetWrapper.querySelector('.enhancer-shortcut-button');
        if (!existingButton) {
          // ツールボタン(referenceNode)がなくても末尾に追加される
          injectToolShortcuts(injectionTargetWrapper, injectionReferenceNode);
        }
        
        // ★ DOMが変更されるたびに、表示/非表示のロジックを再実行する
        updateAllShortcutVisibility();
        
      }
    }
  }
  
  // 機能2: Enterキーの動作変更
  if (settings.geminiEnterKey) {
    // メインの入力欄と、編集時の入力欄の両方に対応
    const mainTextArea = document.querySelector(TEXT_AREA_SELECTOR);
    attachEnterKeyHijack(mainTextArea);
    const editTextArea = document.querySelector(EDIT_TEXT_AREA_SELECTOR);
    attachEnterKeyHijack(editTextArea);
  }

  // 機能3: カスタム幅
  // (設定がONの場合、DOM変更のたびにスタイルが適用されているか確認)
  applyCustomContentWidth();
});

// 監視を開始
mainObserver.observe(document.body, {
  childList: true,
  subtree: true
});