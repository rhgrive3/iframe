(() => {
  'use strict';

  if (window.top !== window) return;

  const APP_VERSION = 38;
  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const GLOBAL_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER__';
  const LEGACY_STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v12__';
  const LEGACY_STORAGE_KEYS = Array.from({ length: 11 }, (_, index) =>
    `__fullscreen_iframe_autoclicker_state_v${11 - index}__`
  );
  const LEGACY_PRESET_PREFIX = '__fullscreen_iframe_autoclicker_preset_v8__';
  const LEGACY_PRESET_PREFIXES = Array.from({ length: 7 }, (_, index) =>
    `__fullscreen_iframe_autoclicker_preset_v${7 - index}__`
  );
  const WORKFLOW_STORAGE_KEY = '__fullscreen_iframe_autoclicker_workflows_v1__';
  const WORKFLOW_AUTOSAVE_KEY = '__fullscreen_iframe_autoclicker_workflow_autosave_v1__';
  const MAX_REPEAT_COUNT = 10_000;
  const MAX_WORKFLOW_LOOP_COUNT = 999_999;
  const MAX_CONDITION_ITERATIONS = 10_000;
  const MAX_WORKFLOW_RESTARTS = 10_000;
  const DEFAULT_TIMEOUT_MS = 15_000;
  const DEFAULT_FLOW_TIMEOUT_MS = 120_000;
  const DEFAULT_STABLE_MS = 140;
  const MAX_LOGS = 20;
  const LOG_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const BATTLE_END_MESSAGE = '敵が倒されたため、このバトルは終了しました。';

  const ERROR_MESSAGES = Object.freeze({
    MAX_ASSIST: '救援できるマルチバトルは最大3つまでです。',
    UNCLAIMED: '未確認バトルを確認して下さい。',
    RAID_FULL: '参戦人数が上限に達しているため参戦できませんでした。'
  });

  const SELECTORS = Object.freeze({
    assistScreen: '#prt-assist-search.prt-assist-contents.active',
    assistRefresh: '#prt-assist-search .btn-search-refresh',
    assistList: '#prt-search-list',
    assistRows: '#prt-search-list > .btn-multi-raid.lis-raid.search',
    assistSlot: '#prt-search-switch .btn-search-switch',
    unclaimedAttention: '.btn-unconfirmed-result.flow-unclaimed.attention',
    supporterScreen: '#cnt-quest.cnt-quest.supporter_raid',
    supporterRows: '.btn-supporter.lis-supporter',
    supporterAuto: '.btn-autoselect-supporter',
    deckOk: '.pop-deck.supporter_raid .prt-btn-deck > .btn-usual-ok.se-quest-start',
    popup: '#pop .common-pop-error.pop-show',
    popupBody: '#popup-body',
    popupOk: '.prt-popup-footer > .btn-usual-ok',
    unclaimedList: '#prt-unclaimed-list',
    unclaimedRows: '#prt-unclaimed-list > .btn-multi-raid.lis-raid[data-href^="result_multi/"]',
    assistReturn: '#btn-link-quest-assist',
    battleScreen: '.cnt-raid-stage.multi',
    battleResult: '.prt-command-end .btn-result',
    battleEndNotice: '#pop .prt-rematch-fail, #pop-force .prt-rematch-fail, .txt-rematch-fail',
    fullAuto: '.btn-auto',
    attackStart: '.btn-attack-start',
    attackDummy: '.prt-attack-start-dummy',
    attackCancel: '.btn-attack-cancel',
    attackActor: '.prt-command .btn-command-character.attack',
    turn: '#js-turn-num-count'
  });

  const previous = window[GLOBAL_KEY];
  if (previous?.destroy) previous.destroy();
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: '#000',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
  });

  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host,*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
      :host{display:block;position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;--panel:#12141b;--surface:rgba(255,255,255,.065);--surface2:rgba(255,255,255,.105);--line:rgba(255,255,255,.14);--text:#f7f8ff;--muted:rgba(255,255,255,.68);--accent:#6f7cff;--green:#38cf87;--red:#f0646d;--amber:#e8ad55;--purple:#a083ff}
      button,input,select,textarea{font:inherit;color:var(--text)}
      button{min-height:44px;border:1px solid transparent;border-radius:11px;background:var(--surface);font-weight:760;touch-action:manipulation;cursor:pointer}
      button:not(#dockGrip):not(#compactGrip):active{transform:scale(.98)}button:disabled{opacity:.38;cursor:default}
      input,select,textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:rgba(0,0,0,.25);font-size:16px;outline:none}
      textarea{min-height:72px;resize:vertical}
      button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #c0c5ff;outline-offset:2px}
      #frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}:host(.ui-dragging) #frame{pointer-events:none}
      #browserBar{position:fixed;z-index:150;top:max(7px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(1080px,calc(100vw - 12px));display:grid;grid-template-columns:44px 44px 44px minmax(90px,1fr) 64px 44px;gap:5px;padding:5px;border:1px solid var(--line);border-radius:15px;background:var(--panel);box-shadow:none}
      #browserBar.hidden{display:none}#browserBar button{height:44px;padding:0}#loadUrl{background:var(--accent)}
      #browserHandle{position:fixed;z-index:149;top:max(5px,env(safe-area-inset-top));left:50%;display:none;transform:translateX(-50%);width:58px;border-radius:0 0 14px 14px;background:var(--panel)}#browserHandle.visible{display:block}
      #dock{position:fixed;z-index:180;left:8px;bottom:max(8px,env(safe-area-inset-bottom));width:min(780px,calc(100vw - 16px));width:min(780px,calc(100dvw - 16px));height:min(820px,calc(100vh - 78px));height:min(820px,calc(100dvh - 78px));max-width:calc(100dvw - 8px);max-height:calc(100dvh - 8px);display:flex;flex-direction:column;border:1px solid var(--line);border-radius:18px;color:var(--text);background:var(--panel);box-shadow:none;overflow:hidden}
      #dock.compact{width:120px;height:56px;border-radius:28px}.compactOnly{display:none;width:100%;height:100%}#dock.compact .compactOnly{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#dock.compact .fullOnly{display:none!important}
      #dockHeader{display:grid;grid-template-columns:44px minmax(0,1fr) 44px 44px;align-items:center;gap:5px;padding:6px;border-bottom:1px solid var(--line)}
      #dockGrip,#compactGrip{position:relative;background:transparent;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}#dockGrip::after,#compactGrip::after{content:'⠿';font-size:21px;color:var(--muted)}#dockGrip.is-dragging,#compactGrip.is-dragging{cursor:grabbing}
      .title{min-width:0}.title strong{display:block;font-size:13px}.title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px;margin-top:2px}
      #mainTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:7px;border-bottom:1px solid var(--line)}.mainTab.active{background:rgba(111,124,255,.22);border-color:rgba(111,124,255,.42)}
      #pages{flex:1;min-height:0;overflow:hidden}.page{display:none;height:100%;overflow:auto;padding:10px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}.page.active{display:block}
      .toolbar{display:flex;flex-wrap:wrap;gap:7px}.toolbar>*{flex:1 1 110px;min-width:0}.toolbar .primary{background:var(--accent)}.toolbar .success{background:var(--green);color:#07170f}.toolbar .danger{background:rgba(240,100,109,.18);color:#ffbec2}.toolbar .warn{background:rgba(232,173,85,.15);color:#f7d49b}
      .card{margin-bottom:9px;padding:11px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.035)}.cardTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;font-size:13px;font-weight:820}.hint{color:var(--muted);font-size:11px;line-height:1.5}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.field{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:11px;font-weight:690}.span2{grid-column:1/-1}
      #workflowEditor{padding-bottom:100px}.empty{padding:28px 12px;border:1px dashed rgba(192,197,255,.35);border-radius:13px;color:var(--muted);text-align:center}.dropZone{height:15px;margin:1px 5px;border:1px dashed transparent;border-radius:7px}.dropZone.dragOver{border-color:#aeb5ff;background:rgba(111,124,255,.22)}
      .blockCard{position:relative;margin:6px 0;border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:14px;background:rgba(9,10,15,.55);overflow:hidden}.blockCard.category-gbf{border-left-color:var(--green)}.blockCard.category-control{border-left-color:var(--purple)}.blockCard.category-wait{border-left-color:var(--amber)}.blockCard.category-frame{border-left-color:#62b7ff}.blockCard.running{outline:2px solid rgba(56,207,135,.55);outline-offset:-2px;box-shadow:none}.blockCard.dragging{opacity:.48}
      .blockHead{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:5px;padding:6px;border-bottom:1px solid rgba(255,255,255,.08)}.blockHead button{min-height:38px;height:38px;padding:0 8px}.dragHandle{cursor:grab;touch-action:none}.blockName{min-width:0}.blockName strong{display:block;font-size:12px}.blockName small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.blockTools{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}.blockTools button{min-width:38px;font-size:11px}.blockBody{padding:9px}.blockCard.collapsed .blockBody,.blockCard.collapsed .childArea{display:none}.childArea{margin:0 8px 9px 17px;padding:6px;border:1px dashed rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.018)}.childLabel{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;color:var(--muted);font-size:10px;font-weight:760}.progressBadge{display:inline-flex;min-width:44px;justify-content:center;padding:3px 7px;border-radius:999px;background:rgba(56,207,135,.15);color:#a6edc8;font-size:10px}
      .paletteGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.paletteButton{min-height:56px;padding:8px;text-align:left}.paletteButton strong{display:block;font-size:11px}.paletteButton small{display:block;margin-top:3px;color:var(--muted);font-size:9.5px}.paletteButton.gbf{background:rgba(56,207,135,.10)}.paletteButton.control{background:rgba(160,131,255,.11)}.paletteButton.wait{background:rgba(232,173,85,.10)}.paletteButton.frame{background:rgba(98,183,255,.10)}
      #runBar{position:sticky;bottom:-10px;z-index:5;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px -1px -10px;padding:10px 1px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(18,20,27,.98) 22%)}#runWorkflow{background:var(--green);color:#07170f}#stopWorkflow{background:var(--red)}
      #legacyActionList{display:grid;gap:7px}.legacyRow{padding:9px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.16)}.legacyHead{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px}.legacyTools{display:flex;gap:4px}.legacyTools button{min-width:40px;min-height:40px;padding:0 7px}
      #markerLayer,#recordLayer{position:fixed;inset:0;pointer-events:none}#markerLayer{z-index:100}.marker{position:fixed;width:44px;height:44px;transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #ff675f;border-radius:50%;background:rgba(255,103,95,.14);color:#fff;font-size:10px;font-weight:850;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;box-shadow:0 0 0 1px #fff,0 6px 18px rgba(0,0,0,.35)}.marker.selected{border-color:var(--green);background:rgba(56,207,135,.15)}#recordLayer.active{z-index:210;pointer-events:auto;background:rgba(255,60,90,.035);touch-action:none}.recordDot{position:fixed;width:28px;height:28px;transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:#ef4f68;font-size:10px;font-weight:850}
      #toast{position:fixed;z-index:260;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);display:none;max-width:calc(100vw - 24px);padding:10px 14px;border:1px solid var(--line);border-radius:999px;color:#fff;background:rgba(18,20,27,.97);font-size:12px;box-shadow:0 12px 34px rgba(0,0,0,.4)}#toast.show{display:block}
      .logList{display:grid;gap:5px}.logEntry{display:grid;grid-template-columns:72px 80px minmax(0,1fr);gap:7px;padding:8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px;line-height:1.45}.logEntry.error{color:#ffb7bc}.logEntry.success{color:#a6edc8}.logEntry.warn{color:#f2d29d}.logTime{color:var(--muted);font-variant-numeric:tabular-nums}.errorBox{display:none;margin-bottom:8px;padding:10px;border:1px solid rgba(240,100,109,.38);border-radius:12px;background:rgba(240,100,109,.10);color:#ffc1c5;font-size:11px;line-height:1.5}.errorBox.show{display:block}
      .compactOnly button{border-radius:26px}.compactOnly #compactRun{background:var(--green);color:#07170f}
      @media(max-width:620px){#browserBar{top:max(3px,env(safe-area-inset-top));width:calc(100dvw - 8px);grid-template-columns:36px 36px 36px minmax(70px,1fr) 50px 36px;gap:3px;padding:3px;border-radius:10px}#browserBar button,#browserBar input{height:36px;min-height:36px}#browserBar input{padding:4px 6px;font-size:14px}#dock{left:6px;width:min(390px,calc(100dvw - 18px));height:min(560px,66dvh);max-height:calc(100dvh - 54px);border-radius:12px}#dock.compact{width:104px;height:48px;border-radius:24px}#dockHeader{grid-template-columns:36px minmax(0,1fr) 36px 36px;gap:3px;padding:4px}.title strong{font-size:12px}.title small{font-size:10px}#mainTabs{gap:3px;padding:4px}.page{padding:6px}.card{margin-bottom:6px;padding:7px;border-radius:10px}.cardTitle{margin-bottom:6px}.grid2,.grid3{gap:5px}.toolbar{gap:4px}.toolbar>*{flex-basis:78px}.paletteGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.paletteButton{min-height:44px;padding:5px}.blockCard{margin:4px 0;border-radius:10px}.blockHead{grid-template-columns:32px minmax(0,1fr);gap:3px;padding:4px}.blockHead button,.legacyTools button{min-height:36px;height:36px}.blockBody{padding:6px}.blockTools{grid-column:1/-1;justify-content:flex-start;padding-left:35px;gap:3px}.childArea{margin:0 5px 6px 12px;padding:4px}.logEntry{grid-template-columns:50px 58px minmax(0,1fr);gap:4px;padding:6px;font-size:10px}}
      @media(max-width:430px){#browserBar{grid-template-columns:34px 34px minmax(66px,1fr) 48px 34px}#forwardFrame{display:none}.toolbar>*{flex-basis:72px}}
      @media(hover:none) and (pointer:coarse){#browserBar,#dock{backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}button{min-height:40px}input,select,textarea{min-height:40px}.blockHead button,.legacyTools button{min-height:36px;height:36px}}
    </style>
    <iframe id="frame" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div id="markerLayer"></div><div id="recordLayer"></div>
    <div id="browserBar"><button id="backFrame" aria-label="戻る">←</button><button id="forwardFrame" aria-label="進む">→</button><button id="reloadFrame" aria-label="再読込">↻</button><input id="urlInput" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false"><button id="loadUrl">表示</button><button id="hideBrowser" aria-label="URLバーを隠す">⌃</button></div>
    <button id="browserHandle" aria-label="URLバーを表示">⌄</button>
    <div id="dock">
      <div class="compactOnly"><button id="compactGrip" aria-label="メニューを開く"></button><button id="compactRun" aria-label="実行">▶</button></div>
      <div class="fullOnly" id="dockHeader"><button id="dockGrip" aria-label="メニューを移動"></button><div class="title"><strong>Scratch風オートフロー</strong><small id="statusText">準備完了</small></div><button id="toggleCompact" aria-label="小さくする">—</button><button id="closeApp" aria-label="終了">×</button></div>
      <div class="fullOnly" id="mainTabs"><button class="mainTab active" data-page="workflow">ワークフロー</button><button class="mainTab" data-page="legacy">旧マクロ</button><button class="mainTab" data-page="logs">ログ</button></div>
      <div class="fullOnly" id="pages">
        <section id="page-workflow" class="page active">
          <div id="workflowError" class="errorBox"></div>
          <div class="card"><div class="cardTitle"><span>ワークフロー</span><span id="autosaveState" class="hint">保存済み</span></div><div class="grid2"><label class="field span2">読込<select id="workflowSelect"></select></label><label class="field span2">名前<input id="workflowName" maxlength="60"></label><label class="field">実行回数<input id="workflowLoopCount" type="number" min="1" max="999999" inputmode="numeric"></label><label class="field">ループ<select id="workflowLoopMode"><option value="count">指定回数</option><option value="infinite">無限ループ</option></select></label></div><div class="toolbar" style="margin-top:8px"><button id="newWorkflow">新規</button><button id="renameWorkflow">名前変更</button><button id="duplicateWorkflow">複製</button><button id="deleteWorkflow" class="danger">削除</button><button id="exportWorkflow">JSON出力</button><button id="importWorkflow">JSON読込</button></div></div>
          <div class="card"><div class="cardTitle"><span>完成テンプレート</span><span class="hint">読込後は自由に編集可能</span></div><div class="grid2"><label class="field span2">テンプレート<select id="templateSelect"></select></label></div><div class="toolbar" style="margin-top:8px"><button id="replaceTemplate" class="primary">現在内容を置換</button><button id="appendTemplate">末尾へ追加</button></div></div>
          <details class="card" open><summary class="cardTitle" style="cursor:pointer;margin:0">ブロックを追加</summary><div class="hint" id="insertHint" style="margin:8px 0">末尾へ追加します。各ブロックの「＋下」「＋子」で挿入先を変更できます。</div><div id="palette" class="paletteGrid"></div></details>
          <div class="card"><div class="cardTitle"><span>ブロック</span><span id="workflowStats" class="hint"></span></div><div id="workflowEditor"></div></div>
          <div id="runBar"><button id="runWorkflow">▶ 実行</button><button id="stopWorkflow" disabled>■ 停止</button></div>
        </section>
        <section id="page-legacy" class="page">
          <div class="card"><div class="cardTitle"><span>旧固定マクロ</span><span class="hint">v1〜v12保存データ互換</span></div><div class="toolbar"><button id="legacyAddClick">クリック</button><button id="legacyAddNavigate">URL移動</button><button id="legacyAddWait">条件待ち</button><button id="legacyRecord" class="warn">タッチ記録</button></div></div>
          <div class="card"><div class="grid3"><label class="field">回数<input id="legacyCount" type="number" min="1" max="999999"></label><label class="field">時間ずれms<input id="legacyJitter" type="number" min="0" max="5000"></label><label class="field">位置ずれpx<input id="legacyPositionJitter" type="number" min="0" max="30" step="0.5"></label></div><div class="toolbar" style="margin-top:8px"><button id="legacyRun" class="success">▶ 実行</button><button id="legacyStop" class="danger" disabled>■ 停止</button></div></div>
          <div class="card"><div class="cardTitle"><span>保存スロット</span><span class="hint">既存プリセット互換</span></div><div class="grid3"><label class="field">スロット<select id="legacyPresetSlot"></select></label><label class="field span2">名前<input id="legacyPresetName" maxlength="40"></label></div><div class="toolbar" style="margin-top:8px"><button id="legacySavePreset">保存</button><button id="legacyLoadPreset">読込</button><button id="legacyDeletePreset" class="danger">削除</button></div></div>
          <div id="legacyActionList"></div>
        </section>
        <section id="page-logs" class="page"><div class="card"><div class="cardTitle"><span>実行ログ</span><button id="clearLogs">消去</button></div><div id="logList" class="logList"></div></div></section>
      </div>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
    <input id="importFile" type="file" accept="application/json,.json" hidden>
  `;

  const byId = id => shadow.getElementById(id);
  let iframe = byId('frame');
  const urlInput = byId('urlInput');
  const dock = byId('dock');
  const workflowEditor = byId('workflowEditor');
  const markerLayer = byId('markerLayer');
  const recordLayer = byId('recordLayer');
  const importFile = byId('importFile');

  const ui = {
    status: byId('statusText'), toast: byId('toast'), autosave: byId('autosaveState'), error: byId('workflowError'),
    browserBar: byId('browserBar'), browserHandle: byId('browserHandle'), workflowSelect: byId('workflowSelect'), workflowName: byId('workflowName'),
    templateSelect: byId('templateSelect'), palette: byId('palette'), insertHint: byId('insertHint'), workflowStats: byId('workflowStats'),
    workflowLoopCount: byId('workflowLoopCount'), workflowLoopMode: byId('workflowLoopMode'),
    runWorkflow: byId('runWorkflow'), stopWorkflow: byId('stopWorkflow'), legacyList: byId('legacyActionList'), legacyCount: byId('legacyCount'),
    legacyJitter: byId('legacyJitter'), legacyPositionJitter: byId('legacyPositionJitter'), legacyRun: byId('legacyRun'), legacyStop: byId('legacyStop'),
    legacyPresetSlot: byId('legacyPresetSlot'), legacyPresetName: byId('legacyPresetName'), logList: byId('logList')
  };

  const state = {
    destroyed: false,
    page: 'workflow',
    logs: [],
    toastTimer: null,
    autosaveTimer: null,
    workflows: null,
    selectedWorkflowId: null,
    insertion: null,
    dragBlockId: null,
    running: null,
    blockProgress: new Map(),
    collapsed: new Set(),
    legacy: null,
    legacyRunning: null,
    selectedLegacyId: null,
    nextLegacyId: 1,
    recording: false,
    recordedPoints: [],
    recordStartedAt: 0,
    activeRecordPointers: new Map(),
    pendingAutoAttack: null,
    runningCard: null,
    runningBadge: null,
    dockX: null,
    dockY: null
  };

  const cleanup = new Set();
  const addCleanup = fn => (cleanup.add(fn), fn);
  const deepClone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const int = (value, fallback = 0) => Math.round(finite(value, fallback));
  const nowId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const sleepMicrotask = () => new Promise(resolve => queueMicrotask(resolve));

  const supportsNativeBlockDrag = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  const lightweightMode = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  const narrowScreen = window.matchMedia?.('(max-width: 620px)').matches ?? false;
  const dragLock = { active: false, pointerId: null, owner: null, restore: null };

  function consumeDragEvent(event, immediate = false) {
    if (event?.cancelable) event.preventDefault();
    if (immediate) event?.stopImmediatePropagation?.();
    else event?.stopPropagation?.();
  }

  function acquireDragLock(event, owner) {
    releaseDragLock();
    consumeDragEvent(event, true);
    dragLock.active = true;
    dragLock.pointerId = event.pointerId;
    dragLock.owner = owner;
    root.classList.add('ui-dragging');
    owner?.classList?.add('is-dragging');
    try { owner?.setPointerCapture?.(event.pointerId); } catch {}

    const targets = [document.documentElement, document.body].filter(Boolean);
    const properties = ['touchAction', 'overscrollBehavior', 'userSelect', 'webkitUserSelect'];
    const snapshots = targets.map(target => [target, Object.fromEntries(properties.map(property => [property, target.style[property]]))]);
    for (const target of targets) {
      target.style.touchAction = 'none';
      target.style.overscrollBehavior = 'none';
      target.style.userSelect = 'none';
      target.style.webkitUserSelect = 'none';
    }
    dragLock.restore = () => {
      for (const [target, snapshot] of snapshots) {
        for (const property of properties) target.style[property] = snapshot[property];
      }
    };
  }

  function releaseDragLock(event = null, owner = dragLock.owner) {
    if (!dragLock.active) return;
    if (event && dragLock.pointerId != null && event.pointerId != null && event.pointerId !== dragLock.pointerId) return;
    consumeDragEvent(event, true);
    try {
      if (owner?.hasPointerCapture?.(dragLock.pointerId)) owner.releasePointerCapture(dragLock.pointerId);
    } catch {}
    owner?.classList?.remove('is-dragging');
    root.classList.remove('ui-dragging');
    try { dragLock.restore?.(); } catch {}
    dragLock.active = false;
    dragLock.pointerId = null;
    dragLock.owner = null;
    dragLock.restore = null;
  }

  const suppressNativeDrag = event => {
    if (dragLock.active) consumeDragEvent(event, true);
  };
  for (const type of ['touchmove', 'gesturestart', 'gesturechange']) {
    window.addEventListener(type, suppressNativeDrag, { capture: true, passive: false });
  }
  const releaseDragOnBlur = () => releaseDragLock();
  window.addEventListener('blur', releaseDragOnBlur, true);
  addCleanup(() => {
    releaseDragLock();
    for (const type of ['touchmove', 'gesturestart', 'gesturechange']) {
      window.removeEventListener(type, suppressNativeDrag, true);
    }
    window.removeEventListener('blur', releaseDragOnBlur, true);
  });

  function normalizePopupText(value) {
    return String(value ?? '').replace(/\s+/g, '').trim();
  }

  const NORMALIZED_ERRORS = Object.fromEntries(
    Object.entries(ERROR_MESSAGES).map(([key, value]) => [key, normalizePopupText(value)])
  );

  function setStatus(message) {
    const next = String(message ?? '');
    if (lightweightMode && (state.running || state.legacyRunning) && !/(?:エラー|停止|完了)/.test(next)) return;
    if (ui.status.textContent !== next) ui.status.textContent = next;
  }

  function toast(message) {
    clearTimeout(state.toastTimer);
    ui.toast.textContent = String(message ?? '');
    ui.toast.classList.add('show');
    state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
  }

  function createLogRow(log) {
    const row = document.createElement('div');
    row.className = `logEntry ${log.level || ''}`;
    const time = document.createElement('span');
    time.className = 'logTime';
    time.textContent = log.time;
    const name = document.createElement('span');
    name.textContent = log.blockName || '全体';
    const body = document.createElement('span');
    body.textContent = log.message;
    row.append(time, name, body);
    return row;
  }

  let logScrollFrame = 0;

  function scheduleLogScroll() {
    if (logScrollFrame || state.destroyed || state.page !== 'logs') return;
    logScrollFrame = requestAnimationFrame(() => {
      logScrollFrame = 0;
      if (!state.destroyed && state.page === 'logs') ui.logList.scrollTop = ui.logList.scrollHeight;
    });
  }

  addCleanup(() => {
    if (logScrollFrame) cancelAnimationFrame(logScrollFrame);
    logScrollFrame = 0;
  });

  function appendLog(message, level = '', blockName = '') {
    if (level !== 'error') return;
    const log = {
      time: LOG_TIME_FORMATTER.format(new Date()),
      level,
      blockName,
      message: String(message)
    };
    state.logs.push(log);
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    if (state.page !== 'logs') return;
    ui.logList.querySelector('.hint')?.remove();
    ui.logList.append(createLogRow(log));
    while (ui.logList.children.length > MAX_LOGS) ui.logList.firstElementChild?.remove();
    scheduleLogScroll();
  }

  function renderLogs() {
    ui.logList.textContent = '';
    if (!state.logs.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'エラーが発生するとここに記録されます。';
      ui.logList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const log of state.logs.slice(-MAX_LOGS)) fragment.append(createLogRow(log));
    ui.logList.append(fragment);
    scheduleLogScroll();
  }

  function showWorkflowError(error, block = null) {
    const workflow = currentWorkflow();
    const screen = safeDetectScreenState();
    const message = error?.message || String(error);
    ui.error.textContent = `ワークフロー: ${workflow?.name || '不明'} / ブロック: ${block ? blockLabel(block.type) : '不明'} / 画面: ${screen.type} / 理由: ${message}`;
    ui.error.classList.add('show');
    appendLog(message, 'error', block ? blockLabel(block.type) : '実行');
  }

  function clearWorkflowError() {
    ui.error.classList.remove('show');
    ui.error.textContent = '';
  }

  const CONDITION_OPTIONS = Object.freeze([
    ['gbfFullAutoOn', 'フルオートがON'],
    ['gbfFullAutoOff', 'フルオートがOFF'],
    ['gbfAttacking', 'フルオート攻撃中'],
    ['gbfAttackWaiting', '攻撃待機中'],
    ['gbfBattle', 'バトル画面である'],
    ['gbfAssist', '救援一覧である'],
    ['gbfUnclaimedEmpty', '未確認バトルが0件'],
    ['selectorVisible', '指定セレクタが表示'],
    ['selectorHidden', '指定セレクタが非表示'],
    ['selectorExists', '指定セレクタが存在'],
    ['selectorMissing', '指定セレクタが消失'],
    ['pageReady', 'ページ読込完了'],
    ['urlContains', 'URLに文字を含む']
  ]);

  const BLOCK_DEFINITIONS = Object.freeze({
    gbfAssistSelect: { category: 'gbf', label: '救援を評価して参加する', description: 'HPと人数を評価し、例外・サポーター・編成確認まで処理' },
    gbfSupporterAuto: { category: 'gbf', label: 'サポーターを自動選択する', description: 'ゲーム側の自動選択ボタンをtap' },
    gbfSupporterConditional: { category: 'gbf', label: 'サポーターを条件選択する', description: '第1〜第3候補と最高レベルフォールバック' },
    gbfDeckConfirm: { category: 'gbf', label: '編成確認OKを押す', description: '前面エラーを優先して編成開始を確認' },
    gbfUnclaimedAll: { category: 'gbf', label: '未確認バトルをすべて確認する', description: '1ページ目の最上段を0件まで処理' },
    gbfEnsureFullAuto: { category: 'gbf', label: 'フルオートをONにする', description: 'ONなら押さず、撃破時は指定ルートから先頭へ復帰' },
    gbfWaitAutoAttack: { category: 'gbf', label: 'フルオートによる攻撃開始を待つ', description: '攻撃開始または敵撃破通知を低負荷で監視' },
    gbfRefreshAssist: { category: 'gbf', label: '救援一覧を更新する', description: '一覧更新完了をDOM変化で監視' },
    repeat: { category: 'control', label: '指定回数繰り返す', description: '子ブロックを指定回数実行', container: true },
    repeatUntil: { category: 'control', label: '条件成立まで繰り返す', description: '前判定型。成立済みなら0回', container: true },
    if: { category: 'control', label: '条件分岐', description: '成立時と不成立時の子ブロックを分岐', container: true, elseBranch: true },
    stop: { category: 'control', label: '処理を停止する', description: '正常な意図的停止' },
    fixedWait: { category: 'wait', label: '固定時間待機', description: '停止可能な固定待機' },
    randomWait: { category: 'wait', label: '指定区間をランダム待機', description: '最小〜最大の一様乱数' },
    watch: { category: 'wait', label: '要素または状態を監視する', description: 'MutationObserver中心で条件成立を待機' },
    iframeReload: { category: 'frame', label: 'iframeを再読み込みする', description: '操作前からloadとDOM変化を監視' },
    iframeBack: { category: 'frame', label: 'iframeの履歴を1つ戻る', description: 'リロードせず履歴を戻る' },
    iframeRoute: { category: 'frame', label: '指定したゲーム内ルートへ移動する', description: 'hash/ゲーム内ルートへ移動して完了待機' },
    iframeReady: { category: 'frame', label: 'ページ読込完了まで待つ', description: 'readyState・loading・主要DOM・安定化を確認' }
  });

  const CATEGORY_LABELS = Object.freeze({ gbf: 'グラブル', control: '制御', wait: '待機', frame: 'iframe' });

  function blockLabel(type) {
    return BLOCK_DEFINITIONS[type]?.label || `不明ブロック (${type})`;
  }

  function defaultSupporterCandidates() {
    return [
      { name: 'ルシフェル', minimumLevel: 220 },
      { name: '', minimumLevel: 0 },
      { name: '', minimumLevel: 0 }
    ];
  }

  function defaultBlockConfig(type) {
    switch (type) {
      case 'gbfAssistSelect':
        return { minimumHp: 50, baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15, maxAttempts: 10000, assistSlots: [1], supporterCandidates: defaultSupporterCandidates() };
      case 'gbfSupporterAuto':
        return { timeoutSec: 15 };
      case 'gbfSupporterConditional':
        return { timeoutSec: 15, supporterCandidates: defaultSupporterCandidates() };
      case 'gbfDeckConfirm':
        return { timeoutSec: 30, refreshBaseDelaySec: 0.6, refreshJitterSec: 0 };
      case 'gbfUnclaimedAll':
        return { timeoutSec: 30, maxItems: 10000 };
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack':
        return {
          timeoutSec: 15,
          battleEndRoute: '#quest/assist/multi/0',
          battleEndExpectedScreen: 'assist'
        };
      case 'gbfRefreshAssist':
        return { baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15 };
      case 'repeat':
        return { count: 5 };
      case 'repeatUntil':
        return { condition: { type: 'gbfBattle', selector: '', value: '' }, maxIterations: 10000, maxDurationSec: 600 };
      case 'if':
        return { condition: { type: 'gbfBattle', selector: '', value: '' } };
      case 'stop':
        return { reason: '停止ブロックに到達しました' };
      case 'fixedWait':
        return { seconds: 1 };
      case 'randomWait':
        return { minSeconds: 0.5, maxSeconds: 0.8 };
      case 'watch':
        return { condition: { type: 'selectorVisible', selector: '', value: '' }, timeoutSec: 30, stableMs: 100 };
      case 'iframeReload':
      case 'iframeBack':
        return { timeoutSec: 30, expectedScreen: 'auto' };
      case 'iframeRoute':
        return { route: '#quest/assist/multi/0', timeoutSec: 30, expectedScreen: 'assist' };
      case 'iframeReady':
        return { timeoutSec: 30, expectedScreen: 'auto' };
      default:
        return {};
    }
  }

  function createBlock(type, overrides = {}) {
    const definition = BLOCK_DEFINITIONS[type];
    if (!definition) throw new Error(`未対応のブロックです: ${type}`);
    const block = {
      type,
      id: nowId('block'),
      config: { ...defaultBlockConfig(type), ...(overrides.config || {}) }
    };
    if (definition.container) block.children = Array.isArray(overrides.children) ? overrides.children.map(normalizeBlock) : [];
    if (definition.elseBranch) block.elseChildren = Array.isArray(overrides.elseChildren) ? overrides.elseChildren.map(normalizeBlock) : [];
    return block;
  }

  function normalizeAssistSlots(value) {
    const raw = Array.isArray(value) ? value : [value];
    const slots = [...new Set(raw.map(item => int(item, 0)).filter(item => item >= 1 && item <= 4))]
      .sort((a, b) => a - b);
    return slots.length ? slots : [1];
  }

  function normalizeCandidates(value) {
    const raw = Array.isArray(value) ? value : [];
    return [0, 1, 2].map(index => ({
      name: String(raw[index]?.name || '').trim(),
      minimumLevel: clamp(int(raw[index]?.minimumLevel, 0), 0, 9999)
    }));
  }

  function normalizeConditionConfig(value) {
    const condition = value && typeof value === 'object' ? value : {};
    const allowed = CONDITION_OPTIONS.map(option => option[0]);
    return {
      type: allowed.includes(condition.type) ? condition.type : 'gbfBattle',
      selector: String(condition.selector || '').trim(),
      value: String(condition.value || '')
    };
  }

  function normalizeBlock(raw) {
    if (!raw || typeof raw !== 'object') return createBlock('fixedWait');
    const type = BLOCK_DEFINITIONS[raw.type] ? raw.type : 'stop';
    const block = createBlock(type);
    block.id = String(raw.id || nowId('block'));
    const config = raw.config && typeof raw.config === 'object' ? raw.config : {};
    switch (type) {
      case 'gbfAssistSelect':
        block.config = {
          minimumHp: clamp(finite(config.minimumHp, 50), 0, 100),
          baseDelaySec: clamp(finite(config.baseDelaySec, 0.6), 0, 600),
          jitterSec: clamp(finite(config.jitterSec, 0), 0, 600),
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
          maxAttempts: clamp(int(config.maxAttempts, 10000), 1, 100000),
          assistSlots: normalizeAssistSlots(config.assistSlots),
          supporterCandidates: normalizeCandidates(config.supporterCandidates)
        };
        break;
      case 'gbfSupporterConditional':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600), supporterCandidates: normalizeCandidates(config.supporterCandidates) };
        break;
      case 'gbfSupporterAuto':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600) };
        break;
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
          battleEndRoute: String(config.battleEndRoute || '#quest/assist/multi/0').trim() || '#quest/assist/multi/0',
          battleEndExpectedScreen: normalizeExpectedScreen(config.battleEndExpectedScreen || 'assist')
        };
        break;
      case 'gbfDeckConfirm':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600),
          refreshBaseDelaySec: clamp(finite(config.refreshBaseDelaySec, 0.6), 0, 600),
          refreshJitterSec: clamp(finite(config.refreshJitterSec, 0), 0, 600)
        };
        break;
      case 'gbfUnclaimedAll':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600), maxItems: clamp(int(config.maxItems, 10000), 1, 100000) };
        break;
      case 'gbfRefreshAssist':
        block.config = {
          baseDelaySec: clamp(finite(config.baseDelaySec, 0.6), 0, 600),
          jitterSec: clamp(finite(config.jitterSec, 0), 0, 600),
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600)
        };
        break;
      case 'repeat':
        block.config = { count: clamp(int(config.count, 5), 0, MAX_REPEAT_COUNT) };
        break;
      case 'repeatUntil':
        block.config = {
          condition: normalizeConditionConfig(config.condition),
          maxIterations: clamp(int(config.maxIterations, MAX_CONDITION_ITERATIONS), 1, 100000),
          maxDurationSec: clamp(finite(config.maxDurationSec, 600), 1, 86400)
        };
        break;
      case 'if':
        block.config = { condition: normalizeConditionConfig(config.condition) };
        break;
      case 'stop':
        block.config = { reason: String(config.reason || '停止ブロックに到達しました').slice(0, 300) };
        break;
      case 'fixedWait':
        block.config = { seconds: clamp(finite(config.seconds, 1), 0, 86400) };
        break;
      case 'randomWait':
        block.config = {
          minSeconds: clamp(finite(config.minSeconds, 0.5), 0, 86400),
          maxSeconds: clamp(finite(config.maxSeconds, 0.8), 0, 86400)
        };
        break;
      case 'watch':
        block.config = {
          condition: normalizeConditionConfig(config.condition),
          timeoutSec: clamp(finite(config.timeoutSec, 30), 0, 86400),
          stableMs: clamp(int(config.stableMs, 100), 0, 5000)
        };
        break;
      case 'iframeReload':
      case 'iframeBack':
      case 'iframeReady':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600),
          expectedScreen: normalizeExpectedScreen(config.expectedScreen)
        };
        break;
      case 'iframeRoute':
        block.config = {
          route: String(config.route || '#quest/assist/multi/0').trim(),
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600),
          expectedScreen: normalizeExpectedScreen(config.expectedScreen)
        };
        break;
    }
    if (BLOCK_DEFINITIONS[type].container) block.children = (Array.isArray(raw.children) ? raw.children : []).map(normalizeBlock);
    if (BLOCK_DEFINITIONS[type].elseBranch) block.elseChildren = (Array.isArray(raw.elseChildren) ? raw.elseChildren : []).map(normalizeBlock);
    return block;
  }

  function normalizeExpectedScreen(value) {
    const allowed = ['auto', 'assist', 'supporter', 'unclaimed', 'battle', 'result'];
    return allowed.includes(value) ? value : 'auto';
  }

  function normalizeWorkflow(raw, index = 0) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 1,
      id: String(source.id || nowId('workflow')),
      name: String(source.name || `ワークフロー ${index + 1}`).trim().slice(0, 60) || `ワークフロー ${index + 1}`,
      blocks: (Array.isArray(source.blocks) ? source.blocks : []).map(normalizeBlock),
      loopCount: clamp(int(source.loopCount, 1), 1, MAX_WORKFLOW_LOOP_COUNT),
      loopInfinite: Boolean(source.loopInfinite),
      createdAt: finite(source.createdAt, Date.now()),
      updatedAt: finite(source.updatedAt, Date.now())
    };
  }

  function defaultWorkflow() {
    return normalizeWorkflow({
      name: '救援フルオート',
      blocks: [
        createBlock('gbfAssistSelect'),
        createBlock('gbfEnsureFullAuto'),
        createBlock('gbfWaitAutoAttack')
      ]
    });
  }

  function migrateWorkflowStore(raw) {
    if (!raw) {
      const workflow = defaultWorkflow();
      return { version: 1, currentId: workflow.id, workflows: [workflow] };
    }
    if (Array.isArray(raw)) {
      const workflows = raw.map(normalizeWorkflow);
      const fallback = workflows[0] || defaultWorkflow();
      return { version: 1, currentId: fallback.id, workflows: workflows.length ? workflows : [fallback] };
    }
    if (Array.isArray(raw.blocks)) {
      const workflow = normalizeWorkflow(raw);
      return { version: 1, currentId: workflow.id, workflows: [workflow] };
    }
    const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).map(normalizeWorkflow);
    if (!workflows.length) workflows.push(defaultWorkflow());
    const currentId = workflows.some(workflow => workflow.id === raw.currentId) ? raw.currentId : workflows[0].id;
    return { version: 1, currentId, workflows };
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function loadWorkflowStore() {
    const primary = readJson(WORKFLOW_STORAGE_KEY);
    const autosave = readJson(WORKFLOW_AUTOSAVE_KEY);
    const source = autosave?.updatedAt > (primary?.updatedAt || 0) ? autosave.store : primary;
    state.workflows = migrateWorkflowStore(source);
    state.selectedWorkflowId = state.workflows.currentId;
  }

  function workflowStoreSnapshot() {
    return {
      version: 1,
      currentId: state.selectedWorkflowId,
      workflows: state.workflows.workflows.map(workflow => normalizeWorkflow(workflow)),
      updatedAt: Date.now()
    };
  }

  function saveWorkflowStore({ immediate = false } = {}) {
    ui.autosave.textContent = '保存中';
    clearTimeout(state.autosaveTimer);
    const perform = () => {
      try {
        const snapshot = workflowStoreSnapshot();
        localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(snapshot));
        localStorage.setItem(WORKFLOW_AUTOSAVE_KEY, JSON.stringify({ updatedAt: snapshot.updatedAt, store: snapshot }));
        ui.autosave.textContent = '保存済み';
      } catch (error) {
        ui.autosave.textContent = '保存失敗';
        appendLog(`ワークフロー保存失敗: ${error.message}`, 'error');
      }
    };
    if (immediate) perform();
    else state.autosaveTimer = setTimeout(perform, 180);
  }

  function currentWorkflow() {
    return state.workflows?.workflows.find(workflow => workflow.id === state.selectedWorkflowId) || null;
  }

  function touchWorkflow() {
    const workflow = currentWorkflow();
    if (workflow) workflow.updatedAt = Date.now();
    saveWorkflowStore();
  }

  const TEMPLATES = Object.freeze([
    ['gbf-assist', 'グラブル：救援を評価して参加', () => [createBlock('gbfAssistSelect')]],
    ['gbf-unclaimed', 'グラブル：未確認バトルをすべて確認', () => [createBlock('gbfUnclaimedAll')]],
    ['gbf-supporter', 'グラブル：サポーター条件選択', () => [createBlock('gbfSupporterConditional')]],
    ['gbf-fullauto', 'グラブル：フルオートをON', () => [createBlock('gbfEnsureFullAuto')]],
    ['gbf-attack-wait', 'グラブル：フルオート攻撃開始まで待つ', () => [createBlock('gbfWaitAutoAttack')]],
    ['gbf-full-flow', 'グラブル：救援参加フルフロー', () => [createBlock('gbfAssistSelect'), createBlock('gbfEnsureFullAuto'), createBlock('gbfWaitAutoAttack')]],
    ['control-repeat', '制御：指定回数繰り返す', () => [createBlock('repeat', { children: [createBlock('gbfEnsureFullAuto'), createBlock('gbfWaitAutoAttack'), createBlock('randomWait', { config: { minSeconds: 0.5, maxSeconds: 0.8 } })] })]],
    ['control-until', '制御：条件成立まで繰り返す', () => [createBlock('repeatUntil')]],
    ['wait-random', '待機：指定区間をランダム待機', () => [createBlock('randomWait')]],
    ['frame-reload', 'iframe：再読み込み', () => [createBlock('iframeReload')]],
    ['frame-back', 'iframe：履歴を1つ戻る', () => [createBlock('iframeBack')]]
  ]);

  function findTemplate(id) {
    return TEMPLATES.find(template => template[0] === id) || TEMPLATES[0];
  }

  function walkBlocks(blocks, visitor, parent = null, branch = 'blocks') {
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const result = visitor(block, blocks, index, parent, branch);
      if (result) return result;
      if (Array.isArray(block.children)) {
        const nested = walkBlocks(block.children, visitor, block, 'children');
        if (nested) return nested;
      }
      if (Array.isArray(block.elseChildren)) {
        const nested = walkBlocks(block.elseChildren, visitor, block, 'elseChildren');
        if (nested) return nested;
      }
    }
    return null;
  }

  function findBlockLocation(id) {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    return walkBlocks(workflow.blocks, (block, list, index, parent, branch) =>
      block.id === id ? { block, list, index, parent, branch } : null
    );
  }

  function regenerateBlockIds(block) {
    block.id = nowId('block');
    block.children?.forEach(regenerateBlockIds);
    block.elseChildren?.forEach(regenerateBlockIds);
    return block;
  }

  function cloneBlock(block) {
    return regenerateBlockIds(deepClone(block));
  }

  function countBlocks(blocks) {
    let count = 0;
    walkBlocks(blocks, () => {
      count += 1;
      return null;
    });
    return count;
  }

  function isDescendant(block, targetId) {
    if (block.id === targetId) return true;
    return [...(block.children || []), ...(block.elseChildren || [])].some(child => isDescendant(child, targetId));
  }

  function removeBlockById(id) {
    const location = findBlockLocation(id);
    if (!location) return null;
    const [removed] = location.list.splice(location.index, 1);
    return removed;
  }

  function moveBlockToList(id, targetList, targetIndex) {
    const location = findBlockLocation(id);
    if (!location) return false;
    const moving = location.block;
    const targetOwner = walkBlocks(currentWorkflow().blocks, block =>
      block.children === targetList || block.elseChildren === targetList ? block : null
    );
    if (targetOwner && isDescendant(moving, targetOwner.id)) return false;
    location.list.splice(location.index, 1);
    let index = clamp(int(targetIndex, targetList.length), 0, targetList.length);
    if (location.list === targetList && location.index < index) index -= 1;
    targetList.splice(index, 0, moving);
    touchWorkflow();
    renderWorkflowEditor();
    return true;
  }

  function moveBlockSibling(id, direction) {
    const location = findBlockLocation(id);
    if (!location) return;
    const next = location.index + direction;
    if (next < 0 || next >= location.list.length) return;
    [location.list[location.index], location.list[next]] = [location.list[next], location.list[location.index]];
    touchWorkflow();
    renderWorkflowEditor();
  }

  function indentBlock(id) {
    const location = findBlockLocation(id);
    if (!location || location.index <= 0) return;
    const previous = location.list[location.index - 1];
    if (!BLOCK_DEFINITIONS[previous.type]?.container) {
      toast('直前のブロックは入れ子を持てません');
      return;
    }
    location.list.splice(location.index, 1);
    previous.children.push(location.block);
    touchWorkflow();
    renderWorkflowEditor();
  }

  function outdentBlock(id) {
    const location = findBlockLocation(id);
    if (!location?.parent) return;
    const parentLocation = findBlockLocation(location.parent.id);
    if (!parentLocation) return;
    location.list.splice(location.index, 1);
    parentLocation.list.splice(parentLocation.index + 1, 0, location.block);
    touchWorkflow();
    renderWorkflowEditor();
  }

  function setInsertion(list, index, description) {
    state.insertion = { list, index };
    ui.insertHint.textContent = `${description}へ追加します。`;
    ui.palette.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addBlockAtInsertion(type) {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const target = state.insertion || { list: workflow.blocks, index: workflow.blocks.length };
    target.list.splice(clamp(target.index, 0, target.list.length), 0, createBlock(type));
    state.insertion = null;
    ui.insertHint.textContent = '末尾へ追加します。各ブロックの「＋下」「＋子」で挿入先を変更できます。';
    touchWorkflow();
    renderWorkflowEditor();
  }

  function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text != null) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.value != null) node.value = options.value;
    if (options.title) node.title = options.title;
    if (options.dataset) Object.assign(node.dataset, options.dataset);
    if (options.attrs) for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
    for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
    return node;
  }

  function field(labelText, input) {
    return element('label', { className: 'field' }, [element('span', { text: labelText }), input]);
  }

  function numberInput(value, min, max, step, onChange) {
    const input = element('input', { type: 'number', value });
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.inputMode = 'decimal';
    input.addEventListener('change', () => onChange(input));
    return input;
  }

  function textInput(value, onChange, placeholder = '') {
    const input = element('input', { type: 'text', value });
    input.placeholder = placeholder;
    input.addEventListener('change', () => onChange(input));
    return input;
  }

  function selectInput(value, options, onChange) {
    const select = element('select');
    for (const [optionValue, labelText] of options) {
      const option = element('option', { value: optionValue, text: labelText });
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select));
    return select;
  }

  function updateBlockConfig(block, updater) {
    updater(block.config);
    const normalized = normalizeBlock(block);
    block.config = normalized.config;
    if (normalized.children) block.children = normalized.children;
    if (normalized.elseChildren) block.elseChildren = normalized.elseChildren;
    touchWorkflow();
    renderWorkflowEditor();
  }

  function renderCandidates(block, container) {
    const candidates = normalizeCandidates(block.config.supporterCandidates);
    const grid = element('div', { className: 'grid2' });
    candidates.forEach((candidate, index) => {
      const name = textInput(candidate.name, input => updateBlockConfig(block, config => {
        config.supporterCandidates = normalizeCandidates(config.supporterCandidates);
        config.supporterCandidates[index].name = input.value;
      }), '召喚石名（完全一致）');
      const level = numberInput(candidate.minimumLevel, 0, 9999, 1, input => updateBlockConfig(block, config => {
        config.supporterCandidates = normalizeCandidates(config.supporterCandidates);
        config.supporterCandidates[index].minimumLevel = finite(input.value, 0);
      }));
      grid.append(field(`候補${index + 1} 名前`, name), field(`候補${index + 1} 最低Lv`, level));
    });
    container.append(grid);
  }

  function renderConditionFields(block, container, configKey = 'condition') {
    const condition = normalizeConditionConfig(block.config[configKey]);
    const grid = element('div', { className: 'grid2' });
    const type = selectInput(condition.type, CONDITION_OPTIONS, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].type = input.value;
    }));
    const selector = textInput(condition.selector, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].selector = input.value;
    }), '.selector または #id');
    const value = textInput(condition.value, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].value = input.value;
    }), 'URLに含む文字など');
    grid.append(field('条件', type), field('セレクタ', selector), field('比較値', value));
    container.append(grid);
  }

  function renderAssistSlots(block, container) {
    const selectedSlots = normalizeAssistSlots(block.config.assistSlots);
    const grid = element('div', { className: 'grid2' });
    for (const slot of [1, 2, 3, 4]) {
      const input = element('input', { type: 'checkbox' });
      input.checked = selectedSlots.includes(slot);
      input.addEventListener('change', () => {
        let accepted = true;
        updateBlockConfig(block, config => {
          const slots = new Set(normalizeAssistSlots(config.assistSlots));
          if (input.checked) slots.add(slot);
          else if (slots.size > 1) slots.delete(slot);
          else accepted = false;
          config.assistSlots = [...slots].sort((a, b) => a - b);
        });
        if (!accepted) input.checked = true;
      });
      grid.append(field(`救援${slot}`, input));
    }
    container.append(
      element('div', { className: 'cardTitle', text: '巡回する救援番号（2件以上で有効）' }),
      grid,
      element('div', { className: 'hint', text: '複数選択時はこの順で切替。1件だけなら従来どおり更新ボタンを使用します。' })
    );
  }

  function renderBlockConfig(block, container) {
    const config = block.config;
    const grid = element('div', { className: 'grid2' });
    const addNumber = (labelText, key, min, max, step) => grid.append(field(labelText,
      numberInput(config[key], min, max, step, input => updateBlockConfig(block, next => { next[key] = finite(input.value, config[key]); }))
    ));
    switch (block.type) {
      case 'gbfAssistSelect':
        addNumber('最低残HP（%）', 'minimumHp', 0, 100, 0.1);
        addNumber('更新基準時間（秒）', 'baseDelaySec', 0, 600, 0.1);
        addNumber('更新ずれ時間 ±秒', 'jitterSec', 0, 600, 0.1);
        addNumber('状態待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('最大再試行回数', 'maxAttempts', 1, 100000, 1);
        container.append(grid);
        renderAssistSlots(block, container);
        renderCandidates(block, container);
        return;
      case 'gbfSupporterConditional':
        addNumber('候補待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        container.append(grid);
        renderCandidates(block, container);
        return;
      case 'gbfSupporterAuto':
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        break;
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack': {
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        const recoveryRoute = textInput(
          config.battleEndRoute,
          input => updateBlockConfig(block, next => { next.battleEndRoute = input.value; }),
          '#quest/assist/multi/0'
        );
        grid.append(field('敵撃破時の戻り先ルート', recoveryRoute));
        const recoveryScreen = selectInput(config.battleEndExpectedScreen, [
          ['auto', '自動判定'], ['assist', '救援一覧'], ['supporter', 'サポーター'], ['unclaimed', '未確認'], ['battle', 'バトル'], ['result', '結果画面']
        ], input => updateBlockConfig(block, next => { next.battleEndExpectedScreen = input.value; }));
        grid.append(field('戻り先の目的画面', recoveryScreen));
        break;
      }
      case 'gbfDeckConfirm':
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('エラー後更新基準（秒）', 'refreshBaseDelaySec', 0, 600, 0.1);
        addNumber('エラー後更新ずれ ±秒', 'refreshJitterSec', 0, 600, 0.1);
        break;
      case 'gbfUnclaimedAll':
        addNumber('画面待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('安全上限件数', 'maxItems', 1, 100000, 1);
        break;
      case 'gbfRefreshAssist':
        addNumber('更新前待機（秒）', 'baseDelaySec', 0, 600, 0.1);
        addNumber('待機ずれ ±秒', 'jitterSec', 0, 600, 0.1);
        addNumber('更新タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        break;
      case 'repeat':
        addNumber('繰り返す回数', 'count', 0, MAX_REPEAT_COUNT, 1);
        break;
      case 'repeatUntil':
        renderConditionFields(block, container);
        addNumber('最大反復回数', 'maxIterations', 1, 100000, 1);
        addNumber('最大実行時間（秒）', 'maxDurationSec', 1, 86400, 1);
        break;
      case 'if':
        renderConditionFields(block, container);
        return;
      case 'stop': {
        const reason = textInput(config.reason, input => updateBlockConfig(block, next => { next.reason = input.value; }), '停止理由');
        grid.append(field('停止理由', reason));
        break;
      }
      case 'fixedWait':
        addNumber('待機秒数', 'seconds', 0, 86400, 0.01);
        break;
      case 'randomWait':
        addNumber('最小秒', 'minSeconds', 0, 86400, 0.01);
        addNumber('最大秒', 'maxSeconds', 0, 86400, 0.01);
        break;
      case 'watch':
        renderConditionFields(block, container);
        addNumber('タイムアウト（秒、0=無制限）', 'timeoutSec', 0, 86400, 1);
        addNumber('成立安定時間（ms）', 'stableMs', 0, 5000, 10);
        break;
      case 'iframeReload':
      case 'iframeBack':
      case 'iframeReady': {
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        const expected = selectInput(config.expectedScreen, [
          ['auto', '自動判定'], ['assist', '救援一覧'], ['supporter', 'サポーター'], ['unclaimed', '未確認'], ['battle', 'バトル'], ['result', '結果画面']
        ], input => updateBlockConfig(block, next => { next.expectedScreen = input.value; }));
        grid.append(field('目的画面', expected));
        break;
      }
      case 'iframeRoute': {
        const route = textInput(config.route, input => updateBlockConfig(block, next => { next.route = input.value; }), '#quest/assist/multi/0');
        grid.append(field('ゲーム内ルート', route));
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        const expected = selectInput(config.expectedScreen, [
          ['auto', '自動判定'], ['assist', '救援一覧'], ['supporter', 'サポーター'], ['unclaimed', '未確認'], ['battle', 'バトル'], ['result', '結果画面']
        ], input => updateBlockConfig(block, next => { next.expectedScreen = input.value; }));
        grid.append(field('目的画面', expected));
        break;
      }
    }
    container.append(grid);
  }

  function createDropZone(list, index) {
    const zone = element('div', { className: 'dropZone' });
    zone.addEventListener('dragover', event => {
      if (!state.dragBlockId) return;
      event.preventDefault();
      zone.classList.add('dragOver');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragOver'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('dragOver');
      if (state.dragBlockId) moveBlockToList(state.dragBlockId, list, index);
      state.dragBlockId = null;
    });
    return zone;
  }

  function renderBlockList(blocks, host, depth = 0, branchName = 'blocks') {
    host.append(createDropZone(blocks, 0));
    blocks.forEach((block, index) => {
      const definition = BLOCK_DEFINITIONS[block.type] || { category: 'control', label: block.type, description: '未対応' };
      const card = element('div', { className: `blockCard category-${definition.category}` });
      card.dataset.blockId = block.id;
      card.draggable = !state.running && supportsNativeBlockDrag;
      card.classList.toggle('running', state.running?.currentBlockId === block.id);
      card.classList.toggle('collapsed', state.collapsed.has(block.id));
      card.addEventListener('dragstart', event => {
        if (state.running || !supportsNativeBlockDrag || event.target.closest?.('button,input,select,textarea,label')) return event.preventDefault();
        state.dragBlockId = block.id;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', block.id);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        state.dragBlockId = null;
        shadow.querySelectorAll('.dropZone.dragOver').forEach(zone => zone.classList.remove('dragOver'));
      });

      const collapse = element('button', { className: 'dragHandle', text: state.collapsed.has(block.id) ? '＋' : '−', title: '折りたたみ' });
      collapse.addEventListener('click', () => {
        if (state.collapsed.has(block.id)) state.collapsed.delete(block.id); else state.collapsed.add(block.id);
        renderWorkflowEditor();
      });
      const name = element('div', { className: 'blockName' }, [
        element('strong', { text: definition.label }),
        element('small', { text: definition.description })
      ]);
      const progress = state.blockProgress.get(block.id);
      if (progress) name.append(element('span', { className: 'progressBadge', text: progress }));
      const tools = element('div', { className: 'blockTools' });
      const tool = (text, title, handler) => {
        const button = element('button', { text, title });
        button.disabled = Boolean(state.running);
        button.addEventListener('click', handler);
        tools.append(button);
      };
      tool('↑', '上へ', () => moveBlockSibling(block.id, -1));
      tool('↓', '下へ', () => moveBlockSibling(block.id, 1));
      tool('→', '直前の親へ入れる', () => indentBlock(block.id));
      tool('←', '親から外へ出す', () => outdentBlock(block.id));
      tool('複製', '複製', () => {
        const location = findBlockLocation(block.id);
        location.list.splice(location.index + 1, 0, cloneBlock(block));
        touchWorkflow();
        renderWorkflowEditor();
      });
      tool('＋下', 'この直後へ追加', () => {
        const location = findBlockLocation(block.id);
        setInsertion(location.list, location.index + 1, `「${definition.label}」の直後`);
      });
      if (definition.container) tool('＋子', '子ブロックへ追加', () => setInsertion(block.children, block.children.length, `「${definition.label}」の内側`));
      tool('削除', '削除', () => {
        removeBlockById(block.id);
        touchWorkflow();
        renderWorkflowEditor();
      });
      const head = element('div', { className: 'blockHead' }, [collapse, name, tools]);
      const body = element('div', { className: 'blockBody' });
      renderBlockConfig(block, body);
      if (state.running) body.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
      card.append(head, body);

      if (definition.container) {
        const childArea = element('div', { className: 'childArea' });
        const childLabel = element('div', { className: 'childLabel' }, [
          element('span', { text: block.type === 'if' ? '条件成立時' : '内側の処理' }),
          element('button', { text: '＋子' })
        ]);
        childLabel.lastElementChild.addEventListener('click', () => setInsertion(block.children, block.children.length, `「${definition.label}」の内側`));
        childArea.append(childLabel);
        renderBlockList(block.children, childArea, depth + 1, 'children');
        card.append(childArea);
      }
      if (definition.elseBranch) {
        const elseArea = element('div', { className: 'childArea' });
        const elseLabel = element('div', { className: 'childLabel' }, [element('span', { text: '条件不成立時' }), element('button', { text: '＋else' })]);
        elseLabel.lastElementChild.addEventListener('click', () => setInsertion(block.elseChildren, block.elseChildren.length, '条件不成立側'));
        elseArea.append(elseLabel);
        renderBlockList(block.elseChildren, elseArea, depth + 1, 'elseChildren');
        card.append(elseArea);
      }
      host.append(card, createDropZone(blocks, index + 1));
    });
  }

  function renderWorkflowEditor() {
    state.runningCard = null;
    state.runningBadge = null;
    workflowEditor.textContent = '';
    const workflow = currentWorkflow();
    if (!workflow) return;
    ui.workflowName.value = workflow.name;
    ui.workflowLoopCount.value = String(workflow.loopCount);
    ui.workflowLoopMode.value = workflow.loopInfinite ? 'infinite' : 'count';
    ui.workflowLoopMode.disabled = Boolean(state.running);
    ui.workflowLoopCount.disabled = Boolean(state.running || workflow.loopInfinite);
    const loopLabel = workflow.loopInfinite ? '無限ループ' : `${workflow.loopCount}回実行`;
    ui.workflowStats.textContent = `${countBlocks(workflow.blocks)}ブロック · ${loopLabel}`;
    if (!workflow.blocks.length) {
      workflowEditor.append(element('div', { className: 'empty', text: 'ブロックがありません。上のパレットまたは完成テンプレートから追加してください。' }));
      return;
    }
    renderBlockList(workflow.blocks, workflowEditor);
  }

  function renderWorkflowSelect() {
    ui.workflowSelect.textContent = '';
    for (const workflow of state.workflows.workflows) {
      ui.workflowSelect.append(element('option', { value: workflow.id, text: workflow.name }));
    }
    ui.workflowSelect.value = state.selectedWorkflowId;
    renderWorkflowEditor();
  }

  function renderPalette() {
    ui.palette.textContent = '';
    for (const [type, definition] of Object.entries(BLOCK_DEFINITIONS)) {
      const button = element('button', { className: `paletteButton ${definition.category}` }, [
        element('strong', { text: `${CATEGORY_LABELS[definition.category]}：${definition.label}` }),
        element('small', { text: definition.description })
      ]);
      button.disabled = Boolean(state.running);
      button.addEventListener('click', () => addBlockAtInsertion(type));
      ui.palette.append(button);
    }
  }

  function renderTemplateSelect() {
    ui.templateSelect.textContent = '';
    for (const [id, labelText] of TEMPLATES) ui.templateSelect.append(element('option', { value: id, text: labelText }));
  }

  class FlowError extends Error {
    constructor(message, code = 'FLOW_ERROR', details = null) {
      super(message);
      this.name = 'FlowError';
      this.code = code;
      this.details = details;
    }
  }

  class FlowStop extends Error {
    constructor(message = '停止しました') {
      super(message);
      this.name = 'FlowStop';
    }
  }

  class FlowRestart extends Error {
    constructor(message = 'ワークフローの先頭から再開します', details = null) {
      super(message);
      this.name = 'FlowRestart';
      this.details = details;
    }
  }

  function abortException(signal) {
    const reason = signal?.reason;
    if (reason instanceof Error) return reason;
    return new DOMException(String(reason || 'Aborted'), 'AbortError');
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortException(signal);
  }

  function abortableDelay(ms, signal) {
    throwIfAborted(signal);
    const delay = Math.max(0, finite(ms, 0));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        callback(value);
      };
      const onResolve = finish(resolve);
      const onReject = finish(reject);
      const onAbort = () => onReject(abortException(signal));
      const timer = setTimeout(() => onResolve(), delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function runObservedAction(waitFactory, action, { signal, cancelMessage = '監視を解除しました' } = {}) {
    throwIfAborted(signal);
    const controller = new AbortController();
    const relayAbort = () => {
      if (!controller.signal.aborted) controller.abort(abortException(signal));
    };
    signal?.addEventListener('abort', relayAbort, { once: true });
    const waitPromise = Promise.resolve().then(() => waitFactory(controller.signal));
    waitPromise.catch(() => {});
    try {
      await action();
      return await waitPromise;
    } catch (error) {
      if (!controller.signal.aborted) controller.abort(new DOMException(cancelMessage, 'AbortError'));
      await waitPromise.catch(() => {});
      throw error;
    } finally {
      signal?.removeEventListener('abort', relayAbort);
    }
  }

  function frameWindow() {
    const win = iframe.contentWindow;
    if (!win) throw new FlowError('iframeがまだ利用できません', 'FRAME_UNAVAILABLE');
    return win;
  }

  function frameDocument() {
    try {
      const doc = iframe.contentDocument || frameWindow().document;
      if (!doc) throw new Error('document unavailable');
      return doc;
    } catch {
      throw new FlowError('iframe内部を読み取れません。同一オリジンで開いてください', 'CROSS_ORIGIN');
    }
  }

  function currentFrameUrl() {
    try {
      return frameWindow().location.href;
    } catch {
      return urlInput.value || iframe.src || '';
    }
  }

  function stopRuntimeTelemetry(win) {
    try {
      win?.DD_RUM?.stopSessionReplayRecording?.();
      win?.DD_RUM?.stopSession?.();
    } catch {}
  }

  function releaseCanvasResources(doc) {
    if (!doc?.querySelectorAll) return;
    for (const canvas of doc.querySelectorAll('canvas')) {
      try {
        const declaredContext = `${canvas.getAttribute('dena-context') || ''} ${canvas.getAttribute('cjs-context') || ''}`.toLowerCase();
        if (declaredContext.includes('webgl')) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        }
      } catch {}
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch {}
    }
  }

  function releaseFrameRuntime(frame) {
    if (!frame) return;
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      stopRuntimeTelemetry(win);

      let routerCleaned = false;
      try {
        if (typeof win?.Game?.router?.move === 'function') {
          win.Game.router.move();
          routerCleaned = true;
        }
      } catch {}
      if (!routerCleaned) {
        try { win?.Game?.view?.content_close?.(); } catch {}
        try { win?.Game?.view?.destroyImages?.(); } catch {}
      }

      try { win?.Backbone?.history?.stop?.(); } catch {}
      try { win?.createjs?.Ticker?.removeAllEventListeners?.(); } catch {}
      try {
        const ticker = win?.createjs?.Ticker;
        if (ticker?._timerId != null) {
          if (ticker._raf) {
            const cancel = win.cancelAnimationFrame || win.webkitCancelAnimationFrame;
            cancel?.call(win, ticker._timerId);
          } else {
            win.clearTimeout(ticker._timerId);
          }
          ticker._timerId = null;
        }
      } catch {}
      try { win?.createjs?.Sound?.stop?.(); } catch {}
      try { win?.createjs?.Sound?.reset?.(true); } catch {}
      try { win?.createjs?.WebAudioPlugin?.reset?.(); } catch {}

      releaseCanvasResources(doc);
      try {
        for (const media of doc?.querySelectorAll?.('audio,video') || []) {
          try { media.pause?.(); } catch {}
          try {
            media.removeAttribute('src');
            media.load?.();
          } catch {}
        }
      } catch {}
      try {
        if (win?.Game) win.Game.view = null;
        win.stage = null;
        win.exportRoot = null;
        win.cjs = null;
        win.lib = null;
        win.images = null;
      } catch {}
      try { win?.stop?.(); } catch {}
    } catch {}
  }

  function blankFrame(frame) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        frame.removeEventListener('load', finish);
        resolve();
      };
      frame.addEventListener('load', finish);
      timer = setTimeout(finish, 400);
      try { frame.contentWindow.location.replace('about:blank'); }
      catch {
        try { frame.src = 'about:blank'; }
        catch { finish(); }
      }
    });
  }

  function handleFrameLoad() {
    const loadedFrame = iframe;
    stopRuntimeTelemetry(loadedFrame?.contentWindow);
    setTimeout(() => {
      if (!state.destroyed && iframe === loadedFrame) stopRuntimeTelemetry(loadedFrame?.contentWindow);
    }, 1200);
    try {
      urlInput.value = iframe.contentWindow.location.href;
      state.legacy.url = urlInput.value;
      saveLegacyState();
      if (!state.running && !state.legacyRunning) setStatus('読込完了');
    } catch {
      if (!state.running && !state.legacyRunning) setStatus('読込完了・別オリジン');
    }
  }

  function bindFrameLoad(frame) {
    frame.addEventListener('load', handleFrameLoad);
  }

  async function replaceFrame(destination) {
    const targetUrl = String(destination || '').trim();
    if (!targetUrl) throw new FlowError('iframeの移動先が空です', 'INVALID_ROUTE');
    const previousFrame = iframe;
    previousFrame.removeEventListener('load', handleFrameLoad);
    releaseFrameRuntime(previousFrame);
    await blankFrame(previousFrame);
    await new Promise(resolve => setTimeout(resolve, 0));
    const nextFrame = previousFrame.cloneNode(false);
    nextFrame.removeAttribute('src');
    bindFrameLoad(nextFrame);
    iframe = nextFrame;
    previousFrame.replaceWith(nextFrame);
    nextFrame.src = targetUrl;
    if (window.__AUTO_TEST__) window.__AUTO_TEST__.iframe = nextFrame;
    return nextFrame;
  }

  function computedVisible(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    const inlineStyle = element.style;
    if (inlineStyle) {
      if (inlineStyle.display === 'none' || inlineStyle.visibility === 'hidden' || inlineStyle.visibility === 'collapse') return false;
      if (inlineStyle.opacity !== '' && Number(inlineStyle.opacity) === 0) return false;
    }
    const view = element.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle?.(element);
    if (style) {
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (Number(style.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0 && element.getClientRects?.().length);
  }

  function hiddenOrAbsent(doc, selector) {
    const element = doc.querySelector(selector);
    return !element || !computedVisible(element);
  }

  function popupInfo(doc = frameDocument()) {
    const popup = doc.querySelector(SELECTORS.popup);
    if (!popup || !computedVisible(popup)) return null;
    const body = popup.querySelector(SELECTORS.popupBody);
    const text = normalizePopupText(body?.textContent || '');
    let type = 'UNKNOWN_ERROR';
    if (text === NORMALIZED_ERRORS.MAX_ASSIST) type = 'MAX_ASSIST_ERROR';
    else if (text === NORMALIZED_ERRORS.UNCLAIMED) type = 'UNCLAIMED_ERROR';
    else if (text === NORMALIZED_ERRORS.RAID_FULL) type = 'RAID_FULL_ERROR';
    return { type, text, rawText: String(body?.textContent || '').trim(), popup, ok: popup.querySelector(SELECTORS.popupOk) };
  }

  function detectScreenState(doc = frameDocument()) {
    const popup = popupInfo(doc);
    if (popup) return { ...popup, document: doc };
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { type: 'DECK_CONFIRM', element: deckOk, document: doc };
    const unclaimedList = doc.querySelector(SELECTORS.unclaimedList);
    if (unclaimedList) return { type: 'UNCLAIMED_LIST', element: unclaimedList, document: doc };
    const supporter = doc.querySelector(SELECTORS.supporterScreen);
    if (supporter) return { type: 'SUPPORTER', element: supporter, document: doc };
    const assist = doc.querySelector(SELECTORS.assistScreen);
    if (assist) return { type: 'ASSIST_LIST', element: assist, document: doc };
    const battle = doc.querySelector(SELECTORS.battleScreen);
    if (battle) return { type: 'BATTLE', element: battle, document: doc };
    if (currentFrameUrl().includes('result_multi/')) return { type: 'RESULT', document: doc };
    return { type: 'UNKNOWN', document: doc };
  }

  function safeDetectScreenState() {
    try {
      return detectScreenState();
    } catch (error) {
      return { type: error.code || 'UNAVAILABLE', error };
    }
  }

  function screenSignature(doc = frameDocument(), stateInfo = null) {
    const detected = stateInfo || detectScreenState(doc);
    let detail = '';
    if (detected.type === 'ASSIST_LIST') {
      detail = assistListSignature(doc.querySelector(SELECTORS.assistList));
    } else if (detected.type === 'UNCLAIMED_LIST') {
      detail = Array.from(doc.querySelectorAll(SELECTORS.unclaimedRows), row =>
        row.dataset.raidId || row.dataset.href || ''
      ).slice(0, 12).join('|');
    } else if (detected.type.endsWith('_ERROR')) {
      detail = detected.text || detected.rawText || '';
    }
    return `${detected.type}|${detail}|${doc.body?.childElementCount || 0}`;
  }

  function captureFrameState() {
    let doc = null;
    let href = currentFrameUrl();
    let screen = 'UNAVAILABLE';
    let signature = '';
    try {
      doc = frameDocument();
      const stateInfo = detectScreenState(doc);
      screen = stateInfo.type;
      signature = screenSignature(doc, stateInfo);
    } catch {}
    return { doc, href, screen, signature, at: performance.now() };
  }

  function expectedScreenMatches(expected, doc, stateInfo = detectScreenState(doc)) {
    if (!expected || expected === 'auto') return ['ASSIST_LIST', 'SUPPORTER', 'DECK_CONFIRM', 'UNCLAIMED_LIST', 'BATTLE', 'RESULT'].includes(stateInfo.type);
    if (expected === 'assist') return stateInfo.type === 'ASSIST_LIST';
    if (expected === 'supporter') return stateInfo.type === 'SUPPORTER' || stateInfo.type === 'DECK_CONFIRM';
    if (expected === 'unclaimed') return stateInfo.type === 'UNCLAIMED_LIST';
    if (expected === 'battle') return stateInfo.type === 'BATTLE';
    if (expected === 'result') return stateInfo.type === 'RESULT' || currentFrameUrl().includes('result_multi/');
    return false;
  }

  function pageBaseReady(doc) {
    return ['interactive', 'complete'].includes(doc.readyState)
      && hiddenOrAbsent(doc, '#loading')
      && hiddenOrAbsent(doc, '#ready');
  }

  function monitorFrame(check, {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    stableMs = 0,
    description = '状態待ち',
    allowInterval = true,
    observeRoots = null,
    observeOnLightweight = false,
    observeCharacterData = false,
    intervalMs = null
  } = {}) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      let observer = null;
      let observedDoc = null;
      let observedRoots = [];
      let timeout = null;
      let interval = null;
      let stableSince = null;
      let lastMutation = performance.now();

      const cleanupMonitor = () => {
        observer?.disconnect();
        observer = null;
        observedDoc = null;
        observedRoots = [];
        clearTimeout(timeout);
        clearInterval(interval);
        iframe.removeEventListener('load', onFrameLoad);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanupMonitor();
        callback(value);
      };
      const onAbort = () => finish(reject, abortException(signal));
      const onFrameLoad = () => {
        lastMutation = performance.now();
        bindObserver();
        evaluate();
      };
      const bindObserver = () => {
        let doc;
        try { doc = frameDocument(); } catch { return; }
        if (lightweightMode && !observeOnLightweight) {
          if (doc !== observedDoc) {
            observer?.disconnect();
            observer = null;
            observedDoc = doc;
            observedRoots = [];
          }
          return;
        }
        let requestedRoots = observeRoots;
        if (typeof observeRoots === 'function') {
          try { requestedRoots = observeRoots(doc); } catch { requestedRoots = []; }
        }
        if (requestedRoots == null) requestedRoots = [doc.documentElement || doc];
        const roots = [...new Set((Array.isArray(requestedRoots) ? requestedRoots : [requestedRoots]).filter(root =>
          root && root.ownerDocument === doc && root.isConnected !== false
        ))];
        const unchanged = doc === observedDoc
          && roots.length === observedRoots.length
          && roots.every((root, index) => root === observedRoots[index]);
        if (unchanged) return;
        observer?.disconnect();
        observedDoc = doc;
        observedRoots = roots;
        if (!roots.length) return;
        let scheduled = false;
        observer = new MutationObserver(() => {
          lastMutation = performance.now();
          stableSince = null;
          if (scheduled) return;
          scheduled = true;
          const run = () => { scheduled = false; evaluate(); };
          if (observeOnLightweight) queueMicrotask(run);
          else requestAnimationFrame(run);
        });
        for (const rootNode of roots) {
          try {
            observer.observe(rootNode, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['class', 'style'],
              characterData: observeCharacterData
            });
          } catch {}
        }
      };
      const evaluate = () => {
        if (settled) return;
        if (signal?.aborted) return onAbort();
        bindObserver();
        let result;
        try {
          result = check({ lastMutation });
        } catch (error) {
          if (error instanceof FlowError && ['CROSS_ORIGIN', 'FRAME_UNAVAILABLE'].includes(error.code)) return;
          return finish(reject, error);
        }
        if (!result) {
          stableSince = null;
          return;
        }
        const now = performance.now();
        if (stableMs > 0) {
          if (stableSince == null) stableSince = now;
          const stableFrom = Math.max(stableSince, lastMutation);
          if (now - stableFrom < stableMs) return;
        }
        finish(resolve, result === true ? {} : result);
      };

      iframe.addEventListener('load', onFrameLoad);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (timeoutMs > 0) timeout = setTimeout(() => finish(reject, new FlowError(`${description}がタイムアウトしました`, 'TIMEOUT')), timeoutMs);
      if (allowInterval) {
        const pollingInterval = intervalMs ?? (timeoutMs === 0 ? 1000 : (lightweightMode ? 750 : 300));
        interval = setInterval(evaluate, Math.max(50, pollingInterval));
      }
      bindObserver();
      evaluate();
    });
  }

  async function waitForFrameReady({ signal, timeoutMs = DEFAULT_TIMEOUT_MS, expectedScreen = 'auto', before = null, requireChange = false, stableMs = DEFAULT_STABLE_MS } = {}) {
    const baseline = requireChange ? (before || captureFrameState()) : null;
    return monitorFrame(() => {
      const doc = frameDocument();
      const stateInfo = detectScreenState(doc);
      if (!pageBaseReady(doc)) return false;
      if (!expectedScreenMatches(expectedScreen, doc, stateInfo)) return false;
      if (requireChange) {
        const changed = doc !== baseline.doc
          || currentFrameUrl() !== baseline.href
          || stateInfo.type !== baseline.screen
          || screenSignature(doc, stateInfo) !== baseline.signature;
        if (!changed) return false;
      }
      return { document: doc, state: stateInfo.type, url: currentFrameUrl() };
    }, { signal, timeoutMs, stableMs, description: 'ページ読込完了待ち' });
  }

  async function performFrameOperation(operation, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, expectedScreen = 'auto', requireChange = true } = {}) {
    const before = captureFrameState();
    return runObservedAction(
      waitSignal => waitForFrameReady({ signal: waitSignal, timeoutMs, expectedScreen, before, requireChange }),
      () => {
        try {
          operation();
        } catch (error) {
          throw new FlowError(`iframe操作に失敗しました: ${error.message}`, 'NAVIGATION_FAILED');
        }
      },
      { signal, cancelMessage: 'iframe操作監視を解除しました' }
    );
  }

  function gameRouteUrl(route) {
    const raw = String(route || '').trim();
    if (!raw) throw new FlowError('ゲーム内ルートが空です', 'INVALID_ROUTE');
    const current = new URL(currentFrameUrl() || urlInput.value || location.href, location.href);
    if (/^https?:/i.test(raw)) return new URL(raw).href;
    if (raw.startsWith('#')) {
      current.hash = raw.slice(1);
      return current.href;
    }
    if (raw.startsWith('/')) return new URL(raw, current.origin).href;
    current.hash = raw.replace(/^#/, '');
    return current.href;
  }

  let tapQueue = Promise.resolve();
  const activeTapTargets = new WeakSet();

  function queueExclusive(task) {
    const next = tapQueue.then(task, task);
    tapQueue = next.catch(() => {});
    return next;
  }

  const TOUCH_VISIBLE_LATENCY_MS = Object.freeze({ mean: 130, stdDev: 20, min: 80, max: 250 });
  const TOUCH_HOLD_LATENCY_MS = Object.freeze({ mean: 95, stdDev: 15, min: 50, max: 180 });
  const TOUCH_SCROLL_SETTLE_LATENCY_MS = Object.freeze({ mean: 72, stdDev: 16, min: 36, max: 130 });
  const TOUCH_SCROLL_INERTIA_LATENCY_MS = Object.freeze({ mean: 180, stdDev: 34, min: 110, max: 290 });
  const TOUCH_START_STDDEV_RATIO = Object.freeze({ mean: 0.135, stdDev: 0.008, min: 0.12, max: 0.15 });
  const TOUCH_SESSION_OFFSET_X_RATIO = Object.freeze({ mean: 0.03, stdDev: 0.006, min: 0.015, max: 0.045 });
  const TOUCH_SESSION_OFFSET_Y_RATIO = Object.freeze({ mean: 0.02, stdDev: 0.006, min: 0.005, max: 0.035 });
  const TOUCH_COORDINATE_INSET_RATIO = 0.001;
  const TOUCH_DRIFT_STDDEV_RATIO = 0.012;
  const TOUCH_DRIFT_STDDEV_MIN_PX = 0.35;
  const TOUCH_DRIFT_STDDEV_MAX_PX = 3;
  const TOUCH_TRAJECTORY_NOISE_CORRELATION = 0.72;
  const SCROLL_SPEED_MIN_PX_PER_SEC = 900;
  const SCROLL_SPEED_MAX_PX_PER_SEC = 1800;
  const SCROLL_INERTIA_MIN_DISTANCE_PX = 80;
  const TRUNCATED_NORMAL_MAX_ATTEMPTS = 10_000;

  function sampleStandardNormal(random = Math.random) {
    const u1 = Math.max(Number.MIN_VALUE, 1 - random());
    const u2 = 1 - random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sampleTruncatedNormal({ mean, stdDev, min, max }, random = Math.random) {
    const meanValue = Number(mean);
    const stdDevValue = Number(stdDev);
    const minValue = Number(min);
    const maxValue = Number(max);
    if (![meanValue, stdDevValue, minValue, maxValue].every(Number.isFinite)
      || stdDevValue < 0
      || maxValue < minValue) {
      throw new FlowError('切断正規分布のパラメータが不正です', 'INVALID_TRUNCATED_NORMAL');
    }
    if (stdDevValue === 0) {
      if (meanValue < minValue || meanValue > maxValue) {
        throw new FlowError('標準偏差0の平均値が切断範囲外です', 'INVALID_TRUNCATED_NORMAL');
      }
      return meanValue;
    }
    for (let attempt = 0; attempt < TRUNCATED_NORMAL_MAX_ATTEMPTS; attempt++) {
      const sample = meanValue + (sampleStandardNormal(random) * stdDevValue);
      if (sample >= minValue && sample <= maxValue) return sample;
    }
    throw new FlowError('切断正規分布の再抽選上限に達しました', 'TRUNCATED_NORMAL_EXHAUSTED');
  }

  function sampleTruncatedNormalMs(config, random = Math.random) {
    const minValue = Number(config?.min);
    const maxValue = Number(config?.max);
    for (let attempt = 0; attempt < TRUNCATED_NORMAL_MAX_ATTEMPTS; attempt++) {
      const rounded = Math.round(sampleTruncatedNormal(config, random));
      if (rounded >= minValue && rounded <= maxValue) return rounded;
    }
    throw new FlowError('切断正規分布の時間再抽選上限に達しました', 'TRUNCATED_NORMAL_MS_EXHAUSTED');
  }

  const TOUCH_SESSION = Object.freeze({
    rightOffsetX: sampleTruncatedNormal(TOUCH_SESSION_OFFSET_X_RATIO),
    verticalOffsetY: sampleTruncatedNormal(TOUCH_SESSION_OFFSET_Y_RATIO),
    startStdDevRatio: sampleTruncatedNormal(TOUCH_START_STDDEV_RATIO)
  });

  function createSyntheticTouch(win, target, identifier, point) {
    if (typeof win.Touch !== 'function') {
      throw new FlowError('この環境は標準Touchコンストラクタに対応していません', 'TOUCH_UNSUPPORTED');
    }
    const init = {
      identifier,
      target,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x + finite(win.screenX, 0),
      screenY: point.y + finite(win.screenY, 0),
      pageX: point.x + finite(win.scrollX, 0),
      pageY: point.y + finite(win.scrollY, 0)
    };
    try {
      return new win.Touch(init);
    } catch (error) {
      throw new FlowError(`Touch生成に失敗しました: ${error.message}`, 'TOUCH_CONSTRUCTION_FAILED');
    }
  }

  function dispatchSyntheticTouch(win, target, type, touch, active) {
    if (typeof win.TouchEvent !== 'function') {
      throw new FlowError('この環境は標準TouchEventに対応していません', 'TOUCH_EVENT_UNSUPPORTED');
    }
    const activeTouches = active ? [touch] : [];
    let event;
    try {
      event = new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      });
    } catch (error) {
      throw new FlowError(`TouchEvent生成に失敗しました: ${error.message}`, 'TOUCH_EVENT_CONSTRUCTION_FAILED');
    }
    // preventDefault() is a normal part of many touch handlers: it suppresses
    // emulated mouse/click behavior while the page still consumes the gesture.
    // Do not terminate touchmove/touchend merely because dispatchEvent() is false.
    target.dispatchEvent(event);
    return event;
  }

  function scrollableAncestors(target) {
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const result = [];
    for (let node = target.parentElement; node && node !== doc.documentElement; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      if (canScrollX || canScrollY) result.push(node);
    }
    const root = doc.scrollingElement || doc.documentElement;
    if (root && !result.includes(root)) result.push(root);
    return result;
  }

  function scrollViewport(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    }
    const rect = scroller.getBoundingClientRect();
    return {
      left: rect.left + scroller.clientLeft,
      top: rect.top + scroller.clientTop,
      right: rect.left + scroller.clientLeft + scroller.clientWidth,
      bottom: rect.top + scroller.clientTop + scroller.clientHeight
    };
  }

  function scrollPosition(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return { x: finite(win.scrollX, root.scrollLeft), y: finite(win.scrollY, root.scrollTop) };
    }
    return { x: scroller.scrollLeft, y: scroller.scrollTop };
  }

  function setScrollPosition(win, scroller, x, y) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      win.scrollTo(x, y);
      return;
    }
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
  }

  function maxScrollPosition(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return {
        x: Math.max(0, root.scrollWidth - win.innerWidth),
        y: Math.max(0, root.scrollHeight - win.innerHeight)
      };
    }
    return {
      x: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      y: Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    };
  }

  function nextAnimationFrame(win, signal) {
    return new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const request = win.requestAnimationFrame?.bind(win)
        || (callback => win.setTimeout(() => callback(win.performance?.now?.() ?? performance.now()), 16));
      const cancel = win.cancelAnimationFrame?.bind(win) || win.clearTimeout.bind(win);
      let frameId = 0;
      const onAbort = () => {
        cancel(frameId);
        reject(abortException(signal));
      };
      frameId = request(timestamp => {
        signal?.removeEventListener('abort', onAbort);
        resolve(timestamp);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  function quadraticBezierScalar(p0, p1, p2, progress) {
    const inverse = 1 - progress;
    return (inverse * inverse * p0) + (2 * inverse * progress * p1) + (progress * progress * p2);
  }

  function quadraticBezier(start, control, end, progress) {
    return {
      x: quadraticBezierScalar(start.x, control.x, end.x, progress),
      y: quadraticBezierScalar(start.y, control.y, end.y, progress)
    };
  }

  function pointWithinRect(point, rect) {
    return point.x >= rect.left
      && point.x <= rect.right
      && point.y >= rect.top
      && point.y <= rect.bottom;
  }

  function createCorrelatedTrajectory(start, end, rect, random = Math.random) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const perpendicular = distance > Number.EPSILON
      ? { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance }
      : { x: 0, y: 0 };
    const bendStdDev = Math.min(2.4, Math.max(0.2, distance * 0.035));
    const bend = sampleTruncatedNormal({
      mean: 0,
      stdDev: bendStdDev,
      min: -bendStdDev * 2,
      max: bendStdDev * 2
    }, random);
    const controlMean = {
      x: midpoint.x + (perpendicular.x * bend),
      y: midpoint.y + (perpendicular.y * bend)
    };
    const controlStdDev = Math.min(1.4, Math.max(0.15, distance * 0.012));
    const control = {
      x: sampleTruncatedNormal({
        mean: controlMean.x,
        stdDev: controlStdDev,
        min: rect.left,
        max: rect.right
      }, random),
      y: sampleTruncatedNormal({
        mean: controlMean.y,
        stdDev: controlStdDev,
        min: rect.top,
        max: rect.bottom
      }, random)
    };
    return {
      start,
      end,
      control,
      rect,
      noiseX: 0,
      noiseY: 0,
      noiseStdDev: Math.min(0.85, Math.max(0.08, distance * 0.006))
    };
  }

  function sampleCorrelatedTrajectoryPoint(trajectory, progress, random = Math.random) {
    const base = quadraticBezier(trajectory.start, trajectory.control, trajectory.end, progress);
    const innovationScale = Math.sqrt(1 - (TOUCH_TRAJECTORY_NOISE_CORRELATION ** 2));
    const fade = Math.sin(Math.PI * progress);
    for (let attempt = 0; attempt < 32; attempt++) {
      const nextNoiseX = (TOUCH_TRAJECTORY_NOISE_CORRELATION * trajectory.noiseX)
        + (sampleStandardNormal(random) * trajectory.noiseStdDev * innovationScale);
      const nextNoiseY = (TOUCH_TRAJECTORY_NOISE_CORRELATION * trajectory.noiseY)
        + (sampleStandardNormal(random) * trajectory.noiseStdDev * innovationScale);
      const candidate = {
        x: base.x + (nextNoiseX * fade),
        y: base.y + (nextNoiseY * fade)
      };
      if (pointWithinRect(candidate, trajectory.rect)) {
        trajectory.noiseX = nextNoiseX;
        trajectory.noiseY = nextNoiseY;
        return candidate;
      }
    }
    trajectory.noiseX = 0;
    trajectory.noiseY = 0;
    return base;
  }

  function scrollVelocityEnvelope(progress) {
    if (progress <= 0.2) {
      return quadraticBezierScalar(0, 0.58, 1, progress / 0.2);
    }
    if (progress <= 0.72) return 1;
    return quadraticBezierScalar(1, 0.62, 0, (progress - 0.72) / 0.28);
  }

  function integrateScrollVelocity(progress, steps = 48) {
    if (progress <= 0) return 0;
    const count = Math.max(1, Math.ceil(steps * progress));
    const width = progress / count;
    let area = 0;
    let previous = scrollVelocityEnvelope(0);
    for (let index = 1; index <= count; index++) {
      const current = scrollVelocityEnvelope(index * width);
      area += ((previous + current) / 2) * width;
      previous = current;
    }
    return area;
  }

  const SCROLL_VELOCITY_AREA = integrateScrollVelocity(1);

  function sampleScrollGesturePoints(viewport, delta, random = Math.random) {
    const width = viewport.right - viewport.left;
    const height = viewport.bottom - viewport.top;
    const insetX = Math.min(12, width * 0.12);
    const insetY = Math.min(12, height * 0.12);
    const horizontalDominant = Math.abs(delta.x) > Math.abs(delta.y);
    const directionX = Math.sign(delta.x);
    const directionY = Math.sign(delta.y);
    const startMeanX = horizontalDominant
      ? viewport.left + (width * (directionX >= 0 ? 0.72 : 0.28))
      : viewport.left + (width * (0.5 + TOUCH_SESSION.rightOffsetX));
    const startMeanY = horizontalDominant
      ? viewport.top + (height * (0.5 + TOUCH_SESSION.verticalOffsetY))
      : viewport.top + (height * (directionY >= 0 ? 0.72 : 0.28));
    const endMeanX = horizontalDominant
      ? viewport.left + (width * (directionX >= 0 ? 0.28 : 0.72))
      : startMeanX;
    const endMeanY = horizontalDominant
      ? startMeanY
      : viewport.top + (height * (directionY >= 0 ? 0.28 : 0.72));
    const stdDevX = Math.max(0.5, width * 0.035);
    const stdDevY = Math.max(0.5, height * 0.035);
    const bounds = {
      left: viewport.left + insetX,
      top: viewport.top + insetY,
      right: viewport.right - insetX,
      bottom: viewport.bottom - insetY
    };
    return {
      bounds,
      start: {
        x: sampleTruncatedNormal({ mean: startMeanX, stdDev: stdDevX, min: bounds.left, max: bounds.right }, random),
        y: sampleTruncatedNormal({ mean: startMeanY, stdDev: stdDevY, min: bounds.top, max: bounds.bottom }, random)
      },
      end: {
        x: sampleTruncatedNormal({ mean: endMeanX, stdDev: stdDevX, min: bounds.left, max: bounds.right }, random),
        y: sampleTruncatedNormal({ mean: endMeanY, stdDev: stdDevY, min: bounds.top, max: bounds.bottom }, random)
      }
    };
  }

  function highResolutionNow(win) {
    return win.performance?.now?.() ?? performance.now();
  }

  async function animatePhysicalScroll(win, scroller, destination, signal) {
    const start = scrollPosition(win, scroller);
    const max = maxScrollPosition(win, scroller);
    const end = {
      x: Math.min(max.x, Math.max(0, destination.x)),
      y: Math.min(max.y, Math.max(0, destination.y))
    };
    const delta = { x: end.x - start.x, y: end.y - start.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance < 1) return false;

    const speed = randomUniform(SCROLL_SPEED_MIN_PX_PER_SEC, SCROLL_SPEED_MAX_PX_PER_SEC);
    const rawDuration = (distance / speed) * 1000;
    const durationMean = Math.min(860, Math.max(170, rawDuration));
    const duration = sampleTruncatedNormalMs({
      mean: durationMean,
      stdDev: Math.max(18, durationMean * 0.08),
      min: 140,
      max: 900
    });
    const useInertia = distance >= SCROLL_INERTIA_MIN_DISTANCE_PX;
    const dragRatio = useInertia
      ? sampleTruncatedNormal({ mean: 0.86, stdDev: 0.025, min: 0.8, max: 0.91 })
      : 1;
    const viewport = scrollViewport(win, scroller);
    const gesture = sampleScrollGesturePoints(viewport, delta);
    const dispatchTarget = win.document.elementFromPoint(gesture.start.x, gesture.start.y)
      || (scroller.nodeType === 1 ? scroller : win.document.body);
    const identifier = Math.floor(randomUniform(1, 2_147_483_647));
    const trajectory = createCorrelatedTrajectory(gesture.start, gesture.end, gesture.bounds);
    let activePoint = gesture.start;
    let touchActive = false;

    try {
      const startTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
      dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true);
      touchActive = true;
      const startedAt = highResolutionNow(win);
      while (true) {
        const now = await nextAnimationFrame(win, signal);
        const elapsedProgress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const scrollProgress = integrateScrollVelocity(elapsedProgress) / SCROLL_VELOCITY_AREA;
        activePoint = sampleCorrelatedTrajectoryPoint(trajectory, elapsedProgress);
        const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        setScrollPosition(
          win,
          scroller,
          start.x + (delta.x * dragRatio * scrollProgress),
          start.y + (delta.y * dragRatio * scrollProgress)
        );
        if (elapsedProgress >= 1) break;
      }

      activePoint = gesture.end;
      const endTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
      dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false);
      touchActive = false;

      if (useInertia) {
        const inertiaStart = scrollPosition(win, scroller);
        const inertiaDuration = sampleTruncatedNormalMs(TOUCH_SCROLL_INERTIA_LATENCY_MS);
        const inertiaStartedAt = highResolutionNow(win);
        const decayDenominator = 1 - Math.exp(-5);
        while (true) {
          const now = await nextAnimationFrame(win, signal);
          const progress = Math.min(1, Math.max(0, (now - inertiaStartedAt) / inertiaDuration));
          const decayed = (1 - Math.exp(-5 * progress)) / decayDenominator;
          setScrollPosition(
            win,
            scroller,
            inertiaStart.x + ((end.x - inertiaStart.x) * decayed),
            inertiaStart.y + ((end.y - inertiaStart.y) * decayed)
          );
          if (progress >= 1) break;
        }
      }

      setScrollPosition(win, scroller, end.x, end.y);
      await abortableDelay(sampleTruncatedNormalMs(TOUCH_SCROLL_SETTLE_LATENCY_MS), signal);
      return true;
    } catch (error) {
      if (touchActive) {
        try {
          const cancelTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchcancel', cancelTouch, false);
        } catch {}
      }
      throw error;
    }
  }

  function pointForTarget(target, fractions) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new FlowError('押下対象の大きさを取得できません', 'TARGET_HAS_NO_AREA');
    }
    if (!Number.isFinite(fractions?.x) || !Number.isFinite(fractions?.y)
      || fractions.x <= 0 || fractions.x >= 1
      || fractions.y <= 0 || fractions.y >= 1) {
      throw new FlowError('押下座標比率が要素範囲外です', 'TARGET_POINT_OUT_OF_RANGE');
    }
    return {
      rect,
      x: rect.left + (rect.width * fractions.x),
      y: rect.top + (rect.height * fractions.y)
    };
  }

  function pointInsideViewport(point, viewport, margin = 1) {
    return point.x >= viewport.left + margin
      && point.x < viewport.right - margin
      && point.y >= viewport.top + margin
      && point.y < viewport.bottom - margin;
  }

  async function ensureTargetPointVisible(target, fractions, { signal } = {}) {
    const win = target.ownerDocument.defaultView;
    let scrolled = false;
    for (const scroller of scrollableAncestors(target)) {
      throwIfAborted(signal);
      const point = pointForTarget(target, fractions);
      const viewport = scrollViewport(win, scroller);
      if (pointInsideViewport(point, viewport, 4)) continue;
      const current = scrollPosition(win, scroller);
      const anchorX = randomUniform(0.38, 0.62);
      const anchorY = randomUniform(0.34, 0.66);
      const desiredX = viewport.left + ((viewport.right - viewport.left) * anchorX);
      const desiredY = viewport.top + ((viewport.bottom - viewport.top) * anchorY);
      scrolled = await animatePhysicalScroll(win, scroller, {
        x: current.x + point.x - desiredX,
        y: current.y + point.y - desiredY
      }, signal) || scrolled;
    }
    const finalPoint = pointForTarget(target, fractions);
    const viewport = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    if (!pointInsideViewport(finalPoint, viewport, 1)) {
      throw new FlowError('押下対象を画面内までスクロールできませんでした', 'TARGET_OFFSCREEN');
    }
    return { ...finalPoint, scrolled };
  }

  function sampleTouchStartFractions(random = Math.random) {
    const inset = TOUCH_COORDINATE_INSET_RATIO;
    return {
      x: sampleTruncatedNormal({
        mean: 0.5 + TOUCH_SESSION.rightOffsetX,
        stdDev: TOUCH_SESSION.startStdDevRatio,
        min: inset,
        max: 1 - inset
      }, random),
      y: sampleTruncatedNormal({
        mean: 0.5 + TOUCH_SESSION.verticalOffsetY,
        stdDev: TOUCH_SESSION.startStdDevRatio,
        min: inset,
        max: 1 - inset
      }, random)
    };
  }

  function sampleTouchEndPoint(start, rect, random = Math.random) {
    const stdDev = Math.min(
      TOUCH_DRIFT_STDDEV_MAX_PX,
      Math.max(
        TOUCH_DRIFT_STDDEV_MIN_PX,
        Math.min(rect.width, rect.height) * TOUCH_DRIFT_STDDEV_RATIO
      )
    );
    const insetX = Math.min(0.01, rect.width / 2);
    const insetY = Math.min(0.01, rect.height / 2);
    return {
      x: sampleTruncatedNormal({
        mean: start.x,
        stdDev,
        min: rect.left + insetX,
        max: rect.right - insetX
      }, random),
      y: sampleTruncatedNormal({
        mean: start.y,
        stdDev,
        min: rect.top + insetY,
        max: rect.bottom - insetY
      }, random)
    };
  }

  function determineTouchMoveCount(durationMs, distancePx, random = Math.random) {
    const duration = Math.max(1, finite(durationMs, 1));
    const distance = Math.max(0, finite(distancePx, 0));
    const meanIntervalMs = sampleTruncatedNormal({
      mean: 15.5,
      stdDev: 3.4,
      min: 7.5,
      max: 27
    }, random);
    const expectedCount = (duration / meanIntervalMs) + Math.min(4.5, distance / 2.4);
    const dynamicMaximum = Math.max(2, Math.floor(duration / 5.5));
    return Math.round(sampleTruncatedNormal({
      mean: Math.max(1, expectedCount),
      stdDev: Math.max(1.15, expectedCount * 0.34),
      min: 1,
      max: dynamicMaximum
    }, random));
  }

  function sampleTouchMoveProgresses(moveCount, random = Math.random) {
    const count = Math.max(1, Math.floor(finite(moveCount, 1)));
    const gapCount = count + 1;
    const gaps = [];
    let previousWeight = 1;
    for (let index = 0; index < gapCount; index++) {
      const independentWeight = Math.exp(sampleTruncatedNormal({
        mean: 0,
        stdDev: 0.52,
        min: -1.35,
        max: 1.35
      }, random));
      const correlatedWeight = (previousWeight * 0.38) + (independentWeight * 0.62);
      const edgeScale = index === 0 || index === gapCount - 1
        ? sampleTruncatedNormal({ mean: 1.08, stdDev: 0.16, min: 0.72, max: 1.48 }, random)
        : 1;
      const weight = Math.max(0.08, correlatedWeight * edgeScale);
      gaps.push(weight);
      previousWeight = weight;
    }
    const total = gaps.reduce((sum, gap) => sum + gap, 0);
    const progresses = [];
    let elapsed = 0;
    for (let index = 0; index < count; index++) {
      elapsed += gaps[index];
      progresses.push(elapsed / total);
    }
    return progresses;
  }

  async function waitForGestureProgress(win, startedAt, durationMs, progress, signal) {
    const targetTime = startedAt + (durationMs * progress);
    while (true) {
      const remaining = targetTime - highResolutionNow(win);
      if (remaining <= 0) return;
      if (remaining > 20) {
        await abortableDelay(remaining - 8, signal);
      } else {
        await nextAnimationFrame(win, signal);
      }
    }
  }

  async function jqTapStrict(target, { signal, label: targetLabel = '対象' } = {}) {
    if (!target || !target.isConnected) throw new FlowError(`${targetLabel}が見つかりません`, 'TARGET_MISSING');
    return queueExclusive(async () => {
      throwIfAborted(signal);
      if (activeTapTargets.has(target)) throw new FlowError(`${targetLabel}はすでに押下処理中です`, 'TAP_BUSY');
      const win = target.ownerDocument?.defaultView;
      if (!win || win !== frameWindow()) throw new FlowError(`${targetLabel}が現在のiframeに属していません`, 'STALE_TARGET');
      activeTapTargets.add(target);
      let dispatchTarget = null;
      let identifier = null;
      let activePoint = null;
      let touchActive = false;
      try {
        const fractions = sampleTouchStartFractions();
        let start = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          await ensureTargetPointVisible(target, fractions, { signal });
          await abortableDelay(sampleTruncatedNormalMs(TOUCH_VISIBLE_LATENCY_MS), signal);
          if (!target.isConnected || target.ownerDocument?.defaultView !== frameWindow()) {
            throw new FlowError(`${targetLabel}が押下直前に無効になりました`, 'STALE_TARGET');
          }
          const checked = await ensureTargetPointVisible(target, fractions, { signal });
          if (!checked.scrolled) {
            start = checked;
            break;
          }
        }
        if (!start) throw new FlowError(`${targetLabel}の表示位置が安定しません`, 'TARGET_UNSTABLE');
        const hit = target.ownerDocument.elementFromPoint(start.x, start.y);
        if (!hit || (hit !== target && !target.contains(hit))) {
          throw new FlowError(`${targetLabel}のガウス座標が他要素に遮られています`, 'TARGET_OCCLUDED');
        }
        dispatchTarget = hit;
        identifier = Math.floor(randomUniform(1, 2_147_483_647));
        activePoint = start;
        const startTouch = createSyntheticTouch(win, dispatchTarget, identifier, start);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true);
        touchActive = true;
        const holdDuration = sampleTruncatedNormalMs(TOUCH_HOLD_LATENCY_MS);
        const endPoint = sampleTouchEndPoint(start, start.rect);
        const movement = Math.hypot(endPoint.x - start.x, endPoint.y - start.y);
        const moveCount = determineTouchMoveCount(holdDuration, movement);
        const moveProgresses = sampleTouchMoveProgresses(moveCount);
        const trajectory = createCorrelatedTrajectory(start, endPoint, start.rect);
        const startedAt = highResolutionNow(win);
        for (const moveProgress of moveProgresses) {
          await waitForGestureProgress(win, startedAt, holdDuration, moveProgress, signal);
          const movePoint = sampleCorrelatedTrajectoryPoint(trajectory, moveProgress);
          activePoint = movePoint;
          const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, movePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        }
        await waitForGestureProgress(win, startedAt, holdDuration, 1, signal);
        activePoint = endPoint;
        const endTouch = createSyntheticTouch(win, dispatchTarget, identifier, endPoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false);
        touchActive = false;
        await sleepMicrotask();
      } catch (error) {
        if (touchActive && dispatchTarget && activePoint && identifier != null) {
          try {
            const cancelTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
            dispatchSyntheticTouch(win, dispatchTarget, 'touchcancel', cancelTouch, false);
          } catch {}
        }
        throw error;
      } finally {
        activeTapTargets.delete(target);
      }
    });
  }

  function randomUniform(min, max, random = Math.random) {
    const a = finite(min, 0);
    const b = finite(max, 0);
    if (b < a) throw new FlowError('ランダム待機の最大値が最小値未満です', 'INVALID_RANGE');
    return a + random() * (b - a);
  }

  function gbfStateObservationRoots(doc = frameDocument()) {
    return [
      doc.querySelector('#pop'),
      doc.querySelector('#prt-assist-search'),
      doc.querySelector(SELECTORS.assistList),
      doc.querySelector(SELECTORS.supporterScreen),
      doc.querySelector(SELECTORS.unclaimedList),
      doc.querySelector(SELECTORS.battleScreen),
      doc.querySelector('#loading'),
      doc.querySelector('#ready')
    ].filter(Boolean);
  }

  function waitForGbfState(accepted, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, stableMs = 0, description = '画面状態待ち' } = {}) {
    const acceptedSet = new Set(accepted);
    return monitorFrame(() => {
      const stateInfo = detectScreenState();
      if (stateInfo.type === 'UNKNOWN_ERROR') return stateInfo;
      return acceptedSet.has(stateInfo.type) ? stateInfo : false;
    }, { signal, timeoutMs, stableMs, description, observeRoots: gbfStateObservationRoots });
  }

  function assertNoUnknownPopup(doc = frameDocument()) {
    const popup = popupInfo(doc);
    if (popup?.type === 'UNKNOWN_ERROR') {
      throw new FlowError(`未知のエラー本文を検出しました: ${popup.rawText || '(空)'}`, 'UNKNOWN_POPUP', popup);
    }
    return popup;
  }

  async function tapPopupOk(popup, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, expected = null } = {}) {
    if (!popup?.ok) throw new FlowError('表示中エラーポップアップのOKが見つかりません', 'POPUP_OK_MISSING');
    if (expected) {
      return runObservedAction(
        waitSignal => waitForGbfState(expected, {
          signal: waitSignal,
          timeoutMs,
          description: 'エラー後画面待ち'
        }),
        () => jqTapStrict(popup.ok, { signal, label: 'エラーポップアップOK' }),
        { signal, cancelMessage: 'エラー後画面監視を解除しました' }
      );
    }
    const before = captureFrameState();
    await jqTapStrict(popup.ok, { signal, label: 'エラーポップアップOK' });
    return monitorFrame(() => {
      const current = popupInfo();
      if (!current) return { closed: true };
      if (current.popup !== popup.popup) return { changed: true };
      const changed = frameDocument() !== before.doc || currentFrameUrl() !== before.href;
      return changed ? { changed: true } : false;
    }, { signal, timeoutMs, stableMs: 80, description: 'ポップアップ終了待ち' });
  }

  function parseAssistRow(row, index = 0) {
    const hp = parseFloat(row.querySelector('.prt-raid-gauge-inner')?.style.width ?? 'NaN');
    const peopleText = row.querySelector('.prt-flees-in')?.textContent?.trim() ?? '';
    const currentPeople = Number.parseInt(peopleText.split('/')[0], 10);
    return {
      row,
      index,
      hp,
      peopleText,
      currentPeople,
      raidId: String(row.dataset.raidId || ''),
      score: Number.isFinite(hp) && Number.isInteger(currentPeople) && currentPeople > 0
        ? (hp ** 3) / currentPeople
        : Number.NEGATIVE_INFINITY
    };
  }

  function rankAssistRows(rows, minimumHp = 50) {
    return [...rows].map(parseAssistRow).filter(item =>
      Number.isFinite(item.hp)
      && item.hp >= minimumHp
      && Number.isInteger(item.currentPeople)
      && item.currentPeople > 0
    ).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
  }

  function findAssistRowByRaidId(raidId, doc = frameDocument()) {
    const normalizedRaidId = String(raidId || '');
    if (!normalizedRaidId) return null;
    return [...doc.querySelectorAll(SELECTORS.assistRows)].find(row =>
      String(row.dataset.raidId || '') === normalizedRaidId
    ) || null;
  }

  async function tapCurrentAssistRow(selected, context, { maxRebinds = 20 } = {}) {
    const { signal } = context;
    const raidId = String(selected?.raidId || '');
    const label = `救援 ${raidId || selected?.index + 1 || ''}`.trim();
    let target = selected?.row || null;

    for (let rebind = 0; rebind <= maxRebinds; rebind++) {
      throwIfAborted(signal);
      const latest = raidId ? findAssistRowByRaidId(raidId) : null;
      if (latest) target = latest;
      if (!target || !target.isConnected) return false;

      try {
        await jqTapStrict(target, { signal, label });
        return true;
      } catch (error) {
        if (error?.code !== 'STALE_TARGET') throw error;
        target = raidId ? findAssistRowByRaidId(raidId) : null;
        if (!target) return false;
      }
    }

    return false;
  }

  function assistListSignature(list) {
    if (!list) return '';
    let signature = '';
    for (const row of list.children) {
      if (!row.matches?.('.btn-multi-raid.lis-raid.search')) continue;
      const hp = row.querySelector('.prt-raid-gauge-inner')?.style.width || '';
      const people = normalizePopupText(row.querySelector('.prt-flees-in')?.textContent || '');
      signature += `${row.dataset.raidId || ''}:${hp}:${people}|`;
    }
    return signature;
  }

  async function waitRandomized(baseSec, jitterSec, signal) {
    const base = Math.max(0, finite(baseSec, 0));
    const jitter = Math.max(0, finite(jitterSec, 0));
    const actual = Math.max(0, base + randomUniform(-jitter, jitter));
    await abortableDelay(actual * 1000, signal);
  }

  async function runAssistListTransition(beforeList, config, signal, action, {
    expectedSlot = null,
    description = '救援一覧切替完了待ち',
    cancelMessage = '救援一覧切替監視を解除しました'
  } = {}) {
    const beforeSignature = assistListSignature(beforeList);
    const observationRoot = beforeList.parentElement || beforeList;
    let sawMutation = false;
    let sawLoading = false;
    let loadingEnded = false;
    const observer = new MutationObserver(() => { sawMutation = true; });
    if (!lightweightMode) {
      observer.observe(observationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
        characterData: true
      });
    }
    try {
      return await runObservedAction(
        waitSignal => monitorFrame(() => {
          const docNow = frameDocument();
          const listNow = docNow.querySelector(SELECTORS.assistList);
          const loadingVisible = !hiddenOrAbsent(docNow, '#loading') || !hiddenOrAbsent(docNow, '#ready');
          if (loadingVisible) sawLoading = true;
          if (sawLoading && !loadingVisible) loadingEnded = true;
          const reconstructed = Boolean(listNow && listNow !== beforeList);
          const changedSignature = Boolean(!sawMutation && listNow && assistListSignature(listNow) !== beforeSignature);
          const completed = reconstructed || changedSignature || loadingEnded || sawMutation;
          const slotReady = expectedSlot == null || activeAssistSlot(docNow) === expectedSlot;
          if (!slotReady || !completed || !listNow || loadingVisible) return false;
          return { list: listNow, reconstructed, changedSignature, loadingEnded, sawMutation };
        }, {
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          stableMs: 0,
          description,
          observeRoots: []
        }),
        action,
        { signal, cancelMessage }
      );
    } finally {
      observer.disconnect();
    }
  }

  async function refreshAssistList(config, context, { waitForCompletion = true } = {}) {
    const { signal } = context;
    await waitRandomized(config.baseDelaySec, config.jitterSec, signal);
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    if (detectScreenState(doc).type !== 'ASSIST_LIST') {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
    }
    const currentDoc = frameDocument();
    const refresh = currentDoc.querySelector(SELECTORS.assistRefresh);
    const beforeList = currentDoc.querySelector(SELECTORS.assistList);
    if (!refresh || !computedVisible(refresh)) throw new FlowError('救援一覧の更新ボタンが表示されていません', 'REFRESH_MISSING');
    if (!beforeList) throw new FlowError('救援一覧コンテナが見つかりません', 'ASSIST_LIST_MISSING');
    if (!waitForCompletion) {
      await jqTapStrict(refresh, { signal, label: '救援一覧更新' });
      return { tapped: true, waitedForCompletion: false };
    }
    const completion = await runAssistListTransition(
      beforeList,
      config,
      signal,
      () => jqTapStrict(refresh, { signal, label: '救援一覧更新' }),
      {
        description: '救援一覧更新完了待ち',
        cancelMessage: '救援一覧更新監視を解除しました'
      }
    );
    return { tapped: true, waitedForCompletion: true, completion };
  }

  async function switchAssistSlot(slot, config, context) {
    const { signal } = context;
    const normalized = int(slot, 0);
    if (normalized < 1 || normalized > 4) throw new FlowError(`救援番号が不正です: ${slot}`, 'INVALID_ASSIST_SLOT');
    await waitRandomized(config.baseDelaySec, config.jitterSec, signal);
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    if (detectScreenState(doc).type !== 'ASSIST_LIST') {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
    }
    const currentDoc = frameDocument();
    const button = currentDoc.querySelector(`${SELECTORS.assistSlot}[data-slot="${normalized}"]`);
    const beforeList = currentDoc.querySelector(SELECTORS.assistList);
    const beforeActive = activeAssistSlot(currentDoc);
    if (!button || !computedVisible(button)) throw new FlowError(`救援番号${normalized}が表示されていません`, 'ASSIST_SLOT_MISSING');
    if (!beforeList) throw new FlowError('救援一覧コンテナが見つかりません', 'ASSIST_LIST_MISSING');
    if (beforeActive === normalized) return { tapped: false, slot: normalized, alreadyActive: true };
    const completion = await runAssistListTransition(
      beforeList,
      config,
      signal,
      () => jqTapStrict(button, { signal, label: `救援番号${normalized}` }),
      {
        expectedSlot: normalized,
        description: `救援番号${normalized}切替完了待ち`,
        cancelMessage: `救援番号${normalized}切替監視を解除しました`
      }
    );
    return { tapped: true, slot: normalized, completion };
  }

  function activeAssistSlot(doc = frameDocument()) {
    const active = doc.querySelector(`${SELECTORS.assistSlot}.active[data-slot]`);
    const slot = Number.parseInt(active?.dataset.slot || '', 10);
    return Number.isInteger(slot) ? slot : null;
  }

  function visibleSupporterRows(doc = frameDocument()) {
    return [...doc.querySelectorAll(SELECTORS.supporterRows)].filter(computedVisible);
  }

  function parseSupporterRow(row, index = 0) {
    const name = String(row.querySelector('.js-summon-name')?.textContent || '').trim();
    const levelText = String(row.querySelector('.txt-summon-level')?.textContent || '').trim();
    const match = levelText.match(/Lv\s*(\d+)/i);
    const level = match ? Number.parseInt(match[1], 10) : Number.NaN;
    const friend = Boolean(row.querySelector('.prt-supporter-name.ico-friend'));
    return { row, index, name, level, friend, valid: Boolean(name) && Number.isInteger(level) };
  }

  function chooseSupporter(rows, candidates, random = Math.random) {
    const parsed = [...rows].map(parseSupporterRow).filter(item => item.valid && computedVisible(item.row));
    for (const candidate of normalizeCandidates(candidates)) {
      if (!candidate.name) continue;
      const matches = parsed.filter(item => item.name === candidate.name && item.level >= candidate.minimumLevel);
      const friends = matches.filter(item => item.friend);
      if (friends.length) return friends[0];
      if (matches.length) {
        const maxLevel = Math.max(...matches.map(item => item.level));
        return matches.find(item => item.level === maxLevel) || null;
      }
    }
    if (!parsed.length) return null;
    const maxLevel = Math.max(...parsed.map(item => item.level));
    const highest = parsed.filter(item => item.level === maxLevel);
    if (highest.length === 1) return highest[0];
    const index = Math.min(highest.length - 1, Math.floor(random() * highest.length));
    return highest[index];
  }

  async function waitForSupporterRows(config, context) {
    return monitorFrame(() => {
      const doc = frameDocument();
      const deckOk = doc.querySelector(SELECTORS.deckOk);
      if (deckOk && computedVisible(deckOk)) return { deckOk, rows: [] };
      const rows = visibleSupporterRows(doc).filter(row => parseSupporterRow(row).valid);
      return rows.length ? { rows } : false;
    }, {
      signal: context.signal,
      timeoutMs: config.timeoutSec * 1000,
      stableMs: 80,
      description: 'サポーター候補待ち'
    });
  }

  async function selectSupporterConditional(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { alreadySelected: true, deckOk };
    const result = await waitForSupporterRows(config, context);
    if (result.deckOk) return { alreadySelected: true, deckOk: result.deckOk };
    const selected = chooseSupporter(result.rows, config.supporterCandidates);
    if (!selected) throw new FlowError('有効なサポーター行または召喚石レベルを取得できません', 'SUPPORTER_NOT_FOUND');
    const next = await runObservedAction(
      waitSignal => waitForGbfState(['DECK_CONFIRM', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: 'サポーター選択後待ち'
      }),
      () => jqTapStrict(selected.row, { signal, label: `サポーター ${selected.name}` }),
      { signal, cancelMessage: 'サポーター選択監視を解除しました' }
    );
    if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
    return { selected, next };
  }

  async function selectSupporterAuto(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { alreadySelected: true, deckOk };
    const auto = doc.querySelector(SELECTORS.supporterAuto);
    if (!auto || !computedVisible(auto)) throw new FlowError('サポーター自動選択ボタンが表示されていません', 'SUPPORTER_AUTO_MISSING');
    return runObservedAction(
      waitSignal => waitForGbfState(['DECK_CONFIRM', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: 'サポーター自動選択後待ち'
      }),
      () => jqTapStrict(auto, { signal, label: 'サポーター自動選択' }),
      { signal, cancelMessage: 'サポーター自動選択監視を解除しました' }
    );
  }

  async function returnToAssistFromUnclaimed(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    const returnButton = doc.querySelector(SELECTORS.assistReturn);
    if (returnButton && computedVisible(returnButton)) {
      const before = captureFrameState();
      return runObservedAction(
        waitSignal => waitForFrameReady({
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          expectedScreen: 'assist',
          before,
          requireChange: true
        }),
        () => jqTapStrict(returnButton, { signal, label: '救援一覧へ戻る' }),
        { signal, cancelMessage: '救援一覧復帰監視を解除しました' }
      );
    }
    return performFrameOperation(() => {
      frameWindow().location.href = gameRouteUrl('#quest/assist/multi/0');
    }, { signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist', requireChange: true });
  }

  async function confirmAllUnclaimed(config, context) {
    const { signal } = context;
    await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'unclaimed' });
    let processed = 0;
    while (true) {
      throwIfAborted(signal);
      const doc = frameDocument();
      assertNoUnknownPopup(doc);
      const topRow = doc.querySelector(SELECTORS.unclaimedRows);
      if (!topRow) break;
      if (processed >= config.maxItems) throw new FlowError('未確認バトル処理が安全上限件数を超えました', 'UNCLAIMED_LIMIT');
      const href = String(topRow.dataset.href || '');
      const before = captureFrameState();
      await runObservedAction(
        waitSignal => monitorFrame(() => {
          const url = currentFrameUrl();
          const docNow = frameDocument();
          if (!pageBaseReady(docNow)) return false;
          const changed = docNow !== before.doc || url !== before.href || url.includes('result_multi/') || !docNow.querySelector(SELECTORS.unclaimedList);
          return changed ? { url } : false;
        }, {
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          stableMs: DEFAULT_STABLE_MS,
          description: '未確認結果画面待ち',
          observeRoots: gbfStateObservationRoots
        }),
        () => jqTapStrict(topRow, { signal, label: `未確認バトル ${href}` }),
        { signal, cancelMessage: '未確認結果画面監視を解除しました' }
      );
      processed += 1;
      await performFrameOperation(() => {
        frameWindow().location.href = gameRouteUrl('#quest/assist/unclaimed/0/0');
      }, { signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'unclaimed', requireChange: true });
    }
    await returnToAssistFromUnclaimed(config, context);
    return { processed };
  }

  function fullAutoState(doc = frameDocument()) {
    const button = doc.querySelector(SELECTORS.fullAuto);
    return {
      button,
      exists: Boolean(button),
      visible: computedVisible(button),
      on: Boolean(button?.classList.contains('on'))
    };
  }

  function battleObservationRoots(doc = frameDocument()) {
    return [
      doc.querySelector(SELECTORS.fullAuto),
      doc.querySelector('#cnt-raid-information'),
      doc.querySelector('.prt-command .prt-member'),
      doc.querySelector('.prt-gauge-area'),
      doc.querySelector(SELECTORS.turn),
      doc.querySelector('.prt-command-end'),
      doc.querySelector('#pop'),
      doc.querySelector('#pop-force')
    ].filter(Boolean);
  }

  function detectBattleEndState(doc = frameDocument()) {
    const url = currentFrameUrl();
    if (url.includes('result_multi/')) return { type: 'RESULT', reason: 'リザルト画面を検出', url };
    const notice = doc.querySelector(SELECTORS.battleEndNotice);
    if (notice && computedVisible(notice)) {
      const text = normalizePopupText(notice.textContent || '');
      if (!text || text.includes(BATTLE_END_MESSAGE)) {
        return { type: 'REMATCH_FAIL', reason: text || BATTLE_END_MESSAGE, element: notice };
      }
    }
    const resultButton = doc.querySelector(SELECTORS.battleResult);
    if (resultButton && computedVisible(resultButton)) {
      return { type: 'RESULT_BUTTON', reason: 'バトル終了ボタンを検出', element: resultButton };
    }
    return null;
  }

  function safeBattleEndState() {
    try { return detectBattleEndState(); } catch { return null; }
  }

  async function reloadForBattleEndProbe(config, context) {
    const timeoutMs = Math.max(1000, finite(config.timeoutSec, 15) * 1000);
    clearPendingAutoAttack('敵撃破判定のため再読み込みします');
    let reloadError = null;
    try {
      await performFrameOperation(() => frameWindow().location.reload(), {
        signal: context.signal,
        timeoutMs,
        expectedScreen: 'auto',
        requireChange: true
      });
    } catch (error) {
      reloadError = error;
    }
    return { endState: safeBattleEndState(), state: safeDetectScreenState(), reloadError };
  }

  async function restartWorkflowAfterBattleEnd(config, context, endState) {
    clearPendingAutoAttack('敵撃破を検出しました');
    const route = String(config.battleEndRoute || '#quest/assist/multi/0').trim() || '#quest/assist/multi/0';
    const expectedScreen = normalizeExpectedScreen(config.battleEndExpectedScreen || 'assist');
    const timeoutMs = Math.max(1000, finite(config.timeoutSec, 15) * 1000);
    const targetUrl = gameRouteUrl(route);
    context.setProgress?.('敵撃破を検出・復帰中');

    let alreadyReady = false;
    try {
      const doc = frameDocument();
      alreadyReady = currentFrameUrl() === targetUrl && pageBaseReady(doc) && expectedScreenMatches(expectedScreen, doc);
    } catch {}

    if (alreadyReady) {
      await waitForFrameReady({ signal: context.signal, timeoutMs, expectedScreen, requireChange: false });
    } else {
      const before = captureFrameState();
      await replaceFrame(targetUrl);
      await waitForFrameReady({
        signal: context.signal,
        timeoutMs,
        expectedScreen,
        before,
        requireChange: true
      });
    }

    throw new FlowRestart('敵撃破を検出したため指定ページから先頭ブロックへ戻ります', { route, expectedScreen, endState });
  }

  async function ensureFullAuto(config, context, { allowReloadProbe = true } = {}) {
    const { signal } = context;
    try {
      const initialEnd = safeBattleEndState();
      if (initialEnd) return restartWorkflowAfterBattleEnd(config, context, initialEnd);

      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'battle' });
      const found = await monitorFrame(() => {
        const doc = frameDocument();
        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };

        const observed = fullAutoState(doc);
        if (!observed.exists || !observed.visible) return false;
        if (observed.on) return observed;

        const attack = attackSnapshot(doc);
        const attackReady = Boolean(
          attack.start
          && attack.start.classList.contains('display-on')
          && !attack.start.classList.contains('display-off')
          && computedVisible(attack.start)
          && !attack.dummyVisible
          && !attack.cancelVisible
          && !attack.actorAttacking
        );
        return attackReady ? observed : false;
      }, {
        signal,
        timeoutMs: config.timeoutSec * 1000,
        stableMs: DEFAULT_STABLE_MS,
        description: 'フルオート操作可能状態待ち',
        observeRoots: battleObservationRoots
      });

      if (found.battleEnd) return restartWorkflowAfterBattleEnd(config, context, found.battleEnd);
      if (found.on) return { changed: false };
      const pending = armPendingAutoAttack(config.timeoutSec * 1000, signal);
      try {
        await jqTapStrict(found.button, { signal, label: 'フルオート' });
      } catch (error) {
        if (state.pendingAutoAttack === pending) clearPendingAutoAttack('フルオート押下に失敗しました');
        throw error;
      }
      return { changed: true };
    } catch (error) {
      if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
      if (error?.code === 'TIMEOUT' && allowReloadProbe) {
        const visibleEnd = safeBattleEndState();
        if (visibleEnd) return restartWorkflowAfterBattleEnd(config, context, visibleEnd);
        const probe = await reloadForBattleEndProbe(config, context);
        if (probe.endState) return restartWorkflowAfterBattleEnd(config, context, probe.endState);
        if (!probe.reloadError && probe.state?.type === 'BATTLE') {
          return ensureFullAuto(config, context, { allowReloadProbe: false });
        }
      }
      throw error;
    }
  }

  function elementDisplayOn(element) {
    return Boolean(
      element
      && !element.classList.contains('display-off')
      && (element.classList.contains('display-on') || computedVisible(element))
    );
  }

  function turnSignature(doc = frameDocument()) {
    const turn = doc.querySelector(SELECTORS.turn);
    if (!turn) return '';
    const structure = Array.from(turn.children, child =>
      `${child.tagName}:${String(child.className || '')}:${child.getAttribute('style') || ''}`
    ).join('|');
    return `${normalizePopupText(turn.textContent || '')}|${structure}`;
  }

  function battleProgressSignature(doc = frameDocument()) {
    const enemyHp = Array.from(doc.querySelectorAll('[id^="enemy-hp"]'), element =>
      normalizePopupText(element.textContent || '')
    ).join(',');
    const memberHp = Array.from(doc.querySelectorAll('.prt-command .prt-member .txt-hp-value'), element =>
      normalizePopupText(element.textContent || '')
    ).join(',');
    const memberGauge = Array.from(doc.querySelectorAll('.prt-command .prt-member .prt-gauge-special-inner'), element =>
      element.style.width || element.getAttribute('style') || ''
    ).join(',');
    return `${turnSignature(doc)}|${enemyHp}|${memberHp}|${memberGauge}`;
  }

  function attackSnapshot(doc = frameDocument()) {
    const start = doc.querySelector(SELECTORS.attackStart);
    const dummy = doc.querySelector(SELECTORS.attackDummy);
    const cancel = doc.querySelector(SELECTORS.attackCancel);
    return {
      start,
      dummy,
      cancel,
      startVisible: elementDisplayOn(start),
      dummyVisible: elementDisplayOn(dummy),
      cancelVisible: elementDisplayOn(cancel),
      actorAttacking: Boolean(doc.querySelector(SELECTORS.attackActor)),
      turn: turnSignature(doc),
      progress: battleProgressSignature(doc)
    };
  }

  function isAttackInProgress(snapshot) {
    return Boolean(snapshot.cancelVisible || snapshot.dummyVisible || snapshot.actorAttacking);
  }

  function attackTransitionFromBaseline(baseline, current) {
    const startReplaced = Boolean(baseline.start && current.start && baseline.start !== current.start);
    const startBecameHidden = Boolean(baseline.startVisible && !current.startVisible);
    const turnChanged = Boolean(baseline.turn && current.turn && baseline.turn !== current.turn);
    const progressChanged = Boolean(baseline.progress && current.progress && baseline.progress !== current.progress);
    const started = isAttackInProgress(current) || startReplaced || startBecameHidden || turnChanged || progressChanged;
    return started ? { current, startReplaced, startBecameHidden, turnChanged, progressChanged } : false;
  }

  function clearPendingAutoAttack(reason = 'フルオート攻撃監視を解除しました') {
    const pending = state.pendingAutoAttack;
    state.pendingAutoAttack = null;
    if (!pending || pending.controller.signal.aborted) return;
    pending.controller.abort(new DOMException(reason, 'AbortError'));
  }

  function armPendingAutoAttack(timeoutMs, parentSignal) {
    clearPendingAutoAttack();
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(abortException(parentSignal));
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const baseline = attackSnapshot();
    const promise = monitorFrame(() => {
      const doc = frameDocument();
      const battleEnd = detectBattleEndState(doc);
      if (battleEnd) return { battleEnd };
      const current = attackSnapshot(doc);
      const transition = attackTransitionFromBaseline(baseline, current);
      if (!transition) return false;
      const auto = fullAutoState(doc);
      return auto.on || isAttackInProgress(current) ? transition : false;
    }, {
      signal: controller.signal,
      timeoutMs,
      stableMs: 0,
      description: 'フルオート押下後の攻撃開始待ち',
      observeRoots: battleObservationRoots,
      observeOnLightweight: true,
      observeCharacterData: true,
      intervalMs: 120
    }).then(
      result => ({ ok: true, result }),
      error => ({ ok: false, error })
    ).finally(() => parentSignal?.removeEventListener('abort', onParentAbort));
    const pending = { controller, promise, baseline, createdAt: performance.now(), timeoutMs };
    state.pendingAutoAttack = pending;
    return pending;
  }

  async function consumePendingAutoAttack(timeoutMs) {
    const pending = state.pendingAutoAttack;
    if (!pending) return null;
    state.pendingAutoAttack = null;
    if (performance.now() - pending.createdAt > Math.max(timeoutMs, pending.timeoutMs)) {
      if (!pending.controller.signal.aborted) pending.controller.abort(new DOMException('フルオート攻撃監視が期限切れです', 'AbortError'));
      return null;
    }
    const outcome = await pending.promise;
    if (!outcome.ok) throw outcome.error;
    return { ...outcome.result, triggeredByFullAutoToggle: true };
  }

  async function waitForAutoAttack(config, context) {
    const { signal } = context;
    const timeoutMs = config.timeoutSec * 1000;
    try {
      const initialEnd = safeBattleEndState();
      if (initialEnd) return restartWorkflowAfterBattleEnd(config, context, initialEnd);

      await waitForFrameReady({ signal, timeoutMs, expectedScreen: 'battle' });

      const pendingAttack = await consumePendingAutoAttack(timeoutMs);
      if (pendingAttack?.battleEnd) return restartWorkflowAfterBattleEnd(config, context, pendingAttack.battleEnd);
      if (pendingAttack) return pendingAttack;

      const initial = attackSnapshot();
      if (isAttackInProgress(initial)) return { alreadyAttacking: true, snapshot: initial };

      const auto = fullAutoState();
      if (!auto.on) {
        await ensureFullAuto(config, context);
        const enabledByThisBlock = await consumePendingAutoAttack(timeoutMs);
        if (enabledByThisBlock?.battleEnd) return restartWorkflowAfterBattleEnd(config, context, enabledByThisBlock.battleEnd);
        if (enabledByThisBlock) return enabledByThisBlock;
      }

      const armed = await monitorFrame(() => {
        const doc = frameDocument();
        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };
        const snapshot = attackSnapshot(doc);
        const transition = attackTransitionFromBaseline(initial, snapshot);
        if (transition) return { snapshot, alreadyAttacking: true, transition };
        if (isAttackInProgress(snapshot)) return { snapshot, alreadyAttacking: true };
        const attackReady = snapshot.startVisible && !snapshot.cancelVisible && !snapshot.dummyVisible;
        return attackReady ? { snapshot, alreadyAttacking: false } : false;
      }, {
        signal,
        timeoutMs,
        stableMs: 0,
        description: 'フルオート攻撃受付待ち',
        observeRoots: battleObservationRoots,
        observeOnLightweight: true,
        observeCharacterData: true,
        intervalMs: 120
      });
      if (armed.battleEnd) return restartWorkflowAfterBattleEnd(config, context, armed.battleEnd);
      if (armed.alreadyAttacking) return armed;

      const baseline = armed.snapshot;
      const transition = await monitorFrame(() => {
        const doc = frameDocument();
        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };
        return attackTransitionFromBaseline(baseline, attackSnapshot(doc));
      }, {
        signal,
        timeoutMs,
        stableMs: 0,
        description: 'フルオート攻撃開始待ち',
        observeRoots: battleObservationRoots,
        observeOnLightweight: true,
        observeCharacterData: true,
        intervalMs: 120
      });
      if (transition.battleEnd) return restartWorkflowAfterBattleEnd(config, context, transition.battleEnd);
      return transition;
    } catch (error) {
      if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
      if (error?.code === 'TIMEOUT') {
        const visibleEnd = safeBattleEndState();
        if (visibleEnd) return restartWorkflowAfterBattleEnd(config, context, visibleEnd);
        const probe = await reloadForBattleEndProbe(config, context);
        if (probe.endState) return restartWorkflowAfterBattleEnd(config, context, probe.endState);
      }
      throw error;
    }
  }

  async function recoverKnownPopup(stateInfo, refreshConfig, context) {
    if (stateInfo.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
    if (!['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(stateInfo.type)) {
      throw new FlowError(`処理できない画面状態です: ${stateInfo.type}`, 'UNEXPECTED_STATE');
    }
    if (stateInfo.type === 'UNCLAIMED_ERROR') {
      await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['UNCLAIMED_LIST'] });
      await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);
      return { retry: true, reason: '未確認バトルを処理しました' };
    }
    await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['ASSIST_LIST'] });
    if (stateInfo.type === 'MAX_ASSIST_ERROR') {
      const doc = frameDocument();
      const attention = doc.querySelector(SELECTORS.unclaimedAttention);
      if (attention && computedVisible(attention)) {
        await performFrameOperation(() => {
          frameWindow().location.href = gameRouteUrl('#quest/assist/unclaimed/0/0');
        }, {
          signal: context.signal,
          timeoutMs: refreshConfig.timeoutSec * 1000,
          expectedScreen: 'unclaimed',
          requireChange: true
        });
        const result = await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);
        return { retry: true, reason: `最大3件エラー後に未確認バトルを${result.processed}件処理しました` };
      }
    }
    await refreshAssistList(refreshConfig, context);
    return { retry: true, reason: stateInfo.type === 'MAX_ASSIST_ERROR' ? '最大3件エラーから再試行' : '参戦人数上限から再試行' };
  }

  async function pressDeckConfirm(config, context) {
    const { signal } = context;
    const current = detectScreenState();
    if (current.type.endsWith('_ERROR')) return recoverKnownPopup(current, {
      baseDelaySec: config.refreshBaseDelaySec ?? 0.6,
      jitterSec: config.refreshJitterSec ?? 0,
      timeoutSec: config.timeoutSec
    }, context);
    if (current.type === 'BATTLE') return { battle: true };
    const doc = frameDocument();
    const button = doc.querySelector(SELECTORS.deckOk);
    if (!button || !computedVisible(button)) throw new FlowError('編成確認OKが表示されていません', 'DECK_OK_MISSING');
    const next = await runObservedAction(
      waitSignal => waitForGbfState(['BATTLE', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: '編成確認後待ち'
      }),
      () => jqTapStrict(button, { signal, label: '編成確認OK' }),
      { signal, cancelMessage: '編成確認後監視を解除しました' }
    );
    if (next.type === 'BATTLE') {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'battle' });
      return { battle: true };
    }
    return recoverKnownPopup(next, {
      baseDelaySec: config.refreshBaseDelaySec ?? 0.6,
      jitterSec: config.refreshJitterSec ?? 0,
      timeoutSec: config.timeoutSec
    }, context);
  }

  async function assistSelectFullFlow(config, context) {
    const { signal } = context;
    const refreshConfig = { baseDelaySec: config.baseDelaySec, jitterSec: config.jitterSec, timeoutSec: config.timeoutSec };
    const selectedSlots = normalizeAssistSlots(config.assistSlots);
    const cyclesAssistSlots = selectedSlots.length > 1;
    let slotCursor = 0;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      throwIfAborted(signal);
      context.setProgress(`${attempt}回目`);
      const current = detectScreenState();
      if (current.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(current.type)) {
        await recoverKnownPopup(current, refreshConfig, context);
        continue;
      }
      if (current.type === 'UNCLAIMED_LIST') {
        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);
        continue;
      }
      if (current.type === 'BATTLE') return { attempts: attempt, alreadyInBattle: true };
      if (current.type !== 'ASSIST_LIST') {
        await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
      }

      const doc = frameDocument();
      assertNoUnknownPopup(doc);
      const rows = [...doc.querySelectorAll(SELECTORS.assistRows)];
      const ranked = rankAssistRows(rows, config.minimumHp);
      if (cyclesAssistSlots && !selectedSlots.includes(activeAssistSlot(doc))) {
        const slot = selectedSlots[slotCursor % selectedSlots.length];
        slotCursor = (slotCursor + 1) % selectedSlots.length;
        context.setProgress(`${attempt}回目・救援${slot}へ切替`);
        await switchAssistSlot(slot, refreshConfig, context);
        continue;
      }
      if (!ranked.length) {
        if (cyclesAssistSlots) {
          const currentSlot = activeAssistSlot(doc);
          let slot = selectedSlots[slotCursor % selectedSlots.length];
          if (slot === currentSlot) {
            slotCursor = (slotCursor + 1) % selectedSlots.length;
            slot = selectedSlots[slotCursor % selectedSlots.length];
          }
          slotCursor = (slotCursor + 1) % selectedSlots.length;
          context.setProgress(`${attempt}回目・救援${slot}へ切替`);
          await switchAssistSlot(slot, refreshConfig, context);
        } else {
          await refreshAssistList(refreshConfig, context, { waitForCompletion: false });
        }
        continue;
      }

      const selected = cyclesAssistSlots
        ? [...ranked].sort((a, b) => a.index - b.index)[0]
        : ranked[0];
      const tapped = await tapCurrentAssistRow(selected, context);
      if (!tapped) continue;

      let next = await waitForGbfState([
        'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR',
        'DECK_CONFIRM', 'SUPPORTER', 'UNCLAIMED_LIST', 'BATTLE'
      ], { signal, timeoutMs: config.timeoutSec * 1000, description: '救援選択後待ち' });
      if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {
        await recoverKnownPopup(next, refreshConfig, context);
        continue;
      }
      if (next.type === 'UNCLAIMED_LIST') {
        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);
        continue;
      }
      if (next.type === 'BATTLE') return { attempts: attempt };

      if (next.type === 'SUPPORTER') {
        const supporterResult = await selectSupporterConditional({
          timeoutSec: config.timeoutSec,
          supporterCandidates: config.supporterCandidates
        }, context);
        next = supporterResult.next || { type: 'DECK_CONFIRM' };
        if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
        if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {
          await recoverKnownPopup(next, refreshConfig, context);
          continue;
        }
      }

      if (next.type === 'DECK_CONFIRM' || detectScreenState().type === 'DECK_CONFIRM') {
        const deckResult = await pressDeckConfirm({
          timeoutSec: config.timeoutSec,
          refreshBaseDelaySec: config.baseDelaySec,
          refreshJitterSec: config.jitterSec
        }, context);
        if (deckResult.retry) continue;
        if (deckResult.battle) return { attempts: attempt };
      }
    }
    throw new FlowError('救援参加の最大再試行回数に達しました', 'ASSIST_MAX_ATTEMPTS');
  }

  function evaluateWorkflowCondition(condition) {
    const config = normalizeConditionConfig(condition);
    const doc = frameDocument();
    const popup = popupInfo(doc);
    if (popup?.type === 'UNKNOWN_ERROR') assertNoUnknownPopup(doc);
    const screen = detectScreenState(doc).type;
    switch (config.type) {
      case 'gbfFullAutoOn':
        return fullAutoState(doc).on;
      case 'gbfFullAutoOff': {
        const auto = fullAutoState(doc);
        return auto.exists && !auto.on;
      }
      case 'gbfAttacking':
        return screen === 'BATTLE' && isAttackInProgress(attackSnapshot(doc));
      case 'gbfAttackWaiting': {
        if (screen !== 'BATTLE') return false;
        const attack = attackSnapshot(doc);
        return attack.startVisible && !isAttackInProgress(attack);
      }
      case 'gbfBattle':
        return screen === 'BATTLE';
      case 'gbfAssist':
        return screen === 'ASSIST_LIST';
      case 'gbfUnclaimedEmpty':
        return Boolean(doc.querySelector(SELECTORS.unclaimedList)) && !doc.querySelector(SELECTORS.unclaimedRows);
      case 'selectorVisible': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        let element;
        try { element = doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
        return computedVisible(element);
      }
      case 'selectorHidden': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        let element;
        try { element = doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
        return !element || !computedVisible(element);
      }
      case 'selectorExists': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        try { return Boolean(doc.querySelector(config.selector)); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
      }
      case 'selectorMissing': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        try { return !doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
      }
      case 'pageReady':
        return pageBaseReady(doc);
      case 'urlContains':
        return currentFrameUrl().includes(config.value);
      default:
        return false;
    }
  }

  async function waitForWorkflowCondition(config, context, { timeoutSec = 30, stableMs = 0 } = {}) {
    return monitorFrame(() => evaluateWorkflowCondition(config) ? { matched: true } : false, {
      signal: context.signal,
      timeoutMs: Math.max(0, finite(timeoutSec, 30)) * 1000,
      stableMs: Math.max(0, int(stableMs, 0)),
      description: '条件成立待ち'
    });
  }

  function blockCardById(blockId) {
    const escapedId = window.CSS?.escape ? window.CSS.escape(blockId) : String(blockId).replace(/["\\]/g, '\\$&');
    return shadow.querySelector(`.blockCard[data-block-id="${escapedId}"]`);
  }

  function clearRunningBlockUi() {
    state.runningCard?.classList.remove('running');
    state.runningBadge?.remove();
    state.runningCard = null;
    state.runningBadge = null;
  }

  function setRunningBlock(context, block, progress = '') {
    context.currentBlockId = block?.id || null;
    if (lightweightMode) return;
    state.blockProgress.clear();
    clearRunningBlockUi();
    if (!block) return;
    if (progress) state.blockProgress.set(block.id, progress);
    const card = blockCardById(block.id);
    state.runningCard = card;
    card?.classList.add('running');
    if (card && progress) {
      const badge = element('span', { className: 'progressBadge', text: progress });
      card.querySelector('.blockName')?.append(badge);
      state.runningBadge = badge;
    }
  }

  function updateBlockProgress(context, block, progress) {
    context.currentBlockId = block.id;
    if (lightweightMode) return;
    const text = String(progress ?? '');
    state.blockProgress.set(block.id, text);
    let card = state.runningCard;
    if (!card || !card.isConnected || card.dataset.blockId !== block.id) {
      clearRunningBlockUi();
      card = blockCardById(block.id);
      state.runningCard = card;
      card?.classList.add('running');
    }
    if (!card) return;
    let badge = state.runningBadge;
    if (!badge || !badge.isConnected) {
      badge = card.querySelector('.progressBadge') || element('span', { className: 'progressBadge' });
      if (!badge.isConnected) card.querySelector('.blockName')?.append(badge);
      state.runningBadge = badge;
    }
    if (badge.textContent !== text) badge.textContent = text;
  }

  async function runBlockList(blocks, context) {
    for (const block of blocks) {
      throwIfAborted(context.signal);
      await executeWorkflowBlock(block, context);
    }
  }

  async function executeWorkflowBlock(block, context) {
    const definition = BLOCK_DEFINITIONS[block.type];
    if (!definition) throw new FlowError(`未対応ブロックです: ${block.type}`, 'UNKNOWN_BLOCK');
    setRunningBlock(context, block);
    setStatus(definition.label);
    appendLog('開始', '', definition.label);
    const blockContext = {
      ...context,
      setProgress: progress => updateBlockProgress(context, block, progress)
    };
    try {
      switch (block.type) {
        case 'gbfAssistSelect':
          await assistSelectFullFlow(block.config, blockContext);
          break;
        case 'gbfSupporterAuto': {
          const result = await selectSupporterAuto(block.config, blockContext);
          if (result.type && result.type !== 'DECK_CONFIRM') {
            if (result.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
            throw new FlowError(`サポーター自動選択後に${result.type}を検出しました`, 'SUPPORTER_AUTO_ERROR');
          }
          break;
        }
        case 'gbfSupporterConditional': {
          const result = await selectSupporterConditional(block.config, blockContext);
          if (result.next && result.next.type !== 'DECK_CONFIRM') {
            if (result.next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
            throw new FlowError(`サポーター選択後に${result.next.type}を検出しました`, 'SUPPORTER_SELECT_ERROR');
          }
          break;
        }
        case 'gbfDeckConfirm':
          await pressDeckConfirm(block.config, blockContext);
          break;
        case 'gbfUnclaimedAll':
          await confirmAllUnclaimed(block.config, blockContext);
          break;
        case 'gbfEnsureFullAuto':
          await ensureFullAuto(block.config, blockContext);
          break;
        case 'gbfWaitAutoAttack':
          await waitForAutoAttack(block.config, blockContext);
          break;
        case 'gbfRefreshAssist':
          await refreshAssistList(block.config, blockContext);
          break;
        case 'repeat': {
          const count = clamp(int(block.config.count, 0), 0, MAX_REPEAT_COUNT);
          for (let index = 0; index < count; index++) {
            throwIfAborted(context.signal);
            updateBlockProgress(context, block, `${index + 1} / ${count}回目`);
            await runBlockList(block.children, context);
          }
          break;
        }
        case 'repeatUntil': {
          const startedAt = performance.now();
          const maxIterations = clamp(int(block.config.maxIterations, MAX_CONDITION_ITERATIONS), 1, 100000);
          const maxDurationMs = clamp(finite(block.config.maxDurationSec, 600), 1, 86400) * 1000;
          let iteration = 0;
          while (!evaluateWorkflowCondition(block.config.condition)) {
            throwIfAborted(context.signal);
            if (iteration >= maxIterations) throw new FlowError('条件ループの最大反復回数に達しました', 'LOOP_ITERATION_LIMIT');
            if (performance.now() - startedAt >= maxDurationMs) throw new FlowError('条件ループの最大実行時間に達しました', 'LOOP_DURATION_LIMIT');
            iteration += 1;
            updateBlockProgress(context, block, `${iteration}回目`);
            await runBlockList(block.children, context);
            if (evaluateWorkflowCondition(block.config.condition)) break;
          }
          break;
        }
        case 'if':
          if (evaluateWorkflowCondition(block.config.condition)) await runBlockList(block.children, context);
          else await runBlockList(block.elseChildren, context);
          break;
        case 'stop':
          throw new FlowStop(block.config.reason);
        case 'fixedWait':
          await abortableDelay(block.config.seconds * 1000, context.signal);
          break;
        case 'randomWait':
          await abortableDelay(randomUniform(block.config.minSeconds, block.config.maxSeconds) * 1000, context.signal);
          break;
        case 'watch':
          await waitForWorkflowCondition(block.config.condition, blockContext, { timeoutSec: block.config.timeoutSec, stableMs: block.config.stableMs });
          break;
        case 'iframeReload':
          await performFrameOperation(() => frameWindow().location.reload(), {
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: block.config.expectedScreen,
            requireChange: true
          });
          break;
        case 'iframeBack':
          if (frameWindow().history.length <= 1) throw new FlowError('iframeに戻れる履歴がありません', 'NO_HISTORY');
          await performFrameOperation(() => frameWindow().history.back(), {
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: block.config.expectedScreen,
            requireChange: true
          });
          break;
        case 'iframeRoute': {
          const before = captureFrameState();
          await replaceFrame(gameRouteUrl(block.config.route));
          await waitForFrameReady({
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: block.config.expectedScreen,
            before,
            requireChange: true
          });
          break;
        }
        case 'iframeReady':
          await waitForFrameReady({
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: block.config.expectedScreen,
            requireChange: false
          });
          break;
      }
      appendLog('完了', 'success', definition.label);
    } catch (error) {
      error.block = error.block || block;
      throw error;
    }
  }

  async function startWorkflow() {
    if (state.running || state.legacyRunning) return;
    const workflow = currentWorkflow();
    if (!workflow?.blocks.length) return toast('実行するブロックがありません');
    clearWorkflowError();
    const controller = new AbortController();
    const context = {
      controller,
      signal: controller.signal,
      workflow,
      currentBlockId: null,
      startedAt: performance.now(),
      cycle: 0,
      totalCycles: null,
      restartCount: 0
    };
    state.running = context;
    const restoreExpandedDock = enterRuntimeCompactMode();
    ui.runWorkflow.disabled = true;
    ui.stopWorkflow.disabled = false;
    if (!lightweightMode) {
      renderPalette();
      renderWorkflowEditor();
    }
    appendLog(`ワークフロー「${workflow.name}」を開始`);
    try {
      const loopCount = clamp(int(workflow.loopCount, 1), 1, MAX_WORKFLOW_LOOP_COUNT);
      const loopInfinite = Boolean(workflow.loopInfinite);
      let cycle = 0;
      while (!controller.signal.aborted && (loopInfinite || cycle < loopCount)) {
        clearPendingAutoAttack('次のワークフロー周回を開始します');
        cycle += 1;
        context.cycle = cycle;
        context.totalCycles = loopInfinite ? null : loopCount;
        const cycleLabel = loopInfinite ? `${cycle}周目` : `${cycle} / ${loopCount}周目`;
        appendLog(`${cycleLabel}を開始`, '', workflow.name);
        setStatus(`${workflow.name} · ${cycleLabel}`);

        while (!controller.signal.aborted) {
          try {
            await runBlockList(workflow.blocks, context);
            break;
          } catch (error) {
            if (!(error instanceof FlowRestart)) throw error;
            context.restartCount += 1;
            if (context.restartCount > MAX_WORKFLOW_RESTARTS) {
              throw new FlowError('敵撃破後の自動再開回数が安全上限に達しました', 'WORKFLOW_RESTART_LIMIT');
            }
            clearPendingAutoAttack('ワークフロー先頭から再開します');
            setRunningBlock(context, null);
            appendLog(error.message, 'warn', '自動復帰');
            setStatus(`${workflow.name} · 先頭から再開`);
          }
        }
      }
      appendLog(`ワークフロー「${workflow.name}」が${cycle}周完了`, 'success');
      setStatus('ワークフロー完了');
    } catch (error) {
      if (error?.name === 'AbortError') {
        appendLog('ユーザー操作で停止', 'warn');
        setStatus('停止しました');
      } else if (error instanceof FlowStop) {
        appendLog(error.message, 'warn', '停止');
        setStatus(error.message);
      } else {
        showWorkflowError(error, error.block || null);
        setStatus('エラーで停止');
      }
    } finally {
      clearPendingAutoAttack('ワークフローを終了しました');
      if (state.running === context) state.running = null;
      leaveRuntimeCompactMode(restoreExpandedDock);
      state.blockProgress.clear();
      ui.runWorkflow.disabled = false;
      ui.stopWorkflow.disabled = true;
      renderPalette();
      renderWorkflowEditor();
    }
  }

  function stopWorkflow(reason = '停止ボタン') {
    if (!state.running) return;
    state.running.controller.abort(new DOMException(reason, 'AbortError'));
  }

  const LEGACY_CONDITION_TYPES = new Set([
    'exists', 'missing', 'visible', 'hidden', 'state_on', 'state_off', 'enabled', 'disabled',
    'gbf_full_auto_on', 'gbf_full_auto_off', 'gbf_attack_ready', 'gbf_attack_not_ready',
    'class_has', 'class_missing', 'value_true', 'value_false', 'value_equals', 'value_not_equals',
    'text_contains', 'text_not_contains', 'page_ready', 'url_contains', 'url_not_contains'
  ]);

  function normalizeLegacyCondition(raw, actionType = 'click') {
    const value = raw && typeof raw === 'object' ? raw : {};
    let target = value.target === 'point' ? 'action' : value.target;
    if (!['action', 'selector', 'page'].includes(target)) target = actionType === 'click' ? 'action' : 'selector';
    let type = value.type === 'gbf_attack_on' ? 'gbf_attack_ready' : value.type === 'gbf_attack_off' ? 'gbf_attack_not_ready' : value.type;
    if (!LEGACY_CONDITION_TYPES.has(type)) type = 'exists';
    return {
      enabled: actionType === 'wait' ? value.enabled !== false : Boolean(value.enabled),
      mode: value.mode === 'check' ? 'check' : 'wait',
      target,
      selector: String(value.selector || '').trim(),
      type,
      className: String(value.className || ''),
      valueName: String(value.valueName || 'aria-pressed'),
      expected: String(value.expected ?? 'false'),
      text: String(value.text || ''),
      timeoutMs: clamp(int(value.timeoutMs, 30_000), 0, 600_000),
      timeoutAction: ['skip', 'execute'].includes(value.timeoutAction) ? value.timeoutAction : 'stop',
      stableMs: clamp(int(value.stableMs, 80), 0, 5000)
    };
  }

  function defaultLegacyState() {
    return {
      version: 12,
      markerHitSize: 48,
      url: '',
      actions: [],
      selectedId: null,
      nextId: 1,
      method: 'tap',
      count: 1,
      loop: false,
      timeRandomEnabled: true,
      timeJitterMs: 100,
      positionRandomEnabled: true,
      positionJitterPx: 2,
      recordMode: 'replace',
      settingsOpen: true,
      browserHidden: false,
      compact: false,
      dockX: null,
      dockY: null
    };
  }

  function normalizeLegacyState(raw, legacyKey = '') {
    const source = raw && typeof raw === 'object' ? raw : defaultLegacyState();
    const version = clamp(int(source.version, legacyKey.includes('v11') ? 11 : legacyKey.includes('v10') ? 10 : 1), 1, 12);
    const sourceSize = finite(source.markerHitSize, version <= 1 ? 64 : version <= 3 ? 46 : 44);
    const sourceActions = Array.isArray(source.actions) ? source.actions : Array.isArray(source.points) ? source.points : [];
    const actions = sourceActions.map((item, index) => {
      const id = int(item.id, index + 1);
      const type = item.type === 'navigate' ? 'navigate' : item.type === 'wait' ? 'wait' : 'click';
      const common = {
        id,
        type,
        enabled: item.enabled !== false,
        delayMs: clamp(int(item.delayMs, index === 0 ? 0 : int(source.interval, 1000)), 0, 600_000),
        condition: normalizeLegacyCondition(item.condition, type)
      };
      if (type === 'navigate') {
        return {
          ...common,
          url: String(item.url || ''),
          waitForLoad: item.waitForLoad !== false,
          loadTimeoutMs: clamp(int(item.loadTimeoutMs, 15_000), 1000, 120_000),
          failureMode: item.failureMode === 'continue' ? 'continue' : 'stop'
        };
      }
      if (type === 'wait') return common;
      let cx;
      let cy;
      if (item.cx != null || item.cy != null) {
        cx = finite(item.cx, window.innerWidth / 2);
        cy = finite(item.cy, window.innerHeight / 2);
      } else if (version >= 4) {
        cx = finite(item.x, window.innerWidth / 2);
        cy = finite(item.y, window.innerHeight / 2);
      } else {
        cx = finite(item.x, window.innerWidth / 2) + sourceSize / 2;
        cy = finite(item.y, window.innerHeight / 2) + sourceSize / 2;
      }
      return {
        ...common,
        cx: clamp(cx, 0, window.innerWidth),
        cy: clamp(cy, 0, window.innerHeight),
        holdMs: clamp(int(item.holdMs, 55), 0, 5000),
        targetMode: item.targetMode === 'selector' ? 'selector' : 'point',
        selector: String(item.selector || '').trim(),
        waitForTarget: item.waitForTarget !== false,
        targetTimeoutMs: clamp(int(item.targetTimeoutMs, 15_000), 0, 120_000),
        targetFailureMode: ['skip', 'point'].includes(item.targetFailureMode) ? item.targetFailureMode : 'stop',
        scrollTarget: item.scrollTarget !== false,
        targetLabel: String(item.targetLabel || '')
      };
    });
    const nextId = Math.max(int(source.nextId, 1), ...actions.map(action => action.id + 1), 1);
    return {
      ...defaultLegacyState(),
      version: 12,
      url: String(source.url || ''),
      actions,
      selectedId: actions.some(action => action.id === int(source.selectedId)) ? int(source.selectedId) : actions[0]?.id ?? null,
      nextId,
      method: 'tap',
      count: clamp(int(source.count, 1), 1, 999_999),
      loop: Boolean(source.loop),
      timeRandomEnabled: source.timeRandomEnabled ?? source.randomEnabled ?? true,
      timeJitterMs: clamp(int(source.timeJitterMs ?? source.jitterMs, 100), 0, 5000),
      positionRandomEnabled: source.positionRandomEnabled !== false,
      positionJitterPx: clamp(finite(source.positionJitterPx, 2), 0, 30),
      recordMode: ['replace', 'append'].includes(source.recordMode) ? source.recordMode : 'replace',
      settingsOpen: source.settingsOpen !== false,
      browserHidden: Boolean(source.browserHidden),
      compact: Boolean(source.compact),
      dockX: Number.isFinite(Number(source.dockX)) ? Number(source.dockX) : null,
      dockY: Number.isFinite(Number(source.dockY)) ? Number(source.dockY) : null
    };
  }

  function findLegacySaved() {
    const current = readJson(LEGACY_STORAGE_KEY);
    if (current) return { data: current, key: LEGACY_STORAGE_KEY };
    for (const key of LEGACY_STORAGE_KEYS) {
      const data = readJson(key);
      if (data) return { data, key };
    }
    return null;
  }

  function loadLegacyState() {
    const saved = findLegacySaved();
    state.legacy = normalizeLegacyState(saved?.data, saved?.key || '');
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    ui.legacyCount.value = state.legacy.count;
    ui.legacyJitter.value = state.legacy.timeJitterMs;
    ui.legacyPositionJitter.value = state.legacy.positionJitterPx;
    if (Number.isFinite(state.legacy.dockX)) state.dockX = state.legacy.dockX;
    if (Number.isFinite(state.legacy.dockY)) state.dockY = state.legacy.dockY;
  }

  function legacySnapshot() {
    return {
      version: 12,
      markerHitSize: 48,
      url: urlInput.value,
      actions: state.legacy.actions.map(action => deepClone(action)),
      selectedId: state.selectedLegacyId,
      nextId: state.nextLegacyId,
      method: 'tap',
      count: clamp(int(ui.legacyCount.value, 1), 1, 999_999),
      loop: Boolean(state.legacy.loop),
      timeRandomEnabled: state.legacy.timeRandomEnabled !== false,
      timeJitterMs: clamp(int(ui.legacyJitter.value, 100), 0, 5000),
      positionRandomEnabled: state.legacy.positionRandomEnabled !== false,
      positionJitterPx: clamp(finite(ui.legacyPositionJitter.value, 2), 0, 30),
      recordMode: state.legacy.recordMode || 'replace',
      settingsOpen: true,
      browserHidden: ui.browserBar.classList.contains('hidden'),
      compact: dock.classList.contains('compact'),
      dockX: state.dockX,
      dockY: state.dockY
    };
  }

  function saveLegacyState() {
    if (!state.legacy) return;
    const snapshot = legacySnapshot();
    state.legacy = normalizeLegacyState(snapshot);
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      appendLog(`旧マクロ保存失敗: ${error.message}`, 'error');
    }
  }

  function legacyActionName(action, index = state.legacy.actions.indexOf(action)) {
    if (action.type === 'navigate') return `URL移動 ${index + 1}`;
    if (action.type === 'wait') return `条件待ち ${index + 1}`;
    return `クリック ${index + 1}`;
  }

  function addLegacyAction(type) {
    if (state.legacyRunning || state.recording) return;
    const index = state.legacy.actions.length;
    let action;
    if (type === 'navigate') {
      action = {
        id: state.nextLegacyId++, type: 'navigate', enabled: true, delayMs: index ? 1000 : 0,
        url: currentFrameUrl(), waitForLoad: true, loadTimeoutMs: 15_000, failureMode: 'stop',
        condition: normalizeLegacyCondition({}, 'navigate')
      };
    } else if (type === 'wait') {
      action = {
        id: state.nextLegacyId++, type: 'wait', enabled: true, delayMs: index ? 1000 : 0,
        condition: normalizeLegacyCondition({ enabled: true, target: 'selector', selector: '', type: 'visible' }, 'wait')
      };
    } else {
      action = {
        id: state.nextLegacyId++, type: 'click', enabled: true, delayMs: index ? 1000 : 0,
        cx: window.innerWidth / 2, cy: window.innerHeight / 2, holdMs: 55,
        targetMode: 'point', selector: '', waitForTarget: true, targetTimeoutMs: 15_000,
        targetFailureMode: 'stop', scrollTarget: true, targetLabel: '', condition: normalizeLegacyCondition({}, 'click')
      };
    }
    state.legacy.actions.push(action);
    state.selectedLegacyId = action.id;
    state.legacy.selectedId = action.id;
    renderLegacy();
    saveLegacyState();
  }

  function updateLegacyAction(action, updater) {
    updater(action);
    const normalized = normalizeLegacyState({ ...legacySnapshot(), actions: state.legacy.actions });
    const replacement = normalized.actions.find(item => item.id === action.id);
    if (replacement) Object.assign(action, replacement);
    renderLegacy();
    saveLegacyState();
  }

  function moveLegacyAction(action, direction) {
    const index = state.legacy.actions.indexOf(action);
    const next = index + direction;
    if (next < 0 || next >= state.legacy.actions.length) return;
    [state.legacy.actions[index], state.legacy.actions[next]] = [state.legacy.actions[next], state.legacy.actions[index]];
    renderLegacy();
    saveLegacyState();
  }

  function removeLegacyAction(action) {
    const index = state.legacy.actions.indexOf(action);
    if (index < 0) return;
    state.legacy.actions.splice(index, 1);
    state.selectedLegacyId = (state.legacy.actions[index] || state.legacy.actions[index - 1])?.id ?? null;
    state.legacy.selectedId = state.selectedLegacyId;
    renderLegacy();
    saveLegacyState();
  }

  function duplicateLegacyAction(action) {
    const index = state.legacy.actions.indexOf(action);
    if (index < 0) return;
    const copy = deepClone(action);
    copy.id = state.nextLegacyId++;
    if (copy.type === 'click') {
      copy.cx = clamp(copy.cx + 14, 0, window.innerWidth);
      copy.cy = clamp(copy.cy + 14, 0, window.innerHeight);
    }
    state.legacy.actions.splice(index + 1, 0, copy);
    state.selectedLegacyId = copy.id;
    state.legacy.selectedId = copy.id;
    renderLegacy();
    saveLegacyState();
  }

  function legacyConditionEditor(action) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    const grid = element('div', { className: 'grid2' });
    const enabled = element('input', { type: 'checkbox' });
    enabled.checked = condition.enabled;
    enabled.addEventListener('change', () => updateLegacyAction(action, target => { target.condition.enabled = enabled.checked; }));
    const target = selectInput(condition.target, [['action', 'この動作の対象'], ['selector', 'セレクタ'], ['page', 'ページ全体']], input => updateLegacyAction(action, targetAction => { targetAction.condition.target = input.value; }));
    const type = selectInput(condition.type, [
      ['exists', '要素が存在'], ['missing', '要素が消失'], ['visible', '要素が表示'], ['hidden', '要素が非表示'],
      ['state_on', 'ON'], ['state_off', 'OFF'], ['enabled', '操作可能'], ['disabled', '操作不可'],
      ['gbf_full_auto_on', 'フルオートON'], ['gbf_full_auto_off', 'フルオートOFF'],
      ['gbf_attack_ready', '攻撃可能'], ['gbf_attack_not_ready', '攻撃不可'],
      ['page_ready', 'ページ読込完了'], ['url_contains', 'URLに文字を含む'], ['text_contains', '本文に文字を含む']
    ], input => updateLegacyAction(action, targetAction => { targetAction.condition.type = input.value; }));
    const selector = textInput(condition.selector, input => updateLegacyAction(action, targetAction => { targetAction.condition.selector = input.value; }), '.btn-auto');
    const text = textInput(condition.text, input => updateLegacyAction(action, targetAction => { targetAction.condition.text = input.value; }), '文字列');
    const timeout = numberInput(condition.timeoutMs, 0, 600_000, 500, input => updateLegacyAction(action, targetAction => { targetAction.condition.timeoutMs = input.value; }));
    grid.append(field('条件を使う', enabled), field('監視対象', target), field('成立条件', type), field('セレクタ', selector), field('文字/URL', text), field('タイムアウトms', timeout));
    return grid;
  }

  function renderLegacyAction(action, index) {
    const row = element('div', { className: 'legacyRow' });
    row.classList.toggle('selected', action.id === state.selectedLegacyId);
    const title = element('strong', { text: legacyActionName(action, index) });
    const tools = element('div', { className: 'legacyTools' });
    const tool = (text, handler) => {
      const button = element('button', { text });
      button.disabled = Boolean(state.legacyRunning || state.recording);
      button.addEventListener('click', handler);
      tools.append(button);
    };
    tool('↑', () => moveLegacyAction(action, -1));
    tool('↓', () => moveLegacyAction(action, 1));
    tool('複製', () => duplicateLegacyAction(action));
    tool('削除', () => removeLegacyAction(action));
    const head = element('div', { className: 'legacyHead' }, [title, tools]);
    head.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      state.selectedLegacyId = action.id;
      state.legacy.selectedId = action.id;
      renderLegacy();
      saveLegacyState();
    });
    row.append(head);
    const common = element('div', { className: 'grid2' });
    const enabled = element('input', { type: 'checkbox' });
    enabled.checked = action.enabled !== false;
    enabled.addEventListener('change', () => updateLegacyAction(action, target => { target.enabled = enabled.checked; }));
    const delay = numberInput(action.delayMs, 0, 600_000, 10, input => updateLegacyAction(action, target => { target.delayMs = input.value; }));
    common.append(field('使う', enabled), field('実行前待機ms', delay));
    row.append(common);

    if (action.type === 'click') {
      const grid = element('div', { className: 'grid2' });
      const mode = selectInput(action.targetMode, [['point', '保存位置'], ['selector', 'セレクタ追跡']], input => updateLegacyAction(action, target => { target.targetMode = input.value; }));
      const selector = textInput(action.selector, input => updateLegacyAction(action, target => { target.selector = input.value; }), '.btn-auto');
      const x = numberInput(action.cx, 0, Math.max(1, window.innerWidth), 1, input => updateLegacyAction(action, target => { target.cx = input.value; }));
      const y = numberInput(action.cy, 0, Math.max(1, window.innerHeight), 1, input => updateLegacyAction(action, target => { target.cy = input.value; }));
      const timeout = numberInput(action.targetTimeoutMs, 0, 120_000, 500, input => updateLegacyAction(action, target => { target.targetTimeoutMs = input.value; }));
      grid.append(field('対象', mode), field('セレクタ', selector), field('X', x), field('Y', y), field('対象待機ms', timeout));
      row.append(grid);
    } else if (action.type === 'navigate') {
      const grid = element('div', { className: 'grid2' });
      const url = textInput(action.url, input => updateLegacyAction(action, target => { target.url = input.value; }), 'https://...');
      const timeout = numberInput(action.loadTimeoutMs, 1000, 120_000, 500, input => updateLegacyAction(action, target => { target.loadTimeoutMs = input.value; }));
      grid.append(field('移動先URL', url), field('読込待機ms', timeout));
      row.append(grid);
    }
    row.append(legacyConditionEditor(action));
    row.querySelectorAll('input,select,button').forEach(control => {
      if (state.legacyRunning || state.recording) control.disabled = true;
    });
    return row;
  }

  function clearLegacyMarkers() {
    markerLayer.textContent = '';
  }

  function renderLegacyMarkers() {
    clearLegacyMarkers();
    if (state.page !== 'legacy' || state.recording) return;
    state.legacy.actions.forEach((action, index) => {
      if (action.type !== 'click' || action.targetMode !== 'point') return;
      const marker = element('div', { className: 'marker', text: String(index + 1), attrs: { tabindex: '0', role: 'button' } });
      marker.classList.toggle('selected', action.id === state.selectedLegacyId);
      marker.style.left = `${action.cx}px`;
      marker.style.top = `${action.cy}px`;
      marker.addEventListener('click', () => {
        state.selectedLegacyId = action.id;
        state.legacy.selectedId = action.id;
        renderLegacy();
        saveLegacyState();
      });
      const drag = { active: false, id: null, startX: 0, startY: 0, baseX: 0, baseY: 0 };
      const move = event => {
        if (!drag.active || event.pointerId !== drag.id) return;
        consumeDragEvent(event, true);
        action.cx = clamp(drag.baseX + event.clientX - drag.startX, 0, window.innerWidth);
        action.cy = clamp(drag.baseY + event.clientY - drag.startY, 0, window.innerHeight);
        marker.style.left = `${action.cx}px`;
        marker.style.top = `${action.cy}px`;
      };
      const finish = event => {
        if (!drag.active || event.pointerId !== drag.id) return;
        consumeDragEvent(event, true);
        drag.active = false;
        releaseDragLock(event, marker);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', finish, true);
        saveLegacyState();
        renderLegacyListOnly();
      };
      marker.addEventListener('pointerdown', event => {
        if (state.legacyRunning || state.recording || event.button !== 0) return;
        acquireDragLock(event, marker);
        drag.active = true;
        drag.id = event.pointerId;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.baseX = action.cx;
        drag.baseY = action.cy;
        window.addEventListener('pointermove', move, { capture: true, passive: false });
        window.addEventListener('pointerup', finish, { capture: true, passive: false });
        window.addEventListener('pointercancel', finish, { capture: true, passive: false });
      }, { passive: false });
      marker.addEventListener('keydown', event => {
        const amount = event.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key];
        if (!delta) return;
        event.preventDefault();
        action.cx = clamp(action.cx + delta[0], 0, window.innerWidth);
        action.cy = clamp(action.cy + delta[1], 0, window.innerHeight);
        marker.style.left = `${action.cx}px`;
        marker.style.top = `${action.cy}px`;
        saveLegacyState();
      });
      markerLayer.append(marker);
    });
  }

  function renderLegacyListOnly() {
    ui.legacyList.textContent = '';
    if (!state.legacy.actions.length) ui.legacyList.append(element('div', { className: 'empty', text: '旧マクロの動作はありません。上のボタンから追加できます。' }));
    else state.legacy.actions.forEach((action, index) => ui.legacyList.append(renderLegacyAction(action, index)));
  }

  function renderLegacy() {
    ui.legacyCount.value = clamp(int(ui.legacyCount.value || state.legacy.count, 1), 1, 999_999);
    ui.legacyJitter.value = clamp(int(ui.legacyJitter.value || state.legacy.timeJitterMs, 100), 0, 5000);
    ui.legacyPositionJitter.value = clamp(finite(ui.legacyPositionJitter.value || state.legacy.positionJitterPx, 2), 0, 30);
    renderLegacyListOnly();
    renderLegacyMarkers();
    const busy = Boolean(state.legacyRunning || state.recording);
    ui.legacyRun.disabled = busy || !state.legacy.actions.length;
    ui.legacyStop.disabled = !state.legacyRunning;
  }

  function legacyElementTarget(action) {
    const doc = frameDocument();
    if (action.targetMode === 'selector') {
      let target;
      try { target = doc.querySelector(action.selector); }
      catch { throw new FlowError('旧マクロのセレクタが不正です', 'INVALID_SELECTOR'); }
      if (!target) return null;
      return target.closest?.('button,a,[role="button"],.btn-usual-ok,.btn-multi-raid,.btn-supporter') || target;
    }
    const frameRect = iframe.getBoundingClientRect();
    const x = action.cx - frameRect.left;
    const y = action.cy - frameRect.top;
    if (x < 0 || y < 0 || x > frameRect.width || y > frameRect.height) throw new FlowError('旧マクロの保存位置がiframe外です', 'POINT_OUTSIDE_FRAME');
    return doc.elementFromPoint(x, y);
  }

  function legacyPositionWithJitter(action) {
    if (!state.legacy.positionRandomEnabled) return { x: action.cx, y: action.cy };
    const radius = clamp(finite(ui.legacyPositionJitter.value, 2), 0, 30);
    if (!radius) return { x: action.cx, y: action.cy };
    const angle = Math.random() * Math.PI * 2;
    const length = Math.sqrt(Math.random()) * radius;
    return {
      x: clamp(action.cx + Math.cos(angle) * length, 0, window.innerWidth),
      y: clamp(action.cy + Math.sin(angle) * length, 0, window.innerHeight)
    };
  }

  function legacyBooleanState(target) {
    if (!target) return null;
    if (target.classList?.contains('on') || target.classList?.contains('active') || target.getAttribute?.('aria-pressed') === 'true') return true;
    if (target.classList?.contains('off') || target.classList?.contains('inactive') || target.getAttribute?.('aria-pressed') === 'false') return false;
    return null;
  }

  function legacyConditionTarget(action, condition) {
    const doc = frameDocument();
    if (condition.target === 'page') return { document: doc, page: true };
    if (condition.target === 'action' && action.type === 'click') return { element: legacyElementTarget(action) };
    if (!condition.selector) return { element: null };
    try { return { element: doc.querySelector(condition.selector) }; }
    catch { throw new FlowError('旧マクロ条件のセレクタが不正です', 'INVALID_SELECTOR'); }
  }

  function evaluateLegacyCondition(action) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    if (!condition.enabled) return { matched: true };
    if (condition.type === 'gbf_full_auto_on') return { matched: fullAutoState().on };
    if (condition.type === 'gbf_full_auto_off') {
      const auto = fullAutoState();
      return { matched: auto.exists && !auto.on };
    }
    if (condition.type === 'gbf_attack_ready' || condition.type === 'gbf_attack_not_ready') {
      const snapshot = attackSnapshot();
      const ready = snapshot.startVisible && !snapshot.cancelVisible && !snapshot.dummyVisible;
      return { matched: condition.type === 'gbf_attack_ready' ? ready : !ready };
    }
    const target = legacyConditionTarget(action, condition);
    if (target.page) {
      if (condition.type === 'page_ready') return { matched: pageBaseReady(target.document) };
      if (condition.type === 'url_contains') return { matched: currentFrameUrl().includes(condition.text) };
      if (condition.type === 'url_not_contains') return { matched: !currentFrameUrl().includes(condition.text) };
      return { matched: false };
    }
    const elementTarget = target.element;
    const visible = computedVisible(elementTarget);
    const disabled = Boolean(elementTarget && ('disabled' in elementTarget && elementTarget.disabled || elementTarget.getAttribute?.('aria-disabled') === 'true'));
    switch (condition.type) {
      case 'exists': return { matched: Boolean(elementTarget) };
      case 'missing': return { matched: !elementTarget };
      case 'visible': return { matched: visible };
      case 'hidden': return { matched: !elementTarget || !visible };
      case 'enabled': return { matched: Boolean(elementTarget) && !disabled };
      case 'disabled': return { matched: Boolean(elementTarget) && disabled };
      case 'state_on': return { matched: legacyBooleanState(elementTarget) === true };
      case 'state_off': return { matched: legacyBooleanState(elementTarget) === false };
      case 'class_has': return { matched: Boolean(elementTarget) && String(condition.className).trim().split(/\s+/).filter(Boolean).every(name => elementTarget.classList.contains(name)) };
      case 'class_missing': return { matched: !elementTarget || String(condition.className).trim().split(/\s+/).filter(Boolean).some(name => !elementTarget.classList.contains(name)) };
      case 'text_contains': return { matched: Boolean(elementTarget) && String(elementTarget.textContent || '').includes(condition.text) };
      case 'text_not_contains': return { matched: !elementTarget || !String(elementTarget.textContent || '').includes(condition.text) };
      default: return { matched: false };
    }
  }

  async function waitForLegacyCondition(action, signal) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    if (!condition.enabled) return 'execute';
    const initial = evaluateLegacyCondition(action);
    if (condition.mode === 'check') return initial.matched ? 'execute' : 'skip';
    try {
      await monitorFrame(() => evaluateLegacyCondition(action).matched, {
        signal,
        timeoutMs: condition.timeoutMs,
        stableMs: condition.stableMs,
        description: `${legacyActionName(action)}の条件待ち`
      });
      return 'execute';
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (condition.timeoutAction === 'skip') return 'skip';
      if (condition.timeoutAction === 'execute') return 'execute';
      throw error;
    }
  }

  async function waitForLegacyTarget(action, signal) {
    let immediate = legacyElementTarget(action);
    if (immediate && computedVisible(immediate)) return immediate;
    if (action.targetMode !== 'selector' || !action.waitForTarget) return immediate;
    return monitorFrame(() => {
      const target = legacyElementTarget(action);
      return target && computedVisible(target) ? target : false;
    }, { signal, timeoutMs: action.targetTimeoutMs, stableMs: 30, description: `${legacyActionName(action)}の対象待ち` });
  }

  async function executeLegacyClick(action, signal) {
    let target;
    try {
      target = await waitForLegacyTarget(action, signal);
    } catch (error) {
      if (action.targetFailureMode === 'skip' && error?.code === 'TIMEOUT') return { skipped: true };
      if (action.targetFailureMode !== 'point') throw error;
    }
    if (!target && action.targetFailureMode === 'point') {
      const point = legacyPositionWithJitter(action);
      const frameRect = iframe.getBoundingClientRect();
      target = frameDocument().elementFromPoint(point.x - frameRect.left, point.y - frameRect.top);
    }
    if (!target) {
      if (action.targetFailureMode === 'skip') return { skipped: true };
      throw new FlowError('旧マクロの押下対象が見つかりません', 'TARGET_MISSING');
    }
    if (!computedVisible(target)) throw new FlowError('旧マクロの押下対象が非表示です', 'TARGET_HIDDEN');
    await jqTapStrict(target, { signal, label: legacyActionName(action) });
    return { ok: true };
  }

  async function executeLegacyAction(action, signal, index) {
    if (action.enabled === false) return 'skip';
    const jitter = state.legacy.timeRandomEnabled && index > 0 ? randomUniform(-finite(ui.legacyJitter.value, 100), finite(ui.legacyJitter.value, 100)) : 0;
    await abortableDelay(Math.max(0, action.delayMs + jitter), signal);
    const conditionResult = await waitForLegacyCondition(action, signal);
    if (conditionResult === 'skip') return 'skip';
    if (action.type === 'wait') return 'ok';
    if (action.type === 'navigate') {
      const destination = String(action.url || '').trim();
      if (!destination) throw new FlowError('旧マクロのURLが空です', 'INVALID_URL');
      const normalized = /^https?:/i.test(destination) ? new URL(destination).href : new URL(destination, currentFrameUrl() || location.href).href;
      if (action.waitForLoad) {
        await performFrameOperation(() => {
          urlInput.value = normalized;
          iframe.contentWindow.location.href = normalized;
        }, { signal, timeoutMs: action.loadTimeoutMs, expectedScreen: 'auto', requireChange: true });
      } else {
        iframe.contentWindow.location.href = normalized;
      }
      return 'ok';
    }
    const result = await executeLegacyClick(action, signal);
    return result.skipped ? 'skip' : 'ok';
  }

  async function startLegacy() {
    if (state.legacyRunning || state.running || state.recording || !state.legacy.actions.length) return;
    const controller = new AbortController();
    const token = { controller, signal: controller.signal };
    state.legacyRunning = token;
    const restoreExpandedDock = enterRuntimeCompactMode();
    ui.legacyRun.disabled = true;
    ui.legacyStop.disabled = false;
    if (!lightweightMode) renderLegacy();
    saveLegacyState();
    appendLog('旧マクロを開始');
    try {
      const count = clamp(int(ui.legacyCount.value, 1), 1, 999_999);
      let cycle = 0;
      while (!controller.signal.aborted && (state.legacy.loop || cycle < count)) {
        for (let index = 0; index < state.legacy.actions.length; index++) {
          throwIfAborted(controller.signal);
          const action = state.legacy.actions[index];
          setStatus(`${cycle + 1}周目 · ${legacyActionName(action, index)}`);
          const result = await executeLegacyAction(action, controller.signal, index);
          appendLog(`${legacyActionName(action, index)}: ${result === 'skip' ? 'スキップ' : '完了'}`, result === 'skip' ? 'warn' : 'success', '旧マクロ');
        }
        cycle += 1;
      }
      appendLog(`旧マクロ ${cycle}周完了`, 'success');
      setStatus('旧マクロ完了');
    } catch (error) {
      if (error?.name === 'AbortError') {
        appendLog('旧マクロを停止', 'warn');
        setStatus('旧マクロ停止');
      } else {
        appendLog(`旧マクロエラー: ${error.message}`, 'error');
        setStatus(`旧マクロ停止: ${error.message}`);
      }
    } finally {
      if (state.legacyRunning === token) state.legacyRunning = null;
      leaveRuntimeCompactMode(restoreExpandedDock);
      ui.legacyRun.disabled = false;
      ui.legacyStop.disabled = true;
      renderLegacy();
    }
  }

  function stopLegacy(reason = '停止ボタン') {
    state.legacyRunning?.controller.abort(new DOMException(reason, 'AbortError'));
  }

  function legacyPresetKey(slot) {
    return `${LEGACY_PRESET_PREFIX}_${slot}`;
  }

  function readLegacyPreset(slot) {
    let data = readJson(legacyPresetKey(slot));
    if (data) return data;
    for (const prefix of LEGACY_PRESET_PREFIXES) {
      data = readJson(`${prefix}_${slot}`);
      if (data) return data;
    }
    return null;
  }

  function refreshLegacyPresets() {
    const selected = ui.legacyPresetSlot.value || '1';
    ui.legacyPresetSlot.textContent = '';
    for (let slot = 1; slot <= 8; slot++) {
      const data = readLegacyPreset(slot);
      const name = String(data?.presetMeta?.name || `保存 ${slot}`);
      ui.legacyPresetSlot.append(element('option', { value: String(slot), text: `${name}${data ? ' ✓' : ''}` }));
    }
    ui.legacyPresetSlot.value = selected;
    const current = readLegacyPreset(selected);
    ui.legacyPresetName.value = String(current?.presetMeta?.name || '');
  }

  function saveLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const name = String(ui.legacyPresetName.value || '').trim() || `保存 ${slot}`;
    const snapshot = { ...legacySnapshot(), presetMeta: { name, savedAt: Date.now() } };
    try {
      localStorage.setItem(legacyPresetKey(slot), JSON.stringify(snapshot));
      refreshLegacyPresets();
      ui.legacyPresetSlot.value = slot;
      ui.legacyPresetName.value = name;
      toast(`「${name}」を保存しました`);
    } catch (error) {
      toast(`保存失敗: ${error.message}`);
    }
  }

  function loadLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const data = readLegacyPreset(slot);
    if (!data) return toast('このスロットは空です');
    state.legacy = normalizeLegacyState(data);
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    ui.legacyCount.value = state.legacy.count;
    ui.legacyJitter.value = state.legacy.timeJitterMs;
    ui.legacyPositionJitter.value = state.legacy.positionJitterPx;
    if (state.legacy.url) {
      urlInput.value = state.legacy.url;
      iframe.src = state.legacy.url;
    }
    renderLegacy();
    saveLegacyState();
    toast(`「${data.presetMeta?.name || `保存 ${slot}`}」を読み込みました`);
  }

  function deleteLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const data = readLegacyPreset(slot);
    if (!data) return toast('このスロットは空です');
    if (!confirm(`「${data.presetMeta?.name || `保存 ${slot}`}」を削除しますか？`)) return;
    localStorage.removeItem(legacyPresetKey(slot));
    for (const prefix of LEGACY_PRESET_PREFIXES) localStorage.removeItem(`${prefix}_${slot}`);
    refreshLegacyPresets();
    toast('削除しました');
  }

  function createRecordDot(x, y, number) {
    const dot = element('div', { className: 'recordDot', text: String(number) });
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    recordLayer.append(dot);
    return dot;
  }

  function startLegacyRecording() {
    if (state.recording || state.running || state.legacyRunning) return;
    state.recording = true;
    state.recordedPoints = [];
    state.activeRecordPointers.clear();
    state.recordStartedAt = performance.now();
    recordLayer.textContent = '';
    recordLayer.classList.add('active');
    clearLegacyMarkers();
    setStatus('タッチ記録中。終了するには旧マクロの「タッチ記録」を再度押してください');
    toast('記録中。ボタンを再度押すと確定します');
  }

  function finishLegacyRecording({ apply = true } = {}) {
    if (!state.recording) return;
    state.recording = false;
    recordLayer.classList.remove('active');
    state.activeRecordPointers.clear();
    if (apply && state.recordedPoints.length) {
      if (state.legacy.recordMode !== 'append') state.legacy.actions = state.legacy.actions.filter(action => action.type !== 'click');
      const records = state.recordedPoints.slice().sort((a, b) => a.startedAt - b.startedAt);
      let previous = 0;
      records.forEach((record, index) => {
        const delayMs = index === 0 ? record.startedAt : record.startedAt - previous;
        previous = record.startedAt;
        state.legacy.actions.push({
          id: state.nextLegacyId++, type: 'click', enabled: true, delayMs: Math.max(0, int(delayMs, 0)),
          cx: record.x, cy: record.y, holdMs: clamp(int(record.holdMs, 55), 0, 5000),
          targetMode: 'point', selector: '', waitForTarget: true, targetTimeoutMs: 15_000,
          targetFailureMode: 'stop', scrollTarget: true, targetLabel: '', condition: normalizeLegacyCondition({}, 'click')
        });
      });
      state.selectedLegacyId = state.legacy.actions.at(-1)?.id ?? null;
      state.legacy.selectedId = state.selectedLegacyId;
      toast(`${records.length}件を追加しました`);
    }
    state.recordedPoints = [];
    recordLayer.textContent = '';
    renderLegacy();
    saveLegacyState();
    setStatus('記録終了');
  }

  function recordPointerDown(event) {
    if (!state.recording) return;
    event.preventDefault();
    const started = performance.now();
    const item = {
      pointerId: event.pointerId,
      absoluteStart: started,
      startedAt: started - state.recordStartedAt,
      x: event.clientX,
      y: event.clientY,
      dot: createRecordDot(event.clientX, event.clientY, state.recordedPoints.length + state.activeRecordPointers.size + 1)
    };
    state.activeRecordPointers.set(event.pointerId, item);
  }

  function recordPointerMove(event) {
    const item = state.activeRecordPointers.get(event.pointerId);
    if (!item) return;
    event.preventDefault();
    item.x = event.clientX;
    item.y = event.clientY;
    item.dot.style.left = `${item.x}px`;
    item.dot.style.top = `${item.y}px`;
  }

  function recordPointerEnd(event) {
    const item = state.activeRecordPointers.get(event.pointerId);
    if (!item) return;
    event.preventDefault();
    recordPointerMove(event);
    state.activeRecordPointers.delete(event.pointerId);
    state.recordedPoints.push({ startedAt: item.startedAt, x: item.x, y: item.y, holdMs: performance.now() - item.absoluteStart });
    item.dot.textContent = String(state.recordedPoints.length);
  }

  function selectWorkflow(id) {
    if (!state.workflows.workflows.some(workflow => workflow.id === id)) return;
    state.selectedWorkflowId = id;
    state.workflows.currentId = id;
    state.insertion = null;
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
  }

  function createNewWorkflow() {
    if (state.running) return;
    const workflow = normalizeWorkflow({ name: `ワークフロー ${state.workflows.workflows.length + 1}`, blocks: [] });
    state.workflows.workflows.push(workflow);
    state.selectedWorkflowId = workflow.id;
    state.workflows.currentId = workflow.id;
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast('新しいワークフローを作成しました');
  }

  function renameCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const name = String(ui.workflowName.value || '').trim().slice(0, 60);
    if (!name) return toast('名前を入力してください');
    workflow.name = name;
    workflow.updatedAt = Date.now();
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast('名前を変更しました');
  }

  function duplicateCurrentWorkflow() {
    const current = currentWorkflow();
    if (!current || state.running) return;
    const workflow = normalizeWorkflow(deepClone(current));
    workflow.id = nowId('workflow');
    workflow.name = `${current.name} のコピー`.slice(0, 60);
    workflow.blocks.forEach(regenerateBlockIds);
    workflow.createdAt = Date.now();
    workflow.updatedAt = Date.now();
    state.workflows.workflows.push(workflow);
    state.selectedWorkflowId = workflow.id;
    state.workflows.currentId = workflow.id;
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast('ワークフローを複製しました');
  }

  function deleteCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    if (state.workflows.workflows.length === 1) return toast('最後のワークフローは削除できません');
    if (!confirm(`「${workflow.name}」を削除しますか？`)) return;
    const index = state.workflows.workflows.indexOf(workflow);
    state.workflows.workflows.splice(index, 1);
    const next = state.workflows.workflows[index] || state.workflows.workflows[index - 1];
    state.selectedWorkflowId = next.id;
    state.workflows.currentId = next.id;
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast('ワークフローを削除しました');
  }

  function applyTemplate(mode) {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const template = findTemplate(ui.templateSelect.value);
    const blocks = template[2]().map(normalizeBlock);
    if (mode === 'replace') workflow.blocks = blocks;
    else workflow.blocks.push(...blocks);
    workflow.updatedAt = Date.now();
    state.insertion = null;
    saveWorkflowStore({ immediate: true });
    renderWorkflowEditor();
    toast(`「${template[1]}」を${mode === 'replace' ? '読み込み' : '追加'}しました`);
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function exportCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const safeName = workflow.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 50) || 'workflow';
    downloadJson(normalizeWorkflow(workflow), `${safeName}.autoflow.json`);
    toast('JSONを書き出しました');
  }

  let importPurpose = null;
  function chooseImportFile(purpose) {
    importPurpose = purpose;
    if (typeof importFile.showPicker === 'function') importFile.showPicker();
    else importFile.click();
  }

  function importWorkflowData(data, fileName = 'JSON') {
    const candidate = data?.workflow || data;
    let workflows;
    if (Array.isArray(candidate?.workflows)) workflows = candidate.workflows.map(normalizeWorkflow);
    else if (Array.isArray(candidate)) workflows = candidate.map(normalizeWorkflow);
    else if (candidate && Array.isArray(candidate.blocks)) workflows = [normalizeWorkflow(candidate)];
    else throw new Error('ワークフローAST形式ではありません');
    if (!workflows.length) throw new Error('ワークフローが空です');
    for (const workflow of workflows) {
      workflow.id = nowId('workflow');
      workflow.blocks.forEach(regenerateBlockIds);
      state.workflows.workflows.push(workflow);
    }
    state.selectedWorkflowId = workflows.at(-1).id;
    state.workflows.currentId = state.selectedWorkflowId;
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(`${fileName}を読み込みました`);
  }

  function setPage(page) {
    state.page = ['workflow', 'legacy', 'logs'].includes(page) ? page : 'workflow';
    shadow.querySelectorAll('.mainTab').forEach(button => button.classList.toggle('active', button.dataset.page === state.page));
    shadow.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${state.page}`));
    if (state.page === 'logs') renderLogs();
    renderLegacyMarkers();
  }

  function setBrowserHidden(hidden) {
    ui.browserBar.classList.toggle('hidden', hidden);
    ui.browserHandle.classList.toggle('visible', hidden);
    saveLegacyState();
  }

  function enterRuntimeCompactMode() {
    if (!lightweightMode || dock.classList.contains('compact')) return false;
    dock.classList.add('compact');
    byId('toggleCompact').textContent = '□';
    requestAnimationFrame(positionDock);
    return true;
  }

  function leaveRuntimeCompactMode(restoreExpandedDock) {
    if (!restoreExpandedDock) return;
    dock.classList.remove('compact');
    byId('toggleCompact').textContent = '—';
    requestAnimationFrame(positionDock);
  }

  function setCompact(compact) {
    dock.classList.toggle('compact', compact);
    byId('toggleCompact').textContent = compact ? '□' : '—';
    requestAnimationFrame(positionDock);
    saveLegacyState();
  }

  function positionDock() {
    const rect = dock.getBoundingClientRect();
    const width = rect.width || 780;
    const height = rect.height || 600;
    if (!Number.isFinite(state.dockX)) state.dockX = 8;
    if (!Number.isFinite(state.dockY)) state.dockY = Math.max(8, window.innerHeight - height - 8);
    state.dockX = clamp(state.dockX, 4, Math.max(4, window.innerWidth - width - 4));
    state.dockY = clamp(state.dockY, 4, Math.max(4, window.innerHeight - height - 4));
    dock.style.left = `${state.dockX}px`;
    dock.style.top = `${state.dockY}px`;
    dock.style.bottom = 'auto';
  }

  function installDockDrag(handle) {
    const drag = { active: false, id: null, startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false };
    const move = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      drag.moved ||= Math.hypot(dx, dy) > 3;
      state.dockX = drag.baseX + dx;
      state.dockY = drag.baseY + dy;
      positionDock();
    };
    const finish = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      drag.active = false;
      releaseDragLock(event, handle);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      if (!drag.moved && handle.id === 'compactGrip') setCompact(false);
      saveLegacyState();
    };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      acquireDragLock(event, handle);
      const rect = dock.getBoundingClientRect();
      drag.active = true;
      drag.id = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.baseX = rect.left;
      drag.baseY = rect.top;
      drag.moved = false;
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true, passive: false });
      window.addEventListener('pointercancel', finish, { capture: true, passive: false });
    }, { passive: false });
    addCleanup(() => {
      if (drag.active) releaseDragLock(null, handle);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    });
  }

  function normalizeInitialUrl() {
    const saved = String(state.legacy.url || '').trim();
    const source = !saved || saved === 'about:blank' ? location.href : saved;
    try { return new URL(source, location.href).href; }
    catch { return location.href; }
  }

  async function loadUrlFromBar() {
    const raw = String(urlInput.value || '').trim();
    if (!raw) return;
    let destination;
    try { destination = /^https?:/i.test(raw) ? new URL(raw).href : new URL(raw, currentFrameUrl() || location.href).href; }
    catch { return toast('URLが不正です'); }
    urlInput.value = destination;
    saveLegacyState();
    setStatus('読込中');
    try {
      await replaceFrame(destination);
    } catch (error) {
      toast(`URL移動失敗: ${error.message}`);
    }
  }

  function stopEverything(reason = '停止') {
    stopWorkflow(reason);
    stopLegacy(reason);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    stopEverything('終了');
    if (state.recording) finishLegacyRecording({ apply: false });
    clearTimeout(state.toastTimer);
    clearTimeout(state.autosaveTimer);
    clearLegacyMarkers();
    for (const callback of cleanup) {
      try { callback(); } catch {}
    }
    cleanup.clear();
    try {
      iframe.removeEventListener('load', handleFrameLoad);
      releaseFrameRuntime(iframe);
      iframe.src = 'about:blank';
    } catch {}
    root.remove();
    if (window[GLOBAL_KEY]?.destroy === destroy) delete window[GLOBAL_KEY];
  }

  byId('loadUrl').addEventListener('click', loadUrlFromBar);
  urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') loadUrlFromBar(); });
  byId('backFrame').addEventListener('click', () => { try { iframe.contentWindow.history.back(); } catch { toast('戻る操作に失敗しました'); } });
  byId('forwardFrame').addEventListener('click', () => { try { iframe.contentWindow.history.forward(); } catch { toast('進む操作に失敗しました'); } });
  byId('reloadFrame').addEventListener('click', () => { try { iframe.contentWindow.location.reload(); } catch { iframe.src = iframe.src; } });
  byId('hideBrowser').addEventListener('click', () => setBrowserHidden(true));
  ui.browserHandle.addEventListener('click', () => setBrowserHidden(false));
  byId('closeApp').addEventListener('click', destroy);
  byId('toggleCompact').addEventListener('click', () => setCompact(!dock.classList.contains('compact')));
  byId('compactRun').addEventListener('click', () => state.page === 'legacy' ? (state.legacyRunning ? stopLegacy() : startLegacy()) : (state.running ? stopWorkflow() : startWorkflow()));
  shadow.querySelectorAll('.mainTab').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));

  ui.workflowSelect.addEventListener('change', () => selectWorkflow(ui.workflowSelect.value));
  ui.workflowName.addEventListener('change', renameCurrentWorkflow);
  ui.workflowLoopCount.addEventListener('change', () => {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    workflow.loopCount = clamp(int(ui.workflowLoopCount.value, 1), 1, MAX_WORKFLOW_LOOP_COUNT);
    touchWorkflow();
    renderWorkflowEditor();
  });
  ui.workflowLoopMode.addEventListener('change', () => {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    workflow.loopInfinite = ui.workflowLoopMode.value === 'infinite';
    touchWorkflow();
    renderWorkflowEditor();
  });
  byId('newWorkflow').addEventListener('click', createNewWorkflow);
  byId('renameWorkflow').addEventListener('click', renameCurrentWorkflow);
  byId('duplicateWorkflow').addEventListener('click', duplicateCurrentWorkflow);
  byId('deleteWorkflow').addEventListener('click', deleteCurrentWorkflow);
  byId('replaceTemplate').addEventListener('click', () => applyTemplate('replace'));
  byId('appendTemplate').addEventListener('click', () => applyTemplate('append'));
  byId('exportWorkflow').addEventListener('click', exportCurrentWorkflow);
  byId('importWorkflow').addEventListener('click', () => chooseImportFile('workflow'));
  ui.runWorkflow.addEventListener('click', startWorkflow);
  ui.stopWorkflow.addEventListener('click', () => stopWorkflow());

  byId('legacyAddClick').addEventListener('click', () => addLegacyAction('click'));
  byId('legacyAddNavigate').addEventListener('click', () => addLegacyAction('navigate'));
  byId('legacyAddWait').addEventListener('click', () => addLegacyAction('wait'));
  byId('legacyRecord').addEventListener('click', () => state.recording ? finishLegacyRecording({ apply: true }) : startLegacyRecording());
  ui.legacyRun.addEventListener('click', startLegacy);
  ui.legacyStop.addEventListener('click', () => stopLegacy());
  for (const input of [ui.legacyCount, ui.legacyJitter, ui.legacyPositionJitter]) input.addEventListener('change', () => {
    state.legacy.count = clamp(int(ui.legacyCount.value, 1), 1, 999_999);
    state.legacy.timeJitterMs = clamp(int(ui.legacyJitter.value, 100), 0, 5000);
    state.legacy.positionJitterPx = clamp(finite(ui.legacyPositionJitter.value, 2), 0, 30);
    renderLegacy();
    saveLegacyState();
  });
  byId('legacySavePreset').addEventListener('click', saveLegacyPreset);
  byId('legacyLoadPreset').addEventListener('click', loadLegacyPreset);
  byId('legacyDeletePreset').addEventListener('click', deleteLegacyPreset);
  ui.legacyPresetSlot.addEventListener('change', () => {
    const data = readLegacyPreset(ui.legacyPresetSlot.value);
    ui.legacyPresetName.value = String(data?.presetMeta?.name || '');
  });
  byId('clearLogs').addEventListener('click', () => { state.logs = []; renderLogs(); });

  recordLayer.addEventListener('pointerdown', recordPointerDown, { passive: false });
  recordLayer.addEventListener('pointermove', recordPointerMove, { passive: false });
  recordLayer.addEventListener('pointerup', recordPointerEnd, { passive: false });
  recordLayer.addEventListener('pointercancel', recordPointerEnd, { passive: false });

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (importPurpose === 'workflow') importWorkflowData(data, file.name);
    } catch (error) {
      toast(`JSON読込失敗: ${error.message}`);
    } finally {
      importPurpose = null;
    }
  });

  bindFrameLoad(iframe);

  const resizeHandler = () => {
    positionDock();
    for (const action of state.legacy?.actions || []) {
      if (action.type === 'click') {
        action.cx = clamp(action.cx, 0, window.innerWidth);
        action.cy = clamp(action.cy, 0, window.innerHeight);
      }
    }
    renderLegacyMarkers();
  };
  window.addEventListener('resize', resizeHandler, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeHandler, { passive: true });
  addCleanup(() => {
    window.removeEventListener('resize', resizeHandler);
    window.visualViewport?.removeEventListener('resize', resizeHandler);
  });
  installDockDrag(byId('dockGrip'));
  installDockDrag(byId('compactGrip'));

  shadow.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (state.recording) finishLegacyRecording({ apply: false });
      else stopEverything('Escape');
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (state.page === 'legacy') state.legacyRunning ? stopLegacy() : startLegacy();
      else state.running ? stopWorkflow() : startWorkflow();
    }
  });

  document.documentElement.append(root);
  stopRuntimeTelemetry(window);
  loadWorkflowStore();
  loadLegacyState();
  renderTemplateSelect();
  renderWorkflowSelect();
  renderPalette();
  refreshLegacyPresets();
  renderLegacy();
  renderLogs();
  setPage('workflow');
  setBrowserHidden(state.legacy.browserHidden || narrowScreen);
  setCompact(state.legacy.compact || narrowScreen);
  requestAnimationFrame(positionDock);
  const initialUrl = normalizeInitialUrl();
  urlInput.value = initialUrl;
  iframe.src = initialUrl;

  window.__AUTO_TEST__ = {
    APP_VERSION,
    state,
    iframe,
    normalizePopupText,
    normalizeBlock,
    normalizeWorkflow,
    migrateWorkflowStore,
    createBlock,
    rankAssistRows,
    parseAssistRow,
    randomUniform,
    chooseSupporter,
    parseSupporterRow,
    detectScreenState,
    evaluateWorkflowCondition,
    normalizeLegacyState,
    legacySnapshot,
    startWorkflow,
    stopWorkflow,
    startLegacy,
    stopLegacy,
    waitForFrameReady,
    performFrameOperation,
    jqTapStrict,
    ensureFullAuto,
    waitForAutoAttack,
    confirmAllUnclaimed,
    refreshAssistList,
    TEMPLATES,
    BLOCK_DEFINITIONS,
    ERROR_MESSAGES,
    SELECTORS
  };
  window[GLOBAL_KEY] = {
    version: APP_VERSION,
    destroy,
    stop: stopEverything,
    save: () => { saveWorkflowStore({ immediate: true }); saveLegacyState(); },
    startWorkflow,
    startLegacy
  };
  if (typeof completion === 'function') completion({ ok: true, installed: true, version: APP_VERSION });
})();