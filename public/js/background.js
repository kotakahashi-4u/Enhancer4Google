/**
 * @file Enhancer 4 Google - Background Service Worker
 * @description NotebookLMの同期スケジューラー機能（定期実行）を管理・実行するバックグラウンドスクリプトです。
 */

// アラーム名のプレフィックス
const ALARM_PREFIX = "nblm-sync-task-";

/**
 * 指定されたタスク設定に基づき、次の実行日時(timestamp)を計算します。
 * @param {Object} task - タスク設定オブジェクト
 * @returns {number} 次回実行時のタイムスタンプ
 */
function calculateNextRun(task) {
  const now = new Date();
  let target = new Date(now);
  
  // 秒・ミリ秒は0に揃えて精度を調整
  target.setSeconds(0);
  target.setMilliseconds(0);

  // 1時間ごとの場合
  if (task.type === 'hourly') {
    return now.getTime() + 60 * 60 * 1000;
  }

  // 時間指定がある場合、ターゲットの時間をセット
  if (task.time) {
    const [h, m] = task.time.split(':').map(Number);
    target.setHours(h, m, 0, 0);
  }

  // 実行頻度に応じた日付計算
  if (task.type === 'daily') {
    // 設定時刻が過去なら明日に設定
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
  } 
  else if (task.type === 'weekly') {
    // 指定曜日まで進める
    const currentDay = target.getDay();
    const targetDay = task.day; // 0:日曜 - 6:土曜
    let daysToAdd = (targetDay + 7 - currentDay) % 7;
    
    // 今日が指定曜日かつ時間が過ぎている場合は来週へ
    if (daysToAdd === 0 && target <= now) {
      daysToAdd = 7;
    }
    target.setDate(target.getDate() + daysToAdd);
  } 
  else if (task.type === 'monthly') {
    // 日付セット ("last"の場合は末日計算)
    if (task.date === 'last') {
      target.setMonth(target.getMonth() + 1, 0); 
    } else {
      target.setDate(parseInt(task.date, 10));
    }

    // 過去なら来月へ
    if (target <= now) {
      target = new Date(now); // リセット
      target.setHours(...task.time.split(':').map(Number));
      target.setSeconds(0); target.setMilliseconds(0);
      
      target.setMonth(target.getMonth() + 1);
      
      if (task.date === 'last') {
        target.setMonth(target.getMonth() + 1, 0);
      } else {
        target.setDate(parseInt(task.date, 10));
      }
    }
  }

  return target.getTime();
}

/**
 * ストレージの設定に基づき、全てのアラームを再設定します。
 * (設定変更時やブラウザ起動時に呼び出されます)
 */
async function refreshAlarms() {
  const items = await chrome.storage.sync.get({ scheduledTasks: [] });
  const tasks = items.scheduledTasks;

  // 既存の関連アラームを全クリア
  const alarms = await chrome.alarms.getAll();
  for (const alarm of alarms) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  // タスクごとにアラームを再登録
  tasks.forEach((task) => {
    // URLからユニークなIDを生成
    const taskId = btoa(task.url).replace(/[^a-zA-Z0-9]/g, "").substring(0, 16); 
    const alarmName = `${ALARM_PREFIX}${taskId}`;
    
    if (task.type === 'hourly') {
      chrome.alarms.create(alarmName, { periodInMinutes: 60 });
    } else {
      const nextRun = calculateNextRun(task);
      console.log(`[Enhancer] 次回実行: ${new Date(nextRun).toLocaleString()} (${task.type})`);
      chrome.alarms.create(alarmName, { when: nextRun });
    }
  });
}

/**
 * アラーム発火時のイベントリスナー
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  // アラーム名から対象のタスクを特定
  const items = await chrome.storage.sync.get({ scheduledTasks: [] });
  const tasks = items.scheduledTasks;
  const targetTask = tasks.find(t => {
    const taskId = btoa(t.url).replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
    return `${ALARM_PREFIX}${taskId}` === alarm.name;
  });

  if (targetTask) {
    // 1. 同期処理の実行
    executeSync(targetTask);

    // 2. 次回スケジュールのセット (Hourly以外はワンショットなので再登録が必要)
    if (targetTask.type !== 'hourly') {
      const nextRun = calculateNextRun(targetTask);
      console.log(`[Enhancer] 次回予約: ${new Date(nextRun).toLocaleString()}`);
      chrome.alarms.create(alarm.name, { when: nextRun });
    }
  }
});

/**
 * 指定されたタスクの同期処理を実行します。
 * 必要に応じて新規タブを開き、同期完了後に閉じます。
 * @param {Object} task タスク設定オブジェクト
 */
async function executeSync(task) {
  const url = task.url;
  console.log(`[Enhancer] 同期実行開始: ${url}, 自動クローズ: ${task.autoClose}`);

  try {
    const tabs = await chrome.tabs.query({});
    // 既に開いているタブがあれば再利用する
    let targetTab = tabs.find(t => t.url && t.url.startsWith(url));
    let tabId = null;
    let isNewTab = false;

    if (targetTab) {
      console.log(`[Enhancer] 既存タブを使用: ID ${targetTab.id}`);
      tabId = targetTab.id;
      isNewTab = false;
    } else {
      console.log(`[Enhancer] 新規タブを作成`);
      // バックグラウンド(active: false)で開く
      const newTab = await chrome.tabs.create({ url: url, active: false });
      tabId = newTab.id;
      isNewTab = true;
      
      // 読み込み完了まで待機
      await waitForTabLoad(tabId);
    }

    // コンテンツスクリプトの準備時間を確保
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[Enhancer] コマンド送信...`);
    
    try {
      // コンテンツスクリプトへ同期実行メッセージを送信
      const response = await chrome.tabs.sendMessage(tabId, { action: "SYNC_ALL_SOURCES" });
      console.log(`[Enhancer] 同期完了レスポンス:`, response);

      // 新規タブかつ自動クローズ有効ならタブを閉じる
      if (isNewTab && task.autoClose) {
        console.log(`[Enhancer] 自動クローズ設定に基づきタブを閉じます: ID ${tabId}`);
        setTimeout(() => {
          chrome.tabs.remove(tabId).catch(err => console.log("タブクローズ失敗:", err));
        }, 2000);
      }

    } catch (e) {
      console.error(`[Enhancer] コマンド送信/実行失敗: ${e.message}`);
    }

  } catch (err) {
    console.error(`[Enhancer] 実行エラー: ${err.message}`);
  }
}

/**
 * タブの読み込み完了(status: 'complete')を待機するヘルパー関数
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (tid, changeInfo, tab) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// インストール時・起動時・設定変更時にアラームを更新
chrome.runtime.onInstalled.addListener(refreshAlarms);
chrome.runtime.onStartup.addListener(refreshAlarms);
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.scheduledTasks) {
    refreshAlarms();
  }
});