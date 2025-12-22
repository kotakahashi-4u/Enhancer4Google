/**
 * @file Enhancer 4 Google - NotebookLM Content Script
 * @description NotebookLMのUI改善（Studioパネル開閉、ボタン動作変更、Enterキー、同期）を行います。
 */

const TARGET_SELECTOR = '.create-artifact-buttons-container';
const STYLE_ID = 'notebooklm-enhancer-styles';
const NBLM_TEXT_AREA_SELECTOR = 'textarea.query-box-input';
const NBLM_SUBMIT_BUTTON_SELECTOR = 'button.submit-button:not([disabled])';

let settings = {
  collapsibleStudio: true,
  hijackClicks: true,
  notebooklmEnterKey: true,
  submitKeyModifier: 'shift'
};

function debugLog(message, ...args) {
  console.log(`%c[Enhancer Debug] ${message}`, 'color: #00ff00; font-weight: bold;', ...args);
}

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

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  loadSettings(); 
  if (changes.notebooklmEnterKey && changes.notebooklmEnterKey.newValue === false) {
    removeNblmEnterKeyHijack();
  }
  if (changes.collapsibleStudio && changes.collapsibleStudio.newValue === false) {
    unwrapDetails();
  }
});

loadSettings();

// スタイル注入（開閉矢印、モーダルなど）
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
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
    .summary-icon::before, .summary-icon::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1rem;
      height: 1.5px;
      border-radius: 2px;
      background-color: var(--mat-sys-on-background);
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
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

    :root {
      --enhancer-theme: #1BA1E3;
      --enhancer-bg: #ffffff;
      --enhancer-text: #2c3e50;
      --enhancer-overlay-bg: rgba(255, 255, 255, 0.55);
    }
    .enhancer-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
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
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
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
    @keyframes enhancer-spin {
      to {
        transform: rotate(360deg);
      }
    }
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
      white-space: nowrap;
    }
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
    .enhancer-result-item:last-child {
      border-bottom: none;
    }
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

let heightObserver = null; 

/**
 * Studioパネル（生成ボタン群）を <details> タグでラップし、開閉可能にします。
 */
function wrapWithDetails(targetElement) {
  injectStyles();
  const details = document.createElement('details');
  details.className = 'enhancer-details-wrapper';
  details.open = true; // デフォルトは開いた状態
  
  const summary = document.createElement('summary');
  summary.className = 'custom-summary';
  summary.style.marginLeft = '.85rem';
  summary.style.fontSize = '.9rem';
  summary.style.padding = '8px 0';
  
  const icon = document.createElement('span');
  icon.className = 'summary-icon';
  summary.appendChild(icon);
  summary.append(chrome.i18n.getMessage("featuresLabel")); 
  
  details.prepend(summary);
  
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'details-content-wrapper';
  details.appendChild(contentWrapper);
  
  targetElement.parentNode.insertBefore(details, targetElement);
  contentWrapper.appendChild(targetElement);

  // 開閉アニメーションのロジック
  let isAnimating = false;
  
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    isAnimating = true;
    if (!details.open) {
      details.open = true;
      requestAnimationFrame(() => {
        contentWrapper.style.maxHeight = contentWrapper.scrollHeight + 'px';
      });
    } else {
      contentWrapper.style.maxHeight = '0px';
    }
    contentWrapper.addEventListener('transitionend', () => {
      isAnimating = false;
      if (details.open && contentWrapper.style.maxHeight === '0px') {
          details.open = false;
      }
    }, { once: true });
  });

  // コンテンツの高さが変わった場合に追従する
  heightObserver = new ResizeObserver(entries => {
    if (isAnimating) return;
    const wrapper = entries[0].target;
    const newHeight = wrapper.scrollHeight;
    if (details.open && wrapper.style.maxHeight !== newHeight + 'px') {
      wrapper.style.maxHeight = newHeight + 'px';
    }
  });
  heightObserver.observe(contentWrapper);
}

/**
 * 生成ボタンのクリックイベントを乗っ取り、強制的に編集モードを開きます。
 */
function hijackArtifactButtonClicks(artifactButtonsContainer) {
  if (artifactButtonsContainer.dataset.clickHijacked === 'true') return;
  artifactButtonsContainer.dataset.clickHijacked = 'true';
  
  artifactButtonsContainer.addEventListener('click', (e) => {
    const basicButton = e.target.closest('basic-create-artifact-button');
    if (!basicButton) return;
    if (e.target.closest('.edit-button')) return; // 既に編集ボタンを押した場合は除外

    // 通常のクリックイベントを止め、内部の編集ボタンをクリックする
    const mainButtonContainer = e.target.closest('.create-artifact-button-container');
    if (mainButtonContainer) {
      const editButton = basicButton.querySelector('.edit-button');
      if (editButton) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        editButton.click();
      }
    }
  }, true); // キャプチャフェーズで実行
}

function unwrapDetails() {
  const detailsWrapper = document.querySelector('.enhancer-details-wrapper');
  if (!detailsWrapper) return;
  
  const contentWrapper = detailsWrapper.querySelector('.details-content-wrapper');
  const targetElement = document.querySelector(TARGET_SELECTOR);
  
  if (targetElement && contentWrapper && contentWrapper.contains(targetElement)) {
    detailsWrapper.parentNode.insertBefore(targetElement, detailsWrapper);
    detailsWrapper.parentNode.removeChild(detailsWrapper);
    if (heightObserver) {
      heightObserver.disconnect();
      heightObserver = null;
    }
  }
}

/**
 * Enterキーのハンドラ
 */
const handleNblmKeyDown = (event) => {
  if (settings.notebooklmEnterKey === false) return;
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

    const submitButton = document.querySelector(NBLM_SUBMIT_BUTTON_SELECTOR);
    if (submitButton) {
      submitButton.click();
    } else {
      console.warn('Enhancer4Google (NotebookLM): Could not find submit button.');
    }
  } else {
    // 改行（デフォルト動作）
    event.stopImmediatePropagation();
  }
};

function setupNblmEnterKeyHijack(textArea) {
  if (textArea.dataset.enterHijacked === 'true') return;
  textArea.addEventListener('keydown', handleNblmKeyDown, true);
  textArea.dataset.enterHijacked = 'true';
}

function removeNblmEnterKeyHijack() {
  const textArea = document.querySelector(NBLM_TEXT_AREA_SELECTOR);
  if (textArea && textArea.dataset.enterHijacked === 'true') {
    textArea.removeEventListener('keydown', handleNblmKeyDown, true);
    textArea.dataset.enterHijacked = 'false';
  }
}

const observer = new MutationObserver((mutationsList, obs) => {
  if (settings.notebooklmEnterKey) {
    const nblmTextArea = document.querySelector(NBLM_TEXT_AREA_SELECTOR);
    if (nblmTextArea) setupNblmEnterKeyHijack(nblmTextArea);
  }

  const targetElement = document.querySelector(TARGET_SELECTOR);
  if (!targetElement) {
    unwrapDetails();
    return;
  }

  if (settings.hijackClicks) hijackArtifactButtonClicks(targetElement);

  const detailsWrapper = document.querySelector('.enhancer-details-wrapper');
  if (settings.collapsibleStudio) {
    if (!detailsWrapper) {
      if (heightObserver) {
        heightObserver.disconnect();
        heightObserver = null;
      }
      wrapWithDetails(targetElement);
      return;
    }
    const contentWrapper = detailsWrapper.querySelector('.details-content-wrapper');
    if (contentWrapper && !contentWrapper.contains(targetElement)) {
      while (contentWrapper.firstChild) contentWrapper.removeChild(contentWrapper.firstChild);
      contentWrapper.appendChild(targetElement);
    }
  } else {
    if (detailsWrapper) unwrapDetails();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 全ソース同期機能 ---

function showProgressOverlay(total) {
  injectStyles();
  let overlay = document.getElementById('enhancer-progress-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'enhancer-progress-overlay';
    overlay.className = 'enhancer-overlay';
    
    const card = document.createElement('div');
    card.className = 'enhancer-modal-card';
    
    // UI構築（innerHTMLを使わずセキュアに）
    const title = document.createElement('div');
    title.className = 'enhancer-title';
    title.textContent = chrome.i18n.getMessage("syncingModalTitle");
    
    const spinner = document.createElement('div');
    spinner.className = 'enhancer-spinner';
    
    const textDiv = document.createElement('div');
    textDiv.className = 'enhancer-progress-text';
    
    const statusSpan = document.createElement('span');
    statusSpan.id = 'enhancer-progress-status';
    statusSpan.textContent = chrome.i18n.getMessage("syncingStatusInitializing");
    
    const countSpan = document.createElement('span');
    countSpan.id = 'enhancer-progress-count';
    countSpan.textContent = `0/${total}`;
    
    textDiv.appendChild(statusSpan);
    textDiv.appendChild(countSpan);
    
    const progressContainer = document.createElement('div');
    progressContainer.className = 'enhancer-progress-container';
    
    const progressBar = document.createElement('div');
    progressBar.id = 'enhancer-progress-bar';
    progressBar.className = 'enhancer-progress-bar';
    
    progressContainer.appendChild(progressBar);
    
    const warningText = document.createElement('div');
    warningText.className = 'enhancer-text';
    warningText.style.fontSize = '0.8rem';
    warningText.style.marginBottom = '0';
    warningText.textContent = chrome.i18n.getMessage("syncingOverlayWarning");
    
    card.appendChild(title);
    card.appendChild(spinner);
    card.appendChild(textDiv);
    card.appendChild(progressContainer);
    card.appendChild(warningText);
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => overlay.classList.add('active'));
  }
}

function updateProgress(current, total, currentSourceName) {
  const overlay = document.getElementById('enhancer-progress-overlay');
  if (overlay) {
    const statusEl = document.getElementById('enhancer-progress-status');
    const countEl = document.getElementById('enhancer-progress-count');
    const barEl = document.getElementById('enhancer-progress-bar');
    
    if (statusEl) {
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

function hideProgressOverlay() {
  const overlay = document.getElementById('enhancer-progress-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

function showCustomModal(title, contentFragment, buttonText) {
  injectStyles();
  const overlayId = 'enhancer-result-overlay';
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'enhancer-overlay active';
  
  const card = document.createElement('div');
  card.className = 'enhancer-modal-card';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'enhancer-title';
  titleDiv.textContent = title;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'enhancer-text';
  contentDiv.style.textAlign = 'left';
  contentDiv.style.marginBottom = '20px';
  contentDiv.appendChild(contentFragment); 
  
  const button = document.createElement('button');
  button.id = 'enhancer-modal-btn';
  button.className = 'enhancer-btn';
  button.textContent = buttonText || chrome.i18n.getMessage("modalButtonOk");
  
  button.addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  });
  
  card.appendChild(titleDiv);
  card.appendChild(contentDiv);
  card.appendChild(button);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function showCustomAlert(message) {
  const fragment = document.createDocumentFragment();
  const p = document.createElement('p');
  p.style.textAlign = 'center';
  p.textContent = message;
  fragment.appendChild(p);
  showCustomModal("Enhancer 4 Google", fragment);
}

// バックグラウンド等からのメッセージ受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_ALL_SOURCES") {
    debugLog("同期リクエストを受信しました。");
    processAllSources().then(() => {
      debugLog("同期処理が完了しました。");
      sendResponse({ status: "completed" });
    });
    return true; // 非同期応答を示す
  }
});

/**
 * 閉じるボタンを探す関数（ロケール非依存）
 */
function findCloseButton() {
  // アイコン名 "collapse_content" を持つ要素を探す
  const allIcons = document.querySelectorAll('mat-icon');
  for (const icon of allIcons) {
    if (icon.textContent.trim() === 'collapse_content') {
      return icon.closest('button');
    }
  }
  return null;
}

// 詳細ビューのロード完了を待機
async function waitForDetailViewLoad() {
  let maxRetries = 40;
  while (maxRetries > 0) {
    if (findCloseButton()) return true;
    await delay(100);
    maxRetries--;
  }
  return false;
}

// 同期ボタンを探してクリック
async function findAndClickSyncButton(sourceName) {
  let maxRetries = 20; 
  while (maxRetries > 0) {
    const interactiveBtn = document.querySelector('.source-refresh.source-refresh--interactive');
    if (interactiveBtn) {
       // "Google"というテキストが含まれているか（ドライブ同期であることを確認）
       if (interactiveBtn.innerText.includes("Google")) {
         debugLog(`${sourceName}: 同期ボタンをクリック。`);
         interactiveBtn.click();
         await waitForSyncCompletion();
         return true;
       } else {
         debugLog(`${sourceName}: 条件不一致（ドライブ同期以外）のためスキップ。`);
         return false;
       }
    }
    // 同期ボタン自体が見つからない場合
    if (!document.querySelector('.source-refresh')) return false;
    await delay(100);
    maxRetries--;
  }
  return false;
}

// 同期完了（くるくるが終わる）を待機
async function waitForSyncCompletion() {
  let isSyncing = true;
  let maxRetries = 60; // 30秒タイムアウト
  await delay(500); 
  
  while (isSyncing && maxRetries > 0) {
    const syncingEl = document.querySelector('.source-refresh');
    
    if (!syncingEl) {
      // 要素自体がなくなった場合（画面遷移など）
      isSyncing = false; 
    } else if (syncingEl.classList.contains('source-refresh--interactive')) {
      // インタラクティブな状態（＝クリック可能）に戻ったら完了とみなす
      isSyncing = false; 
    } else {
      // まだ同期中（スピナー回転中など）
      await delay(500);
      maxRetries--;
    }
  }
  await delay(500);
}

async function returnToSourceList() {
  const closeButton = findCloseButton();
  if (closeButton) {
    closeButton.click();
    await delay(1000);
    return true;
  }
  return false;
}

/**
 * 全ソース同期のメインロジック
 */
async function processAllSources() {
  const initialSources = document.querySelectorAll('.single-source-container');
  const totalCount = initialSources.length;
  
  if (totalCount === 0) {
    showCustomAlert(chrome.i18n.getMessage("errorNoSourcesFound"));
    return;
  }

  showProgressOverlay(totalCount);
  const originalTitle = document.title;
  document.title = chrome.i18n.getMessage("syncingModalTitle");

  const updatedSources = [];

  try {
    for (let i = 0; i < totalCount; i++) {
      // DOMが書き換わっている可能性があるため再取得
      const currentSources = document.querySelectorAll('.single-source-container');
      const sourceItem = currentSources[i];
      if (!sourceItem) continue;

      const titleEl = sourceItem.querySelector('.source-title');
      const sourceName = titleEl ? titleEl.innerText.trim() : `Source ${i+1}`;
      
      updateProgress(i + 1, totalCount, sourceName);
      
      // スクロールしてクリック（画面外だと反応しないことがあるため）
      sourceItem.scrollIntoView({ behavior: "instant", block: "center" });
      await delay(200); 
      (titleEl || sourceItem).click();

      const isLoaded = await waitForDetailViewLoad();
      
      if (isLoaded) {
        const didSync = await findAndClickSyncButton(sourceName);
        if (didSync) updatedSources.push(sourceName);
        await returnToSourceList();
      }
      
      await delay(500); 
    }
  } catch (e) {
    console.error(e);
    showCustomAlert(chrome.i18n.getMessage("errorGeneric", [e.message]));
  } finally {
    document.title = originalTitle;
    hideProgressOverlay();

    // 結果レポート作成
    const resultFragment = document.createDocumentFragment();
    const resultTitle = chrome.i18n.getMessage("syncingResultTitle");

    if (updatedSources.length > 0) {
      const p = document.createElement('p');
      p.textContent = chrome.i18n.getMessage("syncingResultHeader", [String(updatedSources.length)]);
      resultFragment.appendChild(p);

      const listDiv = document.createElement('div');
      listDiv.className = 'enhancer-result-list';

      updatedSources.forEach(name => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'enhancer-result-item';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'enhancer-result-icon';
        iconSpan.textContent = '✔';
        
        const textNode = document.createTextNode(` ${name}`);
        
        itemDiv.appendChild(iconSpan);
        itemDiv.appendChild(textNode);
        listDiv.appendChild(itemDiv);
      });
      resultFragment.appendChild(listDiv);
    } else {
      const p = document.createElement('p');
      p.textContent = chrome.i18n.getMessage("syncingResultNone");
      resultFragment.appendChild(p);
    }

    setTimeout(() => {
        showCustomModal(resultTitle, resultFragment);
    }, 400); 
  }
}