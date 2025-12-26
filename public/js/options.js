/**
 * @file Enhancer 4 Google - Options Script
 * @description 設定画面 (options.html) のロジックを担当。設定の保存・読み込み、UI制御、およびクローラー機能を実装します。
 */

let scheduledTasks = [];

// --- 共通ユーティリティ関数 ---

/**
 * カスタムアラートを表示する
 * @param {string} title - タイトル
 * @param {string} message - メッセージ
 * @param {function} [onClose] - 閉じる際のコールバック
 */
function showCustomAlert(title, message, onClose = null) {
  const modal = document.getElementById('customModal');
  const titleEl = document.getElementById('modalTitle');
  const textEl = document.getElementById('modalText');
  const actionsEl = document.getElementById('modalActions');

  titleEl.textContent = title;
  textEl.textContent = message;
  actionsEl.innerHTML = ''; 

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn modal-btn-primary';
  closeBtn.textContent = chrome.i18n.getMessage("modalBtnClose");
  closeBtn.onclick = () => {
    modal.classList.remove('active');
    if (onClose) onClose();
  };

  actionsEl.appendChild(closeBtn);
  modal.classList.add('active');
}

/**
 * 確認ダイアログを表示する
 * @param {string} message - 確認メッセージ
 * @param {function} onConfirm - OK時のコールバック
 */
function showCustomConfirm(message, onConfirm) {
  const modal = document.getElementById('customModal');
  const titleEl = document.getElementById('modalTitle');
  const textEl = document.getElementById('modalText');
  const actionsEl = document.getElementById('modalActions');

  titleEl.textContent = chrome.i18n.getMessage("modalTitleConfirm");
  textEl.textContent = message;
  actionsEl.innerHTML = '';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-secondary';
  cancelBtn.textContent = chrome.i18n.getMessage("modalBtnCancel");
  cancelBtn.onclick = () => {
    modal.classList.remove('active');
  };

  const okBtn = document.createElement('button');
  okBtn.className = 'modal-btn modal-btn-danger';
  okBtn.textContent = chrome.i18n.getMessage("modalBtnDelete"); 
  okBtn.onclick = () => {
    modal.classList.remove('active');
    onConfirm();
  };

  actionsEl.appendChild(cancelBtn);
  actionsEl.appendChild(okBtn);
  modal.classList.add('active');
}

/**
 * ページのi18n属性を置換して国際化する
 */
function localizePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const messageName = el.dataset.i18n;
    const message = chrome.i18n.getMessage(messageName);
    if (message) {
      el.textContent = message;
    }
    if (el.hasAttribute('placeholder')) {
      el.setAttribute('placeholder', message);
    }
  });
}

// --- 設定保存・復元ロジック ---

/**
 * 設定値を保存する
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
  const gemManagerSearch = document.getElementById('enableGemManagerSearch').checked;
  const geminiExpand = document.getElementById('geminiExpandInput').checked;

  // Google Chat
  const chatEnter = document.getElementById('chatEnterKey').checked;

  // Slides
  const slidesImport = document.getElementById('slidesPdfImport').checked;
  const slidesGasUrl = document.getElementById('slidesGasUrl').value.trim();

  // 共通
  const submitKey = document.getElementById('submitKeyModifier').value;

  chrome.storage.sync.set({
    collapsibleStudio: collapsible,
    hijackClicks: hijack,
    notebooklmEnterKey: nblmEnter,
    geminiToolShortcuts: geminiShortcuts,
    geminiEnterKey: geminiEnter,
    geminiLayoutWidthEnabled: geminiLayoutWidthEnabled,
    geminiLayoutWidthValue: geminiLayoutWidthValue,
    enableGemManagerSearch: gemManagerSearch,
    geminiExpandInput: geminiExpand,
    chatEnterKey: chatEnter,
    submitKeyModifier: submitKey,
    slidesPdfImport: slidesImport,
    slidesGasUrl: slidesGasUrl,
  }, () => {
    const status = document.getElementById('statusMessage');
    status.style.opacity = '1';
    setTimeout(() => {
      status.style.opacity = '0';
    }, 1500);
  });
}

/**
 * 設定値を復元してUIに反映する
 */
function restoreOptions() {
  chrome.storage.sync.get({
    collapsibleStudio: true,
    hijackClicks: true,
    notebooklmEnterKey: true,
    geminiToolShortcuts: true,
    geminiEnterKey: true,
    geminiLayoutWidthEnabled: false,
    geminiLayoutWidthValue: 1200,
    enableGemManagerSearch: true,
    geminiExpandInput: true,
    chatEnterKey: true,
    submitKeyModifier: 'shift',
    slidesPdfImport: true,
    slidesGasUrl: "",
    scheduledTasks: []
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
    document.getElementById('geminiLayoutWidthValue').disabled = !items.geminiLayoutWidthEnabled;
    document.getElementById('enableGemManagerSearch').checked = items.enableGemManagerSearch;
    document.getElementById('geminiExpandInput').checked = items.geminiExpandInput;

    // Google Chat 
    document.getElementById('chatEnterKey').checked = items.chatEnterKey;

    // 共通
    document.getElementById('submitKeyModifier').value = items.submitKeyModifier;

    // Slides
    const slidesCheck = document.getElementById('slidesPdfImport');
    if (slidesCheck) slidesCheck.checked = items.slidesPdfImport;
    document.getElementById('slidesGasUrl').value = items.slidesGasUrl;

    // タスクリスト
    scheduledTasks = items.scheduledTasks;
    renderTaskList();
  });
}

// --- スケジューラー関連ロジック ---

/**
 * スケジューラーのタスクリストを描画する
 */
function renderTaskList() {
  const listEl = document.getElementById('schedList');
  listEl.innerHTML = '';

  if (scheduledTasks.length === 0) {
    const li = document.createElement('li');
    li.textContent = chrome.i18n.getMessage("schedulerNoTasks");
    li.style.padding = '15px';
    li.style.textAlign = 'center';
    li.style.color = '#999';
    li.style.fontSize = '0.85rem';
    listEl.appendChild(li);
    return;
  }

  scheduledTasks.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = 'scheduler-item';
    
    if (index === editIndex) {
      li.classList.add('editing-highlight');
    }

    // 説明文の生成
    let desc = "";
    if (task.type === 'hourly') {
       desc = chrome.i18n.getMessage("descHourly");
    } else if (task.type === 'daily') {
       desc = chrome.i18n.getMessage("descDaily", [task.time]);
    } else if (task.type === 'weekly') {
       const days = [
        chrome.i18n.getMessage("daySun"), chrome.i18n.getMessage("dayMon"), chrome.i18n.getMessage("dayTue"),
        chrome.i18n.getMessage("dayWed"), chrome.i18n.getMessage("dayThu"), chrome.i18n.getMessage("dayFri"), chrome.i18n.getMessage("daySat")
       ];
       desc = chrome.i18n.getMessage("descWeekly", [days[task.day], task.time]);
    } else if (task.type === 'monthly') {
       if (task.date === 'last') {
        desc = chrome.i18n.getMessage("descMonthlyLast", [task.time]);
      } else {
        desc = chrome.i18n.getMessage("descMonthly", [task.date, task.time]);
      }
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'scheduler-item-info';
    
    const descDiv = document.createElement('div');
    descDiv.className = 'scheduler-item-desc';
    descDiv.title = desc;
    descDiv.textContent = desc;
    infoDiv.appendChild(descDiv);
    
    if (task.autoClose) {
      const badgeDiv = document.createElement('div');
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'badge-auto-close';
      badgeSpan.textContent = chrome.i18n.getMessage("schedulerAutoCloseShort");
      badgeDiv.appendChild(badgeSpan);
      infoDiv.appendChild(badgeDiv);
    }
    
    const urlDiv = document.createElement('div');
    urlDiv.className = 'scheduler-item-url';
    urlDiv.title = task.url;
    urlDiv.textContent = task.url;
    infoDiv.appendChild(urlDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'scheduler-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'action-button';
    editBtn.style.background = '#f1f3f4';
    editBtn.style.color = '#5f6368';
    editBtn.textContent = chrome.i18n.getMessage("schedulerBtnEdit");
    editBtn.addEventListener('click', () => startEditTask(index));

    const delBtn = document.createElement('button');
    delBtn.className = 'action-button';
    delBtn.style.background = '#ff5252';
    delBtn.textContent = chrome.i18n.getMessage("schedulerDelete");
    delBtn.addEventListener('click', () => removeTask(index));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    listEl.appendChild(li);
  });
}

// 編集中のインデックス (-1: 新規)
let editIndex = -1;

/**
 * タスク編集モードに入る
 */
function startEditTask(index) {
  editIndex = index;
  const task = scheduledTasks[index];

  document.getElementById('schedUrl').value = task.url;
  document.getElementById('schedType').value = task.type;
  document.getElementById('schedTime').value = task.time || '';
  document.getElementById('schedDayOfWeek').value = task.day;
  document.getElementById('schedDayOfMonth').value = task.date;
  document.getElementById('schedAutoClose').checked = task.autoClose;

  const typeSelect = document.getElementById('schedType');
  typeSelect.dispatchEvent(new Event('change'));

  const addBtn = document.getElementById('schedAddBtn');
  addBtn.textContent = chrome.i18n.getMessage("schedulerBtnUpdate");
  addBtn.style.background = '#34a853';

  renderTaskList();
  document.querySelector('.scheduler-container').scrollIntoView({ behavior: 'smooth' });
}

/**
 * タスクを保存（追加または更新）する
 */
function saveTaskHandler() {
  const url = document.getElementById('schedUrl').value.trim();
  const type = document.getElementById('schedType').value;
  const time = document.getElementById('schedTime').value;
  const dayOfWeek = document.getElementById('schedDayOfWeek').value;
  const dayOfMonth = document.getElementById('schedDayOfMonth').value;
  const autoClose = document.getElementById('schedAutoClose').checked;

  const errorTitle = chrome.i18n.getMessage("modalTitleError");

  // バリデーション
  if (!url || !url.startsWith("https://notebooklm.google.com/")) {
    showCustomAlert(errorTitle, chrome.i18n.getMessage("errorUrlInvalid"));
    return;
  }
  if (type !== 'hourly' && !time) {
    showCustomAlert(errorTitle, "時間を入力してください");
    return;
  }

  // 上限チェック
  if (editIndex === -1 && scheduledTasks.length >= 10) {
    showCustomAlert(errorTitle, chrome.i18n.getMessage("errorMaxTasks"));
    return;
  }

  const newTask = {
    url: url,
    type: type,
    time: time,
    day: parseInt(dayOfWeek, 10),
    date: dayOfMonth,
    autoClose: autoClose
  };

  if (editIndex > -1) {
    scheduledTasks[editIndex] = newTask;
    editIndex = -1;
  } else {
    // 重複チェック
    const exists = scheduledTasks.some(t => t.url === url);
    if (exists) {
      showCustomAlert(errorTitle, chrome.i18n.getMessage("errorUrlDuplicate"));
      return;
    }
    scheduledTasks.push(newTask);
  }
  
  chrome.storage.sync.set({ scheduledTasks: scheduledTasks }, () => {
    renderTaskList();
    resetForm();
    showStatusMessage();
  });
}

function resetForm() {
  document.getElementById('schedUrl').value = "";
  document.getElementById('schedAutoClose').checked = false;
  const addBtn = document.getElementById('schedAddBtn');
  addBtn.textContent = chrome.i18n.getMessage("schedulerAddBtn");
  addBtn.style.background = '';
  editIndex = -1;
  renderTaskList();
}

function removeTask(index) {
  showCustomConfirm(chrome.i18n.getMessage("confirmDeleteTask"), () => {
    scheduledTasks.splice(index, 1);
    chrome.storage.sync.set({ scheduledTasks: scheduledTasks }, () => {
      renderTaskList();
      showStatusMessage();
    });
  });
}

function showStatusMessage() {
  const status = document.getElementById('statusMessage');
  if (status) {
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 1500);
  }
}

function handleWidthInput(event) {
  let value = parseInt(event.target.value, 10);
  const min = parseInt(event.target.min, 10);
  const max = parseInt(event.target.max, 10);

  if (isNaN(value)) value = min;
  if (value < min) value = min;
  else if (value > max) value = max;
  
  event.target.value = value;
  saveOptions();
}

// --- Web Crawler & Merger 機能 ---

/**
 * Web Crawler クラス
 * 再帰的にページを取得し、Markdownファイルを生成します。
 */
class WebCrawler {
  constructor(rootUrl, maxDepth, maxPages) {
    this.rootUrl = rootUrl;
    this.maxDepth = maxDepth;
    this.maxPages = maxPages;
    this.visitedUrls = new Set();
    this.queue = []; // { url, depth }
    this.results = []; // { url, title, content }
    this.isRunning = false;
    this.stopRequested = false;
    this.generatedFileCount = 0;
  }

  log(message) {
    const logEl = document.getElementById('crawlerLog');
    if (logEl) {
      if (logEl.style.display === 'none') {
        logEl.style.display = 'block';
      }
      const div = document.createElement('div');
      div.textContent = message;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  updateStatus(url) {
    const rowEl = document.getElementById('crawlerStatusRow');
    const textEl = document.getElementById('crawlerStatusText');
    const countEl = document.getElementById('crawlerStatusCount');
    
    if (rowEl) rowEl.style.display = 'flex';
    if (textEl) textEl.textContent = `Running: ${url}`;
    if (countEl) countEl.textContent = `${this.results.length} / ${this.maxPages} pages`;
  }

  /**
   * クローリングを開始します
   */
  async start() {
    this.isRunning = true;
    this.stopRequested = false;
    this.visitedUrls.clear();
    this.results = [];
    this.queue = [{ url: this.rootUrl, depth: 0 }];

    // ログエリアをクリアして表示
    const logEl = document.getElementById('crawlerLog');
    if (logEl) {
        logEl.innerHTML = '';
        logEl.style.display = 'block'; 
    }

    this.log(chrome.i18n.getMessage("crawlerLogStart"));

    while (this.queue.length > 0 && this.results.length < this.maxPages && !this.stopRequested) {
      const { url, depth } = this.queue.shift();
      
      // 既に訪問済みの場合はスキップ (ハッシュを除いたURLで管理)
      const normalizedUrl = url.split('#')[0];
      if (this.visitedUrls.has(normalizedUrl)) continue;
      this.visitedUrls.add(normalizedUrl);

      this.updateStatus(url);

      try {
        const html = await this.fetchPage(url);
        if (!html) continue;

        // DOMParserでHTMLをパース
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const content = this.extractContent(doc, url);
        
        if (content && content.body.length > 0) {
          this.results.push({ url, ...content });
          this.log(`[OK] ${doc.title.substring(0, 30)}... (${content.body.length} chars)`);
        }

        // 深さ制限内であれば子リンクを探索してキューに追加
        if (depth < this.maxDepth) {
          const links = this.extractLinks(doc, url);
          links.forEach(link => {
            // ここでの重複チェックはキューへの追加前に行う
            if (!this.visitedUrls.has(link.split('#')[0])) {
              this.queue.push({ url: link, depth: depth + 1 });
            }
          });
        }
        
        // サーバー負荷軽減のため1秒待機
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        this.log(`[Error] ${url}: ${e.message}`);
      }
    }

    // クローリング終了後、ファイルを生成
    this.exportFiles();
    this.isRunning = false;
    
    // 完了表示
    const textEl = document.getElementById('crawlerStatusText');
    const countEl = document.getElementById('crawlerStatusCount');
    if (textEl) textEl.textContent = "Completed!";
    // ★ 最終的な件数で更新
    if (countEl) countEl.textContent = `${this.results.length} / ${this.maxPages} pages`;

    this.log(`Done! Processed ${this.results.length} pages.`);
  }

  /**
   * 指定URLのHTMLを取得します
   */
  async fetchPage(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('text/html')) {
        this.log(`[Skip] Not HTML: ${url}`);
        return null;
      }
      return await res.text();
    } catch (e) {
      throw e;
    }
  }

  /**
   * ドキュメントからリンクを抽出します
   * 注意: DOMParser内での相対パス解決問題を回避するため getAttribute を使用
   */
  extractLinks(doc, baseUrl) {
    const links = [];
    const baseHostname = new URL(baseUrl).hostname;
    
    doc.querySelectorAll('a[href]').forEach(a => {
      // DOMParser内では a.href プロパティは chrome-extension://... に解決される場合があるため
      // getAttribute('href') で生のパスを取得し、new URL() で正しく結合する
      const rawHref = a.getAttribute('href');
      if (!rawHref) return;

      try {
        const url = new URL(rawHref, baseUrl);

        // クローリング対象の条件:
        // 1. 同一ホスト名であること
        // 2. プロトコルが http または https であること
        // 3. ハッシュを除いたURLが現在のページ自身でないこと
        if (url.hostname === baseHostname && 
            ['http:', 'https:'].includes(url.protocol)) {
            
            // ハッシュを除去したURLを保存
            const cleanUrl = url.href.split('#')[0];
            const cleanBase = baseUrl.split('#')[0];
            
            if (cleanUrl !== cleanBase) {
              links.push(cleanUrl);
            }
        }
      } catch (e) {
        // 無効なURLは無視
      }
    });
    // 重複を除去して返す
    return [...new Set(links)];
  }

  /**
   * ドキュメントから本文とタイトルを抽出し、Markdownに変換します
   */
  extractContent(doc, url) {
    // 不要な要素を削除 (スクリプト、スタイル、ナビゲーション、フッターなど)
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'iframe', 'noscript', '.ads', '.sidebar', '.menu', 'header'];
    removeSelectors.forEach(sel => doc.querySelectorAll(sel).forEach(el => el.remove()));

    const title = doc.title || 'No Title';
    let bodyText = "";

    // main, article, body の優先順位でコンテンツを探す
    const main = doc.querySelector('main') || doc.querySelector('article') || doc.body;
    if (main) {
      bodyText = this.domToMarkdown(main);
    }

    return { title, body: bodyText };
  }

  /**
   * DOM要素をMarkdownテキストに変換します (簡易実装)
   */
  domToMarkdown(element) {
    let md = "";
    
    // 再帰的にノードを処理
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) md += text + " ";
        return;
      }
      
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tagName = node.tagName.toLowerCase();
      
      // 見出しのレベル下げ処理 (NotebookLMに取り込む際の構造化のため)
      // h1 -> ##, h2 -> ### ...
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const level = parseInt(tagName.substring(1)) + 1; 
        md += `\n\n${'#'.repeat(Math.min(level, 6))} `;
        node.childNodes.forEach(walk);
        md += "\n\n";
        return;
      }
      
      if (tagName === 'p') {
        md += "\n\n";
        node.childNodes.forEach(walk);
        md += "\n\n";
        return;
      }
      
      if (tagName === 'br') {
        md += "\n";
        return;
      }
      
      if (tagName === 'li') {
        md += "\n- ";
        node.childNodes.forEach(walk);
        return;
      }
      
      if (tagName === 'a') {
        // リンクテキストのみ抽出 (URLはMarkdownに含めない簡易版)
        // 必要なら `[text](url)` 形式に変更可
        node.childNodes.forEach(walk);
        return;
      }
      
      // その他の要素はそのまま子要素を処理
      node.childNodes.forEach(walk);
      
      // ブロック要素の後は改行を入れる
      if (['div', 'section', 'article', 'ul', 'ol', 'tr'].includes(tagName)) {
        md += "\n";
      }
    };

    walk(element);
    // 連続する改行を2つに制限して整形
    return md.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 収集したデータをMarkdownファイルとして出力します
   * NotebookLMの上限(50万文字)を考慮し、40万文字程度で分割します
   */
  exportFiles() {
    const CHUNK_SIZE = 400000;
    let currentContent = "";
    let fileIndex = 1;
    let fileCount = 0;

    const saveChunk = (content, index) => {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      // ルートURLのホスト名をファイル名に含める
      const hostname = new URL(this.rootUrl).hostname.replace(/[^a-z0-9]/gi, '_');
      const filename = `notebooklm_source_${hostname}_${timestamp}_part${index}.md`;
      
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false // 自動保存
      });
      fileCount++;
    };

    this.results.forEach(page => {
      // ページごとのMarkdownブロックを作成
      // ページ区切りとしてURLとタイトルを見出し1(#)で挿入
      const pageBlock = `# ${page.title}\nSource: ${page.url}\n\n${page.body}\n\n---\n\n`;
      
      if ((currentContent.length + pageBlock.length) > CHUNK_SIZE) {
        saveChunk(currentContent, fileIndex++);
        currentContent = pageBlock;
      } else {
        currentContent += pageBlock;
      }
    });

    if (currentContent.length > 0) {
      saveChunk(currentContent, fileIndex);
    }
    
    this.generatedFileCount = fileCount;
  }
}

// --- ページロード時の初期化 ---

document.addEventListener('DOMContentLoaded', () => {
  localizePage();

  // Mac判定
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (isMac) {
    const ctrlOption = document.querySelector('option[value="ctrl"]');
    if (ctrlOption) {
      ctrlOption.textContent = chrome.i18n.getMessage("optionKeyCommand");
    }
  }

  restoreOptions();

  // --- 自動実行チェック (新しいタブで開かれた場合) ---
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoRun') === 'true') {
    const url = params.get('url');
    const depth = params.get('depth');
    const maxPages = params.get('max');

    if (url) document.getElementById('crawlerUrl').value = url;
    if (depth) document.getElementById('crawlerDepth').value = depth;
    if (maxPages) document.getElementById('crawlerMaxPages').value = maxPages;

    // 少し待ってから自動実行 (UIのレンダリング待ち)
    setTimeout(() => {
        const btn = document.getElementById('crawlerRunBtn');
        if(btn) {
             // タブをNotebookLMタブに切り替えるなどして表示させる
             const targetId = 'tab-notebooklm'; 
             document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
             document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
             document.querySelector(`button[data-target="${targetId}"]`).classList.add('active');
             document.getElementById(targetId).classList.add('active');
             
             btn.click();
        }
    }, 500);
  }


  // --- スケジューラーUI構築 ---
  const typeSelect = document.getElementById('schedType');
  const dayOfWeekSelect = document.getElementById('schedDayOfWeek');
  const dayOfMonthSelect = document.getElementById('schedDayOfMonth');
  const timeInput = document.getElementById('schedTime');

  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    dayOfMonthSelect.appendChild(opt); 
  }
  const lastOpt = document.createElement('option');
  lastOpt.value = 'last';
  lastOpt.textContent = chrome.i18n.getMessage("schedulerOptionLastDay");
  dayOfMonthSelect.appendChild(lastOpt);
  
  dayOfMonthSelect.value = "1";

  function updateSchedUI() {
    const type = typeSelect.value;
    
    dayOfWeekSelect.style.display = 'none';
    dayOfMonthSelect.style.display = 'none';
    timeInput.style.display = 'none';

    if (type === 'daily') {
      timeInput.style.display = 'inline-block';
    } else if (type === 'weekly') {
      dayOfWeekSelect.style.display = 'inline-block';
      timeInput.style.display = 'inline-block';
    } else if (type === 'monthly') {
      dayOfMonthSelect.style.display = 'inline-block';
      timeInput.style.display = 'inline-block';
    }
  }

  typeSelect.addEventListener('change', updateSchedUI);
  updateSchedUI();
  
  // --- タブ切り替え ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // --- 各種イベントリスナー登録 ---
  
  // NotebookLM
  document.getElementById('collapsibleStudio').addEventListener('change', saveOptions);
  document.getElementById('hijackClicks').addEventListener('change', saveOptions);
  document.getElementById('notebooklmEnterKey').addEventListener('change', saveOptions);

  // スケジューラー
  document.getElementById('schedAddBtn').addEventListener('click', saveTaskHandler);
  
  // クローラー
  const crawlerBtn = document.getElementById('crawlerRunBtn');
  if (crawlerBtn) {
    crawlerBtn.addEventListener('click', async () => {
      const url = document.getElementById('crawlerUrl').value;
      const depth = parseInt(document.getElementById('crawlerDepth').value, 10);
      const maxPages = parseInt(document.getElementById('crawlerMaxPages').value, 10);

      if (!url || !url.startsWith('http')) {
        showCustomAlert(chrome.i18n.getMessage("modalTitleError"), chrome.i18n.getMessage("errorUrlInvalid"));
        return;
      }

      // ★ ポップアップかどうかを判定し、ポップアップなら新しいタブで開き直す
      // (ウィンドウ幅が狭い = ポップアップとみなす簡易判定)
      if (document.body.clientWidth < 600) {
          const params = new URLSearchParams();
          params.append('autoRun', 'true');
          params.append('url', url);
          params.append('depth', depth);
          params.append('max', maxPages);
          
          const fullUrl = chrome.runtime.getURL('public/options.html') + '?' + params.toString();
          chrome.tabs.create({ url: fullUrl });
          return; // ここで処理終了（新しいタブに任せる）
      }

      crawlerBtn.disabled = true;
      // WebCrawlerのインスタンスを作成して実行
      const crawler = new WebCrawler(url, depth, maxPages);
      await crawler.start();
      crawlerBtn.disabled = false;
    });
  }
  
  // Gemini
  document.getElementById('geminiToolShortcuts').addEventListener('change', saveOptions);
  document.getElementById('geminiEnterKey').addEventListener('change', saveOptions);
  
  const widthToggle = document.getElementById('geminiLayoutWidthEnabled');
  const widthValueInput = document.getElementById('geminiLayoutWidthValue');

  widthToggle.addEventListener('change', (event) => {
    widthValueInput.disabled = !event.target.checked;
    saveOptions();
  });
  
  widthValueInput.addEventListener('change', handleWidthInput);
  document.getElementById('enableGemManagerSearch').addEventListener('change', saveOptions);
  document.getElementById('geminiExpandInput').addEventListener('change', saveOptions);

  // Google Chat
  document.getElementById('chatEnterKey').addEventListener('change', saveOptions);

  // 共通
  document.getElementById('submitKeyModifier').addEventListener('change', saveOptions);

  // 手動同期ボタン
  const syncBtn = document.getElementById('syncAllSourcesBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      const originalText = syncBtn.textContent;
      syncBtn.textContent = "Running...";

      const tabs = await chrome.tabs.query({ url: "https://notebooklm.google.com/*" });
      const targetTab = tabs.find(t => t.active) || tabs[0];

      if (targetTab) {
        try {
          await chrome.tabs.sendMessage(targetTab.id, { action: "SYNC_ALL_SOURCES" });
        } catch (e) {
          console.error(e);
          showCustomAlert(
            chrome.i18n.getMessage("modalTitleError"),
            chrome.i18n.getMessage("syncingErrorScript")
          );
        }
      } else {
        showCustomAlert(
          chrome.i18n.getMessage("modalTitleError"),
          chrome.i18n.getMessage("syncingErrorNoTab")
        );
      }

      syncBtn.disabled = false;
      syncBtn.textContent = originalText;
    });
  }

  // Slides
  const slidesCheck = document.getElementById('slidesPdfImport');
  if (slidesCheck) slidesCheck.addEventListener('change', saveOptions);
  
  const slidesUrlInput = document.getElementById('slidesGasUrl');
  if (slidesUrlInput) slidesUrlInput.addEventListener('change', saveOptions);
});