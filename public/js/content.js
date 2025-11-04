// ターゲットとなる要素のセレクタを定義します
const TARGET_SELECTOR = '.create-artifact-buttons-container';
// 注入する<style>タグのIDを定義します
const STYLE_ID = 'notebooklm-enhancer-styles';

/**
 * 開閉アイコンとアニメーションのスタイルをページに注入する関数
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
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

// ResizeObserverのインスタンスを保持するための変数をグローバルに定義
let heightObserver = null;

/**
 * 指定された要素を<details>と<summary>タグで囲む関数
 * @param {HTMLElement} targetElement - 対象のHTML要素
 */
function wrapWithDetails(targetElement) {
  injectStyles();

  const details = document.createElement('details');
  details.className = 'enhancer-details-wrapper';
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'custom-summary';
  summary.style.marginLeft = '.85rem';
  summary.style.fontSize = '.9rem';
  summary.style.padding = '8px 0';
  const icon = document.createElement('span');
  icon.className = 'summary-icon';
  summary.appendChild(icon);
  summary.append(chrome.i18n.getMessage("featuresLabel"));
  console.log('UI Language:', chrome.i18n.getUILanguage(), '| Message:', chrome.i18n.getMessage("featuresLabel"));
  
  details.prepend(summary);

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'details-content-wrapper';
  
  details.appendChild(contentWrapper);
  targetElement.parentNode.insertBefore(details, targetElement);
  contentWrapper.appendChild(targetElement);

  // アニメーション中かどうかを管理するフラグ
  let isAnimating = false;

  summary.addEventListener('click', (e) => {
    e.preventDefault();
    
    // アニメーション開始
    isAnimating = true;

    if (!details.open) {
      details.open = true;
      requestAnimationFrame(() => {
        contentWrapper.style.maxHeight = contentWrapper.scrollHeight + 'px';
      });
    } else {
      contentWrapper.style.maxHeight = '0px';
    }
    
    // アニメーション完了を待ってフラグを下ろす
    contentWrapper.addEventListener('transitionend', () => {
      isAnimating = false;
      // 閉じるアニメーションの場合は、完了後にopen属性をfalseにする
      if (details.open && contentWrapper.style.maxHeight === '0px') {
          details.open = false;
      }
    }, { once: true });
  });

  heightObserver = new ResizeObserver(entries => {
    // アニメーション中はResizeObserverによる高さ調整をスキップ
    if (isAnimating) {
      return;
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
 * ページのDOMの変更を監視し、ターゲット要素が現れたら処理を実行します
 */
const observer = new MutationObserver((mutationsList, obs) => {
  const targetElement = document.querySelector(TARGET_SELECTOR);
  if (!targetElement) {
    return;
  }

  const detailsWrapper = document.querySelector('.enhancer-details-wrapper');

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
    while (contentWrapper.firstChild) {
      contentWrapper.removeChild(contentWrapper.firstChild);
    }
    contentWrapper.appendChild(targetElement);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});