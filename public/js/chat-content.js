/**
 * @file Enhancer 4 Google - Google Chat Content Script
 * Google Chat (chat.google.com) のUIを改善する機能を提供します。
 * - Enterキーの動作変更 (Enterで改行、Shift+Enterで送信)
 */

// --- 設定管理 ---
let settings = {
  chatEnterKey: true,
  submitKeyModifier: 'shift'
};

/**
 * 拡張機能の設定を chrome.storage.sync から読み込みます。
 */
function loadSettings() {
  chrome.storage.sync.get({
    chatEnterKey: true,
    submitKeyModifier: 'shift'
  }, (items) => {
    settings = items;
    if (settings.chatEnterKey) {
      attachGlobalListener();
    }
  });
}

/**
 * chrome.storage の変更を監視し、設定が変更された場合にリスナーを動的にON/OFFします。
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  if (changes.chatEnterKey) {
    const newValue = changes.chatEnterKey.newValue;
    settings.chatEnterKey = newValue;
    if (newValue === true) {
      attachGlobalListener(); // ONになったらアタッチ
    } else {
      removeGlobalListener(); // OFFになったらデタッチ
    }
  }
});

// --- DOMセレクタ ---
// ★ テクニカルな箇所: Google Chatは有償版と無償版でDOMが異なるため、
// 両方のセレクタに一致するようカンマ(,)で区切る
const CHAT_TEXT_AREA_SELECTOR = 'div.hj99tb.KRoqRc.editable[role="textbox"], div[jsname="yrriRe"][role="textbox"][contenteditable="true"]';
const CHAT_EDIT_TEXT_AREA_SELECTOR = 'textarea.Fm0tFe.P6Wwdb.sY2lae[role="textbox"]';

const CHAT_SUBMIT_BUTTON_SELECTOR = 'button[jsname="GBTyxb"]:not([disabled])';
const CHAT_EDIT_SUBMIT_BUTTON_SELECTOR = 'button[jsname="WCwBae"]:not([disabled])'; // (編集ボタン)

/**
 * ページ(iframe)全体のキー入力を傍受（キャプチャ）するメインのイベントハンドラ。
 * @param {KeyboardEvent} event
 */
const handleGlobalKeyDown = (event) => {
  if (settings.chatEnterKey === false || event.key !== 'Enter') {
    return;
  }
  const target = event.target;
  
  // メインのチャット欄か、編集中のチャット欄かを判定
  const isMainChat = target.matches(CHAT_TEXT_AREA_SELECTOR);
  const isEditChat = target.matches(CHAT_EDIT_TEXT_AREA_SELECTOR);
  
  if (!isMainChat && !isEditChat) {
    return; // 関係ない場所でのEnterキーは無視
  }

  const isSubmitModifierPressed = settings.submitKeyModifier === 'ctrl' ? event.ctrlKey : event.shiftKey;

  if (isSubmitModifierPressed) {
    // --- Shift + Enter の場合 (送信) ---
    event.preventDefault(); // デフォルトの改行をキャンセル
    event.stopImmediatePropagation(); // 他のリスナーを止める
    let submitButton = null;

    if (isMainChat) {
      submitButton = document.querySelector(CHAT_SUBMIT_BUTTON_SELECTOR);
    } else if (isEditChat) {
      // 編集中のダイアログは c-wiz の中にある
      const editDialog = target.closest('c-wiz');
      if (editDialog) {
        submitButton = editDialog.querySelector(CHAT_EDIT_SUBMIT_BUTTON_SELECTOR);
      }
    }
    
    if (submitButton) {
      submitButton.click();
    } else {
      console.warn('Enhancer4Google (Google Chat): Could not find submit/save button.');
    }
  } else {
    // --- Enter のみの場合 (改行) ---
    event.preventDefault(); // デフォルトの送信動作をキャンセル
    event.stopImmediatePropagation(); // 他のリスナー（Chatネイティブ）を止める
    
    if (isMainChat) {
      // ★ テクニカルな箇所: メインの入力欄 (contenteditable="true") で改行を挿入する唯一の方法。
      // このAPIは非推奨だが、ChatのリッチテキストUIではこれが必要。
      document.execCommand('insertLineBreak');
    } else if (isEditChat) {
      // 編集欄は通常の <textarea> なので、手動で改行を挿入できる
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      target.value = value.substring(0, start) + '\n' + value.substring(end);
      target.selectionStart = target.selectionEnd = start + 1;
    }
  }
};

/**
 * グローバルキーリスナーを document.body にアタッチします。
 * (Chatはiframe内で動作するため、bodyへのアタッチが最も堅牢)
 */
function attachGlobalListener() {
  if (!document.body) {
    return;
  }
  // 二重アタッチを防止
  if (document.body.dataset.chatEnterHijacked === 'true') {
    return;
  }
  document.body.dataset.chatEnterHijacked = 'true';
  // ★ キャプチャフェーズ (true) で登録し、Chatのリスナーより先に実行
  document.body.addEventListener('keydown', handleGlobalKeyDown, true);
}

/**
 * グローバルキーリスナーを document.body から解除します。
 */
function removeGlobalListener() {
  if (!document.body || !document.body.dataset.chatEnterHijacked) {
    return;
  }
  document.body.removeEventListener('keydown', handleGlobalKeyDown, true);
  document.body.dataset.chatEnterHijacked = 'false';
}

// --- 初期化 ---
loadSettings();