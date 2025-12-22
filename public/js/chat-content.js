/**
 * @file Enhancer 4 Google - Google Chat Content Script
 * @description Google ChatのUI改善（Enterキー挙動変更）を行うコンテンツスクリプトです。
 */

// 設定値の保持
let settings = {
  chatEnterKey: true,
  submitKeyModifier: 'shift'
};

/**
 * 拡張機能の設定を読み込み、必要に応じてリスナーを登録します。
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
 * 設定変更を監視し、動的に機能のON/OFFを切り替えます。
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  if (changes.chatEnterKey) {
    const newValue = changes.chatEnterKey.newValue;
    settings.chatEnterKey = newValue;
    if (newValue === true) {
      attachGlobalListener();
    } else {
      removeGlobalListener();
    }
  }
});

// Google Chatの入力エリアを特定するセレクタ（有償版/無償版など複数パターンに対応）
const CHAT_TEXT_AREA_SELECTOR = 'div.hj99tb.KRoqRc.editable[role="textbox"], div[jsname="yrriRe"][role="textbox"][contenteditable="true"]';
const CHAT_EDIT_TEXT_AREA_SELECTOR = 'textarea.Fm0tFe.P6Wwdb.sY2lae[role="textbox"]';

// 送信ボタンのセレクタ
const CHAT_SUBMIT_BUTTON_SELECTOR = 'button[jsname="GBTyxb"]:not([disabled])';
const CHAT_EDIT_SUBMIT_BUTTON_SELECTOR = 'button[jsname="WCwBae"]:not([disabled])';

/**
 * キー入力を傍受し、Enterキーの挙動を制御するメインハンドラ
 * @param {KeyboardEvent} event
 */
const handleGlobalKeyDown = (event) => {
  // 機能OFFまたはEnterキー以外は無視
  if (settings.chatEnterKey === false || event.key !== 'Enter') {
    return;
  }
  const target = event.target;
  
  // 入力エリア内でのイベントか判定
  const isMainChat = target.matches(CHAT_TEXT_AREA_SELECTOR);
  const isEditChat = target.matches(CHAT_EDIT_TEXT_AREA_SELECTOR);
  
  if (!isMainChat && !isEditChat) {
    return;
  }

  // OSに応じた修飾キーの判定 (MacならMeta/Command, WinならCtrl)
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  let isSubmitModifierPressed = false;

  if (settings.submitKeyModifier === 'ctrl') {
    isSubmitModifierPressed = isMac ? event.metaKey : event.ctrlKey;
  } else {
    isSubmitModifierPressed = event.shiftKey;
  }

  // 送信操作 (修飾キー + Enter)
  if (isSubmitModifierPressed) {
    event.preventDefault(); 
    event.stopImmediatePropagation(); 
    let submitButton = null;

    if (isMainChat) {
      submitButton = document.querySelector(CHAT_SUBMIT_BUTTON_SELECTOR);
    } else if (isEditChat) {
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
    // 改行操作 (Enterのみ)
    // デフォルトの送信を防ぎ、改行を挿入する
    event.preventDefault(); 
    event.stopImmediatePropagation(); 
    
    if (isMainChat) {
      document.execCommand('insertLineBreak');
    } else if (isEditChat) {
      // textareaの場合は値操作で改行挿入
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      target.value = value.substring(0, start) + '\n' + value.substring(end);
      target.selectionStart = target.selectionEnd = start + 1;
    }
  }
};

/**
 * キャプチャフェーズで document.body にリスナーを登録し、サイト側のイベントより先に捕捉します。
 */
function attachGlobalListener() {
  if (!document.body) return;
  if (document.body.dataset.chatEnterHijacked === 'true') return;

  document.body.dataset.chatEnterHijacked = 'true';
  document.body.addEventListener('keydown', handleGlobalKeyDown, true);
}

/**
 * リスナーを解除します。
 */
function removeGlobalListener() {
  if (!document.body || !document.body.dataset.chatEnterHijacked) return;
  
  document.body.removeEventListener('keydown', handleGlobalKeyDown, true);
  document.body.dataset.chatEnterHijacked = 'false';
}

// 初期化
loadSettings();