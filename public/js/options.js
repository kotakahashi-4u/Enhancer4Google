/**
 * @file Enhancer 4 Google - Options Script
 * 拡張機能のオプションページ (options.html) のためのJavaScript。
 * - UIの国際化 (i18n)
 * - 設定の読み込み (restore) と保存 (save)
 * - Gemini幅設定の入力値検証
 */

/**
 * ページ上のi18n属性を持つ要素を、_localesフォルダのメッセージで翻訳します。
 */
function localizePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const messageName = el.dataset.i18n;
    const message = chrome.i18n.getMessage(messageName);
    if (message) {
      // ★ セキュアコーディング: innerHTMLではなくtextContentを使用し、XSSを防止
      el.textContent = message;
    }
  });
}

/**
 * 現在のフォームの状態を chrome.storage.sync に保存します。
 */
function saveOptions() {
  // NotebookLM
  const collapsible = document.getElementById('collapsibleStudio').checked;
  const hijack = document.getElementById('hijackClicks').checked;
  const nblmEnter = document.getElementById('notebooklmEnterKey').checked;
  
  // Gemini
  const geminiShortcuts = document.getElementById('geminiToolShortcuts').checked;
  const geminiEnter = document.getElementById('geminiEnterKey').checked;
  const geminiLayoutWidthEnabled = document.getElementById('geminiLayoutWidthEnabled').checked;
  const geminiLayoutWidthValue = document.getElementById('geminiLayoutWidthValue').value;

  // Google Chat
  const chatEnter = document.getElementById('chatEnterKey').checked;

  // 送信キー設定の取得
  const submitKey = document.getElementById('submitKeyModifier').value;

  chrome.storage.sync.set({
    collapsibleStudio: collapsible,
    hijackClicks: hijack,
    notebooklmEnterKey: nblmEnter,
    geminiToolShortcuts: geminiShortcuts,
    geminiEnterKey: geminiEnter,
    geminiLayoutWidthEnabled: geminiLayoutWidthEnabled,
    geminiLayoutWidthValue: geminiLayoutWidthValue,
    chatEnterKey: chatEnter,
    submitKeyModifier: submitKey
  }, () => {
    // 保存完了メッセージを表示
    const status = document.getElementById('statusMessage');
    status.style.opacity = '1';
    setTimeout(() => {
      status.style.opacity = '0';
    }, 1500);
  });
}

/**
 * chrome.storageから設定を読み込み、オプションページのUI（チェックボックス等）に反映します。
 */
function restoreOptions() {
  // デフォルト値
  chrome.storage.sync.get({
    collapsibleStudio: true,
    hijackClicks: true,
    notebooklmEnterKey: true,
    geminiToolShortcuts: true,
    geminiEnterKey: true,
    geminiLayoutWidthEnabled: false,
    geminiLayoutWidthValue: 1200,
    chatEnterKey: true,
    submitKeyModifier: 'shift'
  }, (items) => {
    // NotebookLM
    document.getElementById('collapsibleStudio').checked = items.collapsibleStudio;
    document.getElementById('hijackClicks').checked = items.hijackClicks;
    document.getElementById('notebooklmEnterKey').checked = items.notebooklmEnterKey;
    
    // Gemini
    document.getElementById('geminiToolShortcuts').checked = items.geminiToolShortcuts;
    document.getElementById('geminiEnterKey').checked = items.geminiEnterKey;
    document.getElementById('geminiLayoutWidthEnabled').checked = items.geminiLayoutWidthEnabled;
    document.getElementById('geminiLayoutWidthValue').value = items.geminiLayoutWidthValue;
    // 幅設定のトグルがOFFなら、数値入力を無効化
    document.getElementById('geminiLayoutWidthValue').disabled = !items.geminiLayoutWidthEnabled;

    // Googleチャット 
    document.getElementById('chatEnterKey').checked = items.chatEnterKey;

    // 送信キー設定の反映
    document.getElementById('submitKeyModifier').value = items.submitKeyModifier;
  });
}

/**
 * Geminiカスタム幅の数値入力(input[type="number"])を検証し、保存します。
 * (change イベントで発火)
 * @param {Event} event
 */
function handleWidthInput(event) {
  // ★ セキュアコーディング: CSSインジェクションを防ぐため、
  // ユーザー入力を厳格に数値としてパースし、範囲内に丸める。
  let value = parseInt(event.target.value, 10);
  const min = parseInt(event.target.min, 10);
  const max = parseInt(event.target.max, 10);

  if (isNaN(value)) {
    value = min; // 不正な入力(文字列など)は最小値に
  }
  
  // 最小・最大範囲内に収める
  if (value < min) {
    value = min;
  } else if (value > max) {
    value = max;
  }
  
  event.target.value = value; // 補正した値をUIに反映
  saveOptions(); // 補正後に保存
}

// ページ読み込みが完了したら実行
document.addEventListener('DOMContentLoaded', () => {
  localizePage();
  restoreOptions();
  
  // --- すべての設定変更イベントに saveOptions を紐付け ---
  
  // NotebookLM
  document.getElementById('collapsibleStudio').addEventListener('change', saveOptions);
  document.getElementById('hijackClicks').addEventListener('change', saveOptions);
  document.getElementById('notebooklmEnterKey').addEventListener('change', saveOptions);

  // Gemini
  document.getElementById('geminiToolShortcuts').addEventListener('change', saveOptions);
  document.getElementById('geminiEnterKey').addEventListener('change', saveOptions);
  
  const widthToggle = document.getElementById('geminiLayoutWidthEnabled');
  const widthValueInput = document.getElementById('geminiLayoutWidthValue');

  // 幅設定のトグル変更時
  widthToggle.addEventListener('change', (event) => {
    widthValueInput.disabled = !event.target.checked; // ON/OFFで入力欄を有効/無効化
    saveOptions();
  });
  
  // 幅設定の数値変更時 (入力完了時 = changeイベント)
  widthValueInput.addEventListener('change', handleWidthInput);

  // Google Chat
  document.getElementById('chatEnterKey').addEventListener('change', saveOptions);

  // 送信キー変更時にも保存を実行
  document.getElementById('submitKeyModifier').addEventListener('change', saveOptions);
});