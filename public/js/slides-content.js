/**
 * @file Enhancer 4 Google - Google Slides Content Script
 * @description Google SlidesでPDFを取り込み、スライド生成（GAS連携）と画像ZIP化を行うスクリプトです。
 * バッチ処理による高速化と、エラーハンドリング（カスタムアラート）を含みます。
 */

// セレクタと定数
const MENU_BAR_SELECTOR = '.goog-menubar-start, #docs-menubar';
const STYLE_ID = 'enhancer-slides-style';
const BATCH_SIZE = 5; // 一度にGASへ送信するスライド数

// 設定値の保持
let settings = { 
  slidesPdfImport: true,
  slidesGasUrl: "" 
};
let isProcessCancelled = false;

/**
 * 設定の読み込み
 */
function loadSettings() {
  chrome.storage.sync.get({ 
    slidesPdfImport: true,
    slidesGasUrl: "" 
  }, (items) => {
    settings = items;
    if (settings.slidesPdfImport) injectImportButton();
  });
}

/**
 * 設定変更の監視
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  
  if (changes.slidesPdfImport) {
    settings.slidesPdfImport = changes.slidesPdfImport.newValue;
    if (settings.slidesPdfImport) {
      injectImportButton();
    } else {
      const btn = document.getElementById('enhancer-slides-import-btn');
      if (btn) btn.remove();
    }
  }
  
  if (changes.slidesGasUrl) {
    settings.slidesGasUrl = changes.slidesGasUrl.newValue;
  }
});

// スタイルの注入
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .enhancer-slides-btn {
      background-color: transparent; border: 1px solid transparent; color: #202124; cursor: pointer;
      font-family: "Google Sans",Roboto,RobotoDraft,Helvetica,Arial,sans-serif; font-size: 14px; font-weight: 500;
      height: 24px; line-height: 24px; margin: 0 4px; padding: 0 8px; border-radius: 4px;
      transition: background-color .2s; vertical-align: middle; display: inline-flex; align-items: center;
    }
    .enhancer-slides-btn:hover { background-color: rgba(60,64,67,0.08); }
    .enhancer-slides-btn img { width: 16px; height: 16px; margin-right: 6px; }
    
    /* ベースのオーバーレイ */
    .enhancer-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: rgba(255, 255, 255, 0.6); backdrop-filter: blur(4px); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    }
    /* アラート用のオーバーレイ (z-indexを高く設定) */
    .enhancer-alert-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: rgba(0, 0, 0, 0.4); z-index: 10001;
      display: flex; align-items: center; justify-content: center;
    }

    .enhancer-modal {
      background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      width: 400px; max-width: 90%; text-align: center; font-family: "Google Sans", sans-serif;
      border: 1px solid #e0e0e0; position: relative;
    }
    
    .enhancer-drop-zone {
      border: 2px dashed #ccc; padding: 30px 20px; margin: 20px 0; border-radius: 8px; cursor: pointer;
      color: #5f6368; transition: border-color 0.2s;
    }
    .enhancer-drop-zone:hover { border-color: #FBBD03; color: #333; }
    .enhancer-drop-zone.disabled { pointer-events: none; opacity: 0.6; background: #eee; }
    
    .enhancer-btn-primary {
      background-color: #FBBD03; color: white; border: none; padding: 10px 20px; border-radius: 4px;
      font-weight: bold; cursor: pointer; width: 100%; font-size: 14px;
    }
    .enhancer-btn-primary:disabled { background-color: #ddd; cursor: not-allowed; }
    
    /* アラート用ボタン */
    .enhancer-btn-alert {
      background-color: #1a73e8; color: white; border: none; padding: 8px 24px; border-radius: 4px;
      font-weight: 500; cursor: pointer; font-size: 14px; margin-top: 16px;
    }
    .enhancer-btn-alert:hover { background-color: #1557b0; }

    .enhancer-progress {
      width: 100%; height: 6px; background: #eee; border-radius: 3px; margin-top: 15px; overflow: hidden; display: none;
    }
    .enhancer-progress-bar { height: 100%; background: #FBBD03; width: 0%; transition: width 0.3s; }
    
    .enhancer-status { font-size: 12px; color: #666; margin-top: 8px; min-height: 1.2em; }
    
    .enhancer-close { position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 20px; color: #999; }
    .enhancer-close.disabled { display: none; }
    
    .enhancer-blocker {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(255,255,255,0.7); z-index: 10000;
      display: none; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px;
    }
    .enhancer-spinner {
      width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #FBBD03;
      border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .enhancer-cancel-hint { font-size: 11px; color: #666; margin-top: 8px; }
    
    .enhancer-alert-title { font-size: 1.1rem; font-weight: 600; color: #202124; margin-bottom: 12px; }
    .enhancer-alert-body { font-size: 0.9rem; color: #5f6368; line-height: 1.5; white-space: pre-wrap; }
  `;
  document.head.appendChild(style);
}

/**
 * カスタムアラートダイアログを表示します。
 */
function showCustomAlert(title, message) {
  const overlayId = 'enhancer-slides-alert';
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'enhancer-alert-overlay';

  const modal = document.createElement('div');
  modal.className = 'enhancer-modal';
  modal.style.width = '320px';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'enhancer-alert-title';
  titleDiv.textContent = title;

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'enhancer-alert-body';
  bodyDiv.textContent = message;

  const okBtn = document.createElement('button');
  okBtn.className = 'enhancer-btn-alert';
  okBtn.textContent = "OK"; 
  okBtn.onclick = () => {
    overlay.remove();
  };

  modal.appendChild(titleDiv);
  modal.appendChild(bodyDiv);
  modal.appendChild(okBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// インポートボタンの追加
function injectImportButton() {
  injectStyles();
  const menuBar = document.querySelector(MENU_BAR_SELECTOR);
  if (!menuBar || document.getElementById('enhancer-slides-import-btn')) return;

  const iconUrl = chrome.runtime.getURL('public/image/icon48.png');
  const label = chrome.i18n.getMessage("slidesBtnLabel") || "PDF Import";

  const btn = document.createElement('div');
  btn.id = 'enhancer-slides-import-btn';
  btn.className = 'enhancer-slides-btn';
  btn.title = "Enhancer 4 Google";

  const img = document.createElement('img');
  img.src = iconUrl;
  img.alt = "";
  
  const textNode = document.createTextNode(label);
  
  btn.appendChild(img);
  btn.appendChild(textNode);
  btn.addEventListener('click', showImportModal);

  menuBar.appendChild(btn);
}

// モーダルの表示
function showImportModal() {
  const existing = document.getElementById('enhancer-slides-modal');
  if (existing) existing.remove();
  const i18n = (key) => chrome.i18n.getMessage(key);

  const overlay = document.createElement('div');
  overlay.id = 'enhancer-slides-modal';
  overlay.className = 'enhancer-overlay';
  
  const modal = document.createElement('div');
  modal.className = 'enhancer-modal';
  modal.id = 'enhancer-modal-content';

  const blocker = document.createElement('div');
  blocker.id = 'enhancer-blocker';
  blocker.className = 'enhancer-blocker';
  
  const spinner = document.createElement('div');
  spinner.className = 'enhancer-spinner';
  
  const processingText = document.createElement('div');
  processingText.style.fontWeight = 'bold';
  processingText.style.color = '#333';
  processingText.textContent = i18n("modalStatusProcessing");
  
  const hint = document.createElement('div');
  hint.className = 'enhancer-cancel-hint';
  hint.textContent = i18n("modalHintCancel");
  
  blocker.appendChild(spinner);
  blocker.appendChild(processingText);
  blocker.appendChild(hint);
  
  const closeSpan = document.createElement('span');
  closeSpan.id = 'enhancer-modal-close';
  closeSpan.className = 'enhancer-close';
  closeSpan.textContent = '×';
  
  const title = document.createElement('h3');
  title.style.margin = '0 0 10px';
  title.style.color = '#202124';
  title.textContent = i18n("slidesModalTitle");

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'enhancer-pdf-input';
  fileInput.accept = 'application/pdf';
  fileInput.style.display = 'none';

  const dropZone = document.createElement('div');
  dropZone.id = 'enhancer-drop-zone';
  dropZone.className = 'enhancer-drop-zone';
  dropZone.textContent = i18n("slidesDropText");

  const fileNameDiv = document.createElement('div');
  fileNameDiv.id = 'enhancer-file-name';
  fileNameDiv.style.fontSize = '12px';
  fileNameDiv.style.marginBottom = '10px';
  fileNameDiv.style.fontWeight = 'bold';

  const runBtn = document.createElement('button');
  runBtn.id = 'enhancer-run-btn';
  runBtn.className = 'enhancer-btn-primary';
  runBtn.disabled = true;
  runBtn.textContent = i18n("slidesRunBtn");

  const progContainer = document.createElement('div');
  progContainer.id = 'enhancer-progress-container';
  progContainer.className = 'enhancer-progress';
  const progBar = document.createElement('div');
  progBar.id = 'enhancer-progress-bar';
  progBar.className = 'enhancer-progress-bar';
  progContainer.appendChild(progBar);

  const statusDiv = document.createElement('div');
  statusDiv.id = 'enhancer-status';
  statusDiv.className = 'enhancer-status';

  modal.appendChild(blocker);
  modal.appendChild(closeSpan);
  modal.appendChild(title);
  modal.appendChild(fileInput);
  modal.appendChild(dropZone);
  modal.appendChild(fileNameDiv);
  modal.appendChild(runBtn);
  modal.appendChild(progContainer);
  modal.appendChild(statusDiv);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => {
    if (blocker.style.display === 'flex') return;
    overlay.remove();
    document.removeEventListener('keydown', handleEsc);
  };
  closeSpan.addEventListener('click', closeModal);

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      if (blocker && blocker.style.display === 'flex') {
        isProcessCancelled = true;
        statusDiv.textContent = i18n("statusCancelling");
      } else {
        closeModal();
      }
    }
  };
  document.addEventListener('keydown', handleEsc);

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#FBBD03'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#ccc'; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileSelect(e.target.files[0]);
  });

  let selectedFile = null;
  function handleFileSelect(file) {
    if (file.type !== 'application/pdf') {
      statusDiv.textContent = i18n("statusSelectPdf");
      return;
    }
    selectedFile = file;
    fileNameDiv.textContent = file.name;
    runBtn.disabled = false;
  }

  runBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    await processPdf(selectedFile);
  });
}

function setUiBusy(isBusy) {
  const blocker = document.getElementById('enhancer-blocker');
  const closeBtn = document.getElementById('enhancer-modal-close');
  
  if (isBusy) {
    if (blocker) blocker.style.display = 'flex';
    if (closeBtn) closeBtn.classList.add('disabled');
    isProcessCancelled = false;
  } else {
    if (blocker) blocker.style.display = 'none';
    if (closeBtn) closeBtn.classList.remove('disabled');
  }
}

/**
 * PDF処理のメインロジック
 */
async function processPdf(file) {
  const statusDiv = document.getElementById('enhancer-status');
  const progressBar = document.getElementById('enhancer-progress-bar');
  const progressContainer = document.getElementById('enhancer-progress-container');
  const runBtn = document.getElementById('enhancer-run-btn');
  
  // URL未設定チェック
  if (!settings.slidesGasUrl || !settings.slidesGasUrl.startsWith('https://script.google.com/')) {
    showCustomAlert(
      chrome.i18n.getMessage("alertConfigTitle"),
      chrome.i18n.getMessage("alertGasUrlEmpty")
    );
    return;
  }

  runBtn.disabled = true;
  progressContainer.style.display = 'block';
  statusDiv.textContent = chrome.i18n.getMessage("statusInitializing");
  statusDiv.style.color = "#666";
  setUiBusy(true);
  
  try {
    const workerUrl = chrome.runtime.getURL('public/js/lib/pdf.worker.min.js');
    const workerResp = await fetch(workerUrl);
    if (!workerResp.ok) throw new Error("Workerファイルの読み込みに失敗しました");
    
    const workerText = await workerResp.text();
    const workerBlob = new Blob([workerText], { type: 'text/javascript' });
    const workerBlobUrl = URL.createObjectURL(workerBlob);
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

    const match = window.location.pathname.match(/\/presentation\/d\/([^\/]+)/);
    const presentationId = match ? match[1] : null;

    if (!presentationId) throw new Error(chrome.i18n.getMessage("errorSlideIdNotFound"));

    const zip = new JSZip();
    const folder = zip.folder("slides_images");

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const totalPages = pdf.numPages;

    let slideBatch = [];

    for (let i = 1; i <= totalPages; i++) {
      if (isProcessCancelled) throw new Error(chrome.i18n.getMessage("errorUserCancelled"));

      const msg = chrome.i18n.getMessage("slidesStatusProcessing", [String(i), String(totalPages)]);
      statusDiv.textContent = `${msg} (Batching...)`;
      progressBar.style.width = `${((i - 1) / totalPages) * 100}%`;

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport: viewport }).promise;

      // JPEG化による軽量化
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = imgData.split(',')[1];

      const fileName = `page_${String(i).padStart(3, '0')}.jpg`;
      folder.file(fileName, base64Data, {base64: true});

      const textContent = await page.getTextContent();
      const textNotes = textContent.items.map(item => item.str).join(' ');

      slideBatch.push({
        image: imgData, 
        notes: textNotes,
        page: i
      });

      // バッチサイズに達したら送信
      if (slideBatch.length >= BATCH_SIZE || i === totalPages) {
        statusDiv.textContent = `${msg} (Sending batch...)`;
        
        const response = await fetch(settings.slidesGasUrl, {
          method: "POST",
          mode: "cors", 
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            presentationId: presentationId,
            slides: slideBatch
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        
        slideBatch = [];
      }
    }

    progressBar.style.width = '100%';
    statusDiv.textContent = chrome.i18n.getMessage("slidesStatusZip");

    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${file.name.replace(/\.pdf$/i, '')}_images.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    setTimeout(() => {
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(workerBlobUrl);
    }, 2000);

    statusDiv.textContent = chrome.i18n.getMessage("slidesStatusComplete");

    setTimeout(() => {
        setUiBusy(false);
        const modal = document.getElementById('enhancer-slides-modal');
        if(modal) modal.remove();
    }, 2000);

  } catch (e) {
    console.error(e);
    // エラー時はカスタムアラートを表示
    showCustomAlert(
      chrome.i18n.getMessage("alertErrorTitle"),
      chrome.i18n.getMessage("alertExecutionFailed").replace("$1", e.message)
    );
    
    statusDiv.textContent = chrome.i18n.getMessage("statusStopped") + e.message;
    setUiBusy(false);
    runBtn.disabled = false;
  }
}

loadSettings();