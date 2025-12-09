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