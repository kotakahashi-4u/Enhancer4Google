/**
 * @file Enhancer 4 Google - NotebookLM Content Script
 * NotebookLM (notebooklm.google.com) のUIを改善する機能を提供します。
 * - Studioパネルの開閉機能
 * - Studioボタンの動作改善 (編集プロンプトの強制表示)
 * - Enterキーの動作変更 (Enterで改行、Shift+Enterで送信)
 */

// ターゲットとなる要素のセレクタを定義します
const TARGET_SELECTOR = '.create-artifact-buttons-container'; // Studioパネルのボタン群
const STYLE_ID = 'notebooklm-enhancer-styles';
const NBLM_TEXT_AREA_SELECTOR = 'textarea.query-box-input'; // プロンプト入力欄
const NBLM_SUBMIT_BUTTON_SELECTOR = 'button.submit-button:not([disabled])'; // 送信ボタン

// 設定のデフォルト値を保持
let settings = {
  collapsibleStudio: true,
  hijackClicks: true,
  notebooklmEnterKey: true,
  submitKeyModifier: 'shift'
};

// --- デバッグ用ログ関数 ---
function debugLog(message, ...args) {
  console.log(`%c[Enhancer Debug] ${message}`, 'color: #00ff00; font-weight: bold;', ...args);
}

/**
 * 拡張機能の設定を chrome.storage.sync から読み込みます。
 */
function loadSettings() {
  chrome.storage.sync.get({
    collapsibleStudio: true,
    hijackClicks: true,
    notebooklmEnterKey: true,
    submitKeyModifier: 'shift'
  }, (items) => {
    settings = items;
  });
}

/**
 * chrome.storage の変更を監視し、設定が変更された場合に動的に機能をOFFにします。
 * (ONにする処理は MutationObserver がDOM変更を検知して自動で行う)
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  
  // 新しい設定をロード
  loadSettings(); 

  // Enterキー設定がOFFになった場合、リスナーを即時解除
  if (changes.notebooklmEnterKey && changes.notebooklmEnterKey.newValue === false) {
    removeNblmEnterKeyHijack();
  }
  // 開閉機能がOFFになった場合、ラッパーを即時解除
  if (changes.collapsibleStudio && changes.collapsibleStudio.newValue === false) {
    unwrapDetails();
  }
});

// 初期設定を読み込み
loadSettings();

/**
 * Studioパネル開閉機能 (<details>) 用のカスタムCSSを <head> に挿入します。
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // ★ コード全量を展開
  style.textContent = `
    summary::-webkit-details-marker {
      display: none;
    }
    summary {
      list-style: none;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    .summary-icon {
      position: relative;
      width: 18px;
      height: 18px;
      margin-right: 8px;
    }
    .summary-icon::before,
    .summary-icon::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1rem;
      height: 1.5px;
      border-radius: 2px;
      background-color: var(--mat-sys-on-background);
      transition: transform 0.3s ease-out,
                  opacity 0.3s ease-out,
                  background-color 0.2s ease-in-out;
    }
    .summary-icon::before {
      transform: translate(-50%, -50%);
    }
    .summary-icon::after {
      transform: translate(-50%, -50%) rotate(90deg);
    }
    details[open] .summary-icon::after {
      transform: translate(-50%, -50%) rotate(180deg);
      opacity: 0; 
    }
    .details-content-wrapper {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.4s ease-out;
    }

    /* --- 新機能: カスタムUIスタイル --- */
    :root {
      --enhancer-theme: #1BA1E3;
      --enhancer-bg: #ffffff;
      --enhancer-text: #2c3e50;
      --enhancer-overlay-bg: rgba(255, 255, 255, 0.55);
    }
    
    .enhancer-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: var(--enhancer-overlay-bg);
      backdrop-filter: blur(3px);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: "Google Sans", sans-serif;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .enhancer-overlay.active {
      opacity: 1;
      pointer-events: all;
    }

    .enhancer-modal-card {
      background: var(--enhancer-bg);
      padding: 32px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      text-align: center;
      max-width: 450px;
      width: 90%;
      transform: translateY(20px);
      transition: transform 0.3s ease;
    }
    .enhancer-overlay.active .enhancer-modal-card {
      transform: translateY(0);
    }

    .enhancer-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--enhancer-text);
      margin: 0 0 12px 0;
    }
    .enhancer-text {
      font-size: 0.95rem;
      color: #5f6368;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }

    .enhancer-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #e0e0e0;
      border-top-color: var(--enhancer-theme);
      border-radius: 50%;
      animation: enhancer-spin 1s linear infinite;
      margin: 0 auto 24px auto;
    }
    @keyframes enhancer-spin { to { transform: rotate(360deg); } }

    .enhancer-progress-container {
      width: 100%;
      height: 8px;
      background-color: #f1f3f4;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .enhancer-progress-bar {
      height: 100%;
      background-color: var(--enhancer-theme);
      width: 0%;
      transition: width 0.3s ease;
    }
    .enhancer-progress-text {
      font-size: 0.85rem;
      color: #5f6368;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      white-space: nowrap; /* 折り返し防止 */
    }
    
    /* ステータステキストの切り詰め用スタイル */
    #enhancer-progress-status {
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 12px;
      flex: 1;
      text-align: left;
    }

    .enhancer-result-list {
      text-align: left;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.9rem;
      border: 1px solid #e0e0e0;
    }
    .enhancer-result-item {
      padding: 4px 0;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
    }
    .enhancer-result-item:last-child { border-bottom: none; }
    .enhancer-result-icon {
      color: #1e8e3e;
      margin-right: 8px;
      font-weight: bold;
    }

    .enhancer-btn {
      background-color: var(--enhancer-theme);
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .enhancer-btn:hover {
      background-color: #168ac3;
    }
    .enhancer-btn:active {
      transform: scale(0.98);
    }
  `;
  document.head.appendChild(style);
}

/**
 * <details> の高さ監視用ResizeObserverインスタンス
 * @type {ResizeObserver | null}
 */
let heightObserver = null; 

/**
 * ターゲット要素 (Studioパネル) を <details> タグでラップし、開閉可能にします。
 * @param {HTMLElement} targetElement - ラップ対象の .create-artifact-buttons-container
 */
function wrapWithDetails(targetElement) {
  injectStyles();
  const details = document.createElement('details');
  details.className = 'enhancer-details-wrapper';
  details.open = true;
  
  // <summary> (クリック領域) を作成
  const summary = document.createElement('summary');
  summary.className = 'custom-summary';
  summary.style.marginLeft = '.85rem';
  summary.style.fontSize = '.9rem';
  summary.style.padding = '8px 0';
  const icon = document.createElement('span');
  icon.className = 'summary-icon';
  summary.appendChild(icon);
  summary.append(chrome.i18n.getMessage("featuresLabel")); // "各種機能群"
  
  details.prepend(summary);
  
  // コンテンツラッパー (高さをアニメーションさせるため)
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'details-content-wrapper';
  details.appendChild(contentWrapper);
  
  // ターゲットを <details> の中に移動
  targetElement.parentNode.insertBefore(details, targetElement);
  contentWrapper.appendChild(targetElement);

  let isAnimating = false;
  
  // <summary> のクリックイベントで開閉アニメーションを制御
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    isAnimating = true;
    if (!details.open) {
      details.open = true;
      requestAnimationFrame(() => {
        // ★ テクニカルな箇所: max-height を 0 から scrollHeight に変更して開くアニメーション
        contentWrapper.style.maxHeight = contentWrapper.scrollHeight + 'px';
      });
    } else {
      contentWrapper.style.maxHeight = '0px'; // 閉じるアニメーション
    }
    // アニメーション完了時に open 属性をトグル
    contentWrapper.addEventListener('transitionend', () => {
      isAnimating = false;
      if (details.open && contentWrapper.style.maxHeight === '0px') {
          details.open = false;
      }
    }, { once: true });
  });

  // ★ テクニカルな箇所: Studioパネルの中身の高さが動的に変わった場合 (例: ウィンドウリサイズ) に
  // max-height を追従させるための ResizeObserver
  heightObserver = new ResizeObserver(entries => {
    if (isAnimating) {
      return; // アニメーション中は高さを固定
    }
    const wrapper = entries[0].target;
    const newHeight = wrapper.scrollHeight;
    if (details.open && wrapper.style.maxHeight !== newHeight + 'px') {
      wrapper.style.maxHeight = newHeight + 'px';
    }
  });
  heightObserver.observe(contentWrapper);
}

/**
 * Studioボタン (「動画解説」など) のクリックを傍受し、
 * デフォルトの自動生成の代わりに「編集」ボタンのクリックを発火させます。
 * @param {HTMLElement} artifactButtonsContainer - .create-artifact-buttons-container
 */
function hijackArtifactButtonClicks(artifactButtonsContainer) {
  if (artifactButtonsContainer.dataset.clickHijacked === 'true') {
    return; // 二重アタッチ防止
  }
  artifactButtonsContainer.dataset.clickHijacked = 'true';
  
  // ★ テクニカルな箇所: キャプチャフェーズ (true) で登録し、NotebookLMの
  // ネイティブなクリックイベントより先に実行する
  artifactButtonsContainer.addEventListener('click', (e) => {
    const basicButton = e.target.closest('basic-create-artifact-button');
    if (!basicButton) return;
    
    // 既に編集ボタンが押された場合は何もしない
    if (e.target.closest('.edit-button')) return;

    const mainButtonContainer = e.target.closest('.create-artifact-button-container');
    if (mainButtonContainer) {
      const editButton = basicButton.querySelector('.edit-button');
      if (editButton) {
        // ★ メインの動作: デフォルトの動作をすべてキャンセル
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // 代わりに「編集」ボタンをクリックする
        editButton.click();
      }
    }
  }, true);
}

/**
 * 機能OFF時に、<details> ラッパーを解除し、DOMを元の状態に戻します。
 */
function unwrapDetails() {
  const detailsWrapper = document.querySelector('.enhancer-details-wrapper');
  if (!detailsWrapper) return;
  
  const contentWrapper = detailsWrapper.querySelector('.details-content-wrapper');
  const targetElement = document.querySelector(TARGET_SELECTOR);
  
  if (targetElement && contentWrapper && contentWrapper.contains(targetElement)) {
    // ターゲットを <details> の外 (元の場所) に戻す
    detailsWrapper.parentNode.insertBefore(targetElement, detailsWrapper);
    detailsWrapper.parentNode.removeChild(detailsWrapper); // <details> を削除
    
    // ResizeObserverを停止
    if (heightObserver) {
      heightObserver.disconnect();
      heightObserver = null;
    }
  }
}

// --- 機能3: NotebookLM Enterキーの動作変更 ---

/**
 * NotebookLMのEnterキー動作を乗っ取るイベントハンドラ
 * (キャプチャフェーズで実行)
 * @param {KeyboardEvent} event
 */
const handleNblmKeyDown = (event) => {
  // 設定がOFFなら何もしない
  if (settings.notebooklmEnterKey === false) {
    return;
  }

  // Enterキー以外は無視
  if (event.key !== 'Enter') {
    return;
  }

  const isSubmitModifierPressed = settings.submitKeyModifier === 'ctrl' ? event.ctrlKey : event.shiftKey;

  if (isSubmitModifierPressed) {
    // --- Shift + Enter の場合 (送信) ---
    event.preventDefault(); // デフォルトの改行動作をキャンセル
    event.stopImmediatePropagation(); // 他のリスナーを止める

    // 2. 送信ボタンを探してクリック
    const submitButton = document.querySelector(NBLM_SUBMIT_BUTTON_SELECTOR);
    if (submitButton) {
      submitButton.click();
    } else {
      console.warn('Enhancer4Google (NotebookLM): Could not find submit button.');
    }
    
  } else {
    // --- Enter のみの場合 (改行) ---
    // ★ テクニカルな箇所: NotebookLMのデフォルトの送信動作 (リスナー) のみをキャンセルする
    event.stopImmediatePropagation();
    
    // preventDefault() は *しない* ことで、
    // <textarea> のネイティブな「改行」動作だけが実行される
  }
};

/**
 * NotebookLMのプロンプト入力欄にEnterキーのリスナーをアタッチする
 * @param {HTMLElement} textArea - textarea.query-box-input 要素
 */
function setupNblmEnterKeyHijack(textArea) {
  if (textArea.dataset.enterHijacked === 'true') {
    return; // 既にアタッチ済み
  }
  
  // ★ キャプチャフェーズ (true) で登録
  textArea.addEventListener('keydown', handleNblmKeyDown, true);
  textArea.dataset.enterHijacked = 'true';
}

/**
 * NotebookLMのEnterキーのリスナーを解除する（設定OFF時用）
 */
function removeNblmEnterKeyHijack() {
  const textArea = document.querySelector(NBLM_TEXT_AREA_SELECTOR);
  if (textArea && textArea.dataset.enterHijacked === 'true') {
    textArea.removeEventListener('keydown', handleNblmKeyDown, true);
    textArea.dataset.enterHijacked = 'false';
  }
}

// --- メイン監視ロジック ---


/**
 * ページのDOMの変更を監視し、ターゲット要素が現れたら処理を実行します
 */
const observer = new MutationObserver((mutationsList, obs) => {
  
  // --- 機能3: Enterキーの動作変更 (NotebookLM) ---
  if (settings.notebooklmEnterKey) {
    const nblmTextArea = document.querySelector(NBLM_TEXT_AREA_SELECTOR);
    if (nblmTextArea) {
      setupNblmEnterKeyHijack(nblmTextArea);
    }
  }

  // --- 機能1 & 2 (Studioパネル関連) ---
  const targetElement = document.querySelector(TARGET_SELECTOR);
  if (!targetElement) {
    // ターゲットが消えた (ページ遷移など)
    unwrapDetails();
    return;
  }

  // --- 機能1: Studioボタンの動作改善 ---
  if (settings.hijackClicks) {
    hijackArtifactButtonClicks(targetElement);
  }

  // --- 機能2: Studioパネルの開閉機能 ---
  const detailsWrapper = document.querySelector('.enhancer-details-wrapper');

  if (settings.collapsibleStudio) {
    // [設定ON]
    if (!detailsWrapper) {
      // まだラップされていない -> ラップする
      if (heightObserver) {
        heightObserver.disconnect();
        heightObserver = null;
      }
      wrapWithDetails(targetElement);
      return; // DOM移動のため、ここで終了
    }

    // ★ テクニカルな箇所: ラップ済みだが、中身が入れ替わったかチェック (DOM再描画時)
    const contentWrapper = detailsWrapper.querySelector('.details-content-wrapper');
    if (contentWrapper && !contentWrapper.contains(targetElement)) {
      // 中身だけを新しいものに入れ替える
      while (contentWrapper.firstChild) {
        contentWrapper.removeChild(contentWrapper.firstChild);
      }
      contentWrapper.appendChild(targetElement);
    }
  } else {
    // [設定OFF]
    if (detailsWrapper) {
      // ラップが存在する -> 解除する
      unwrapDetails();
    }
  }
});

// 監視を開始
observer.observe(document.body, {
  childList: true,
  subtree: true
});


// --- 機能4: 同期自動化 ---

/**
 * 指定された時間だけ処理を待機するユーティリティ関数
 * @param {number} ms - 待機時間（ミリ秒）
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTMLエスケープ関数 (XSS対策)
 * 結果レポート表示時のDOM-based XSSを防ぐため、文字列に含まれる特殊文字を実体参照に変換します。
 * @param {string} unsafe - エスケープ前の文字列
 * @returns {string} エスケープ後の文字列
 */
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- カスタムUI制御関数 ---

/**
 * 全画面オーバーレイ（進捗表示）を作成・表示します。
 * ユーザーによる誤操作を防ぐために画面をブロックし、処理の進捗状況を可視化します。
 * @param {number} total - 処理対象のソース総数
 */
function showProgressOverlay(total) {
  injectStyles();
  let overlay = document.getElementById('enhancer-progress-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'enhancer-progress-overlay';
    overlay.className = 'enhancer-overlay';
    
    // i18n対応メッセージの取得
    const titleText = chrome.i18n.getMessage("syncingModalTitle");
    const initText = chrome.i18n.getMessage("syncingStatusInitializing");
    const warningText = chrome.i18n.getMessage("syncingOverlayWarning");

    overlay.innerHTML = `
      <div class="enhancer-modal-card">
        <div class="enhancer-title">${titleText}</div>
        <div class="enhancer-spinner"></div>
        <div class="enhancer-progress-text">
          <span id="enhancer-progress-status">${initText}</span>
          <span id="enhancer-progress-count">0/${total}</span>
        </div>
        <div class="enhancer-progress-container">
          <div id="enhancer-progress-bar" class="enhancer-progress-bar"></div>
        </div>
        <div class="enhancer-text" style="font-size: 0.8rem; margin-bottom:0;">${warningText}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // アニメーション用に少し遅らせてクラスを付与
    requestAnimationFrame(() => overlay.classList.add('active'));
  }
}

/**
 * オーバーレイ上の進捗状況（ステータス、件数、バー）を更新します。
 * @param {number} current - 現在処理中のインデックス（1始まり）
 * @param {number} total - 総件数
 * @param {string} currentSourceName - 現在処理中のソース名
 */
function updateProgress(current, total, currentSourceName) {
  const overlay = document.getElementById('enhancer-progress-overlay');
  if (overlay) {
    const statusEl = document.getElementById('enhancer-progress-status');
    const countEl = document.getElementById('enhancer-progress-count');
    const barEl = document.getElementById('enhancer-progress-bar');
    
    if (statusEl) {
      // レイアウト崩れを防ぐため、長いソース名は末尾を省略して表示
      const MAX_LENGTH = 30; 
      let displayName = currentSourceName;
      if (displayName.length > MAX_LENGTH) {
        displayName = displayName.substring(0, MAX_LENGTH) + '...';
      }
      const prefix = chrome.i18n.getMessage("syncingStatusProcessing");
      statusEl.textContent = `${prefix}${displayName}`;
    }

    if (countEl) countEl.textContent = `${current}/${total}`;
    
    if (barEl) {
      const percent = Math.min(100, Math.round((current / total) * 100));
      barEl.style.width = `${percent}%`;
    }
  }
}

/**
 * 進捗表示オーバーレイを非表示にし、DOMから削除します。
 */
function hideProgressOverlay() {
  const overlay = document.getElementById('enhancer-progress-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    // フェードアウトアニメーション後に削除
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * 結果レポートまたは通知用のカスタムモーダルを表示します。
 * window.alert の代わりに使用され、拡張機能のデザインに統一されたUIを提供します。
 * @param {string} title - モーダルのタイトル
 * @param {string} contentHTML - モーダル内のコンテンツ（HTML形式）
 * @param {string} [buttonText] - ボタンのラベル（省略時はi18nから"OK"を取得）
 */
function showCustomModal(title, contentHTML, buttonText) {
  injectStyles();
  const overlayId = 'enhancer-result-overlay';
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();

  // ボタンテキストが未指定ならデフォルト値を使用
  const safeButtonText = buttonText || chrome.i18n.getMessage("modalButtonOk");

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'enhancer-overlay active';
  overlay.innerHTML = `
    <div class="enhancer-modal-card">
      <div class="enhancer-title">${title}</div>
      <div class="enhancer-text" style="text-align: left; margin-bottom: 20px;">
        ${contentHTML}
      </div>
      <button id="enhancer-modal-btn" class="enhancer-btn">${safeButtonText}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // ボタンクリックで閉じる処理
  document.getElementById('enhancer-modal-btn').addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  });
}

/**
 * 汎用的なアラートモーダルを表示するラッパー関数
 * @param {string} message - 表示するメッセージ
 */
function showCustomAlert(message) {
  showCustomModal("Enhancer 4 Google", `<p style="text-align:center;">${message}</p>`);
}

// --- メイン処理ロジック ---

// オプションページからの実行命令を待ち受けるリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_ALL_SOURCES") {
    debugLog("同期リクエストを受信しました。");
    processAllSources().then(() => {
      debugLog("同期処理が完了しました。");
      sendResponse({ status: "completed" });
    });
    return true; // 非同期レスポンスのためにtrueを返す
  }
});

/**
 * 詳細画面の「閉じるボタン」を探索する関数
 * mattooltip属性、またはアイコンテキストから特定します。
 * @returns {HTMLElement | null} 見つかったボタン要素、またはnull
 */
function findCloseButton() {
  // 1. mattooltip 属性で探す（最も確実）
  let btn = document.querySelector('button[mattooltip="ソース表示を閉じる"]');
  if (btn) return btn;
  
  // 2. アイコンのテキストで探す（フォールバック）
  const allIcons = document.querySelectorAll('mat-icon');
  for (const icon of allIcons) {
    if (icon.textContent.trim() === 'collapse_content') {
      return icon.closest('button');
    }
  }
  return null;
}

/**
 * 詳細画面のロード完了（閉じるボタンの出現）を待機する関数
 * @returns {Promise<boolean>} ロード完了ならtrue、タイムアウトならfalse
 */
async function waitForDetailViewLoad() {
  let maxRetries = 40; // 0.1s * 40 = 4秒待機
  while (maxRetries > 0) {
    if (findCloseButton()) {
      return true;
    }
    await delay(100);
    maxRetries--;
  }
  return false;
}

/**
 * 同期ボタンを探し、クリック可能になるまで待機してクリックを実行する関数
 * @param {string} sourceName - ログ出力用のソース名
 * @returns {Promise<boolean>} 同期を実行した場合はtrue、スキップした場合はfalse
 */
async function findAndClickSyncButton(sourceName) {
  let maxRetries = 20; // 0.1s * 20 = 2秒待機
  while (maxRetries > 0) {
    const interactiveBtn = document.querySelector('.source-refresh.source-refresh--interactive');
    
    // クリック可能な同期ボタンが見つかった場合
    if (interactiveBtn) {
       if (interactiveBtn.innerText.includes("Google")) {
         debugLog(`${sourceName}: 同期ボタンをクリック。`);
         interactiveBtn.click();
         await waitForSyncCompletion();
         return true; // 同期実行
       } else {
         debugLog(`${sourceName}: 条件不一致（ドライブ同期以外）のためスキップ。`);
         return false;
       }
    }
    
    // 同期ボタン自体が存在しない場合（同期不要なソース）
    if (!document.querySelector('.source-refresh')) {
        return false;
    }
    
    // ボタンはあるがクリック不可の状態 -> 少し待つ
    await delay(100);
    maxRetries--;
  }
  return false;
}

/**
 * 同期完了（"完了"テキストの表示、またはボタン状態の変化）を待機する関数
 */
async function waitForSyncCompletion() {
  let isSyncing = true;
  let maxRetries = 60; // 0.5s * 60 = 30秒待機
  
  await delay(500); 
  
  while (isSyncing && maxRetries > 0) {
    const syncingEl = document.querySelector('.source-refresh');
    
    if (!syncingEl) {
        isSyncing = false; // 要素が消えた
    } else if (syncingEl.innerText.includes("完了")) {
        isSyncing = false; // 完了テキスト確認
    } else if (syncingEl.classList.contains('source-refresh--interactive')) {
        isSyncing = false; // 再びクリック可能になった（エラー等）
    } else {
        await delay(500);
        maxRetries--;
    }
  }
  await delay(500); // 完了後の安定待機
}

/**
 * 詳細画面から一覧画面へ戻る関数
 * @returns {Promise<boolean>} 戻る処理が実行された場合はtrue
 */
async function returnToSourceList() {
  const closeButton = findCloseButton();
  if (closeButton) {
    closeButton.click();
    await delay(1000); // アニメーション待機
    return true;
  }
  return false;
}

/**
 * 全ソース同期のメイン実行フロー
 * ソース一覧を巡回し、詳細画面を開いて同期チェックを行います。
 */
async function processAllSources() {
  const initialSources = document.querySelectorAll('.single-source-container');
  const totalCount = initialSources.length;
  
  if (totalCount === 0) {
    showCustomAlert(chrome.i18n.getMessage("errorNoSourcesFound"));
    return;
  }

  // UIブロックと進捗表示の開始
  showProgressOverlay(totalCount);
  const originalTitle = document.title;
  document.title = chrome.i18n.getMessage("syncingModalTitle");

  // 更新されたソースを記録する配列
  const updatedSources = [];

  try {
    for (let i = 0; i < totalCount; i++) {
      // Stale Element対策: ループごとに最新のDOMを取得
      const currentSources = document.querySelectorAll('.single-source-container');
      const sourceItem = currentSources[i];
      if (!sourceItem) continue;

      const titleEl = sourceItem.querySelector('.source-title');
      const sourceName = titleEl ? titleEl.innerText.trim() : `Source ${i+1}`;
      
      // 進捗バーの更新
      updateProgress(i + 1, totalCount, sourceName);
      
      // 対象ソースをクリックして詳細画面へ遷移
      sourceItem.scrollIntoView({ behavior: "instant", block: "center" });
      await delay(200); 
      (titleEl || sourceItem).click();

      // 詳細画面のロード待ち
      const isLoaded = await waitForDetailViewLoad();
      
      if (isLoaded) {
        // 同期ボタンの確認とクリック
        const didSync = await findAndClickSyncButton(sourceName);
        if (didSync) {
          updatedSources.push(sourceName);
        }
        // 一覧に戻る
        await returnToSourceList();
      }
      
      await delay(500); // 次の処理への安定待機
    }
  } catch (e) {
    console.error(e);
    showCustomAlert(chrome.i18n.getMessage("errorGeneric", [e.message]));
  } finally {
    // 終了処理: タイトルを戻し、オーバーレイを消去
    document.title = originalTitle;
    hideProgressOverlay();

    // 結果レポートHTMLの作成
    let resultHTML = '';
    const resultTitle = chrome.i18n.getMessage("syncingResultTitle");

    if (updatedSources.length > 0) {
      // 更新ありの場合: 件数とリストを表示
      const headerText = chrome.i18n.getMessage("syncingResultHeader", [String(updatedSources.length)]);
      resultHTML += `<p>${headerText}</p>`;
      resultHTML += `<div class="enhancer-result-list">`;
      updatedSources.forEach(name => {
        // XSS対策: ソース名をエスケープして表示
        const safeName = escapeHtml(name);
        resultHTML += `
          <div class="enhancer-result-item">
            <span class="enhancer-result-icon">✔</span> ${safeName}
          </div>`;
      });
      resultHTML += `</div>`;
    } else {
      // 更新なしの場合
      resultHTML += `<p>${chrome.i18n.getMessage("syncingResultNone")}</p>`;
    }

    // 結果モーダルの表示（オーバーレイ消去のアニメーションを考慮して少し遅延）
    setTimeout(() => {
        showCustomModal(resultTitle, resultHTML);
    }, 400); 
  }
}