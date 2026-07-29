from pathlib import Path

path = Path('a.js')
source = path.read_text()

def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    source = source.replace(old, new, 1)

replace_once('const APP_VERSION = 14;', 'const APP_VERSION = 15;', 'version')
replace_once('const MAX_LOGS = 250;', 'const MAX_LOGS = 100;', 'log cap')
replace_once("const supportsNativeBlockDrag = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;", "const supportsNativeBlockDrag = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;\n  const lightweightMode = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;", 'lightweight mode')
replace_once("@media(hover:none) and (pointer:coarse){button{min-height:48px}.blockHead button,.legacyTools button{min-height:44px;height:44px}}", "@media(hover:none) and (pointer:coarse){#browserBar,#dock{backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 8px 24px rgba(0,0,0,.32)}button{min-height:48px}.blockHead button,.legacyTools button{min-height:44px;height:44px}}", 'coarse pointer GPU effects')

old_logs = '''  function appendLog(message, level = '', blockName = '') {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.logs.push({ time, level, blockName, message: String(message) });
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    renderLogs();
  }

  function renderLogs() {
    ui.logList.textContent = '';
    if (!state.logs.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = '実行するとここに記録されます。';
      ui.logList.append(empty);
      return;
    }
    for (const log of state.logs) {
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
      ui.logList.append(row);
    }
    ui.logList.scrollTop = ui.logList.scrollHeight;
  }'''
new_logs = '''  function createLogRow(log) {
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

  function appendLog(message, level = '', blockName = '') {
    const log = {
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
    ui.logList.scrollTop = ui.logList.scrollHeight;
  }

  function renderLogs() {
    ui.logList.textContent = '';
    if (!state.logs.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = '実行するとここに記録されます。';
      ui.logList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const log of state.logs) fragment.append(createLogRow(log));
    ui.logList.append(fragment);
    ui.logList.scrollTop = ui.logList.scrollHeight;
  }'''
replace_once(old_logs, new_logs, 'incremental logs')

replace_once("    shadow.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${state.page}`));\n    renderLegacyMarkers();", "    shadow.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${state.page}`));\n    if (state.page === 'logs') renderLogs();\n    renderLegacyMarkers();", 'lazy log render')

old_running = '''  function setRunningBlock(context, block, progress = '') {
    context.currentBlockId = block?.id || null;
    state.blockProgress.clear();
    if (block && progress) state.blockProgress.set(block.id, progress);
    renderWorkflowEditor();
  }'''
new_running = '''  function setRunningBlock(context, block, progress = '') {
    context.currentBlockId = block?.id || null;
    state.blockProgress.clear();
    shadow.querySelectorAll('.blockCard.running').forEach(card => card.classList.remove('running'));
    shadow.querySelectorAll('.progressBadge').forEach(badge => badge.remove());
    if (!block) return;
    if (progress) state.blockProgress.set(block.id, progress);
    const escapedId = window.CSS?.escape ? window.CSS.escape(block.id) : String(block.id).replace(/["\\]/g, '\\$&');
    const card = shadow.querySelector(`.blockCard[data-block-id="${escapedId}"]`);
    card?.classList.add('running');
    if (card && progress) card.querySelector('.blockName')?.append(element('span', { className: 'progressBadge', text: progress }));
  }'''
replace_once(old_running, new_running, 'incremental running block')

replace_once("        observer = new MutationObserver(() => {\n          lastMutation = performance.now();\n          stableSince = null;\n          evaluate();\n        });\n        try {\n          observer.observe(rootNode, { subtree: true, childList: true, attributes: true, characterData: true });\n        } catch {}", "        if (lightweightMode) return;\n        let scheduled = false;\n        observer = new MutationObserver(() => {\n          lastMutation = performance.now();\n          stableSince = null;\n          if (scheduled) return;\n          scheduled = true;\n          requestAnimationFrame(() => { scheduled = false; evaluate(); });\n        });\n        try {\n          observer.observe(rootNode, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });\n        } catch {}", 'lightweight observer')
replace_once("      if (allowInterval) interval = setInterval(evaluate, timeoutMs === 0 ? 1000 : 300);", "      if (allowInterval) interval = setInterval(evaluate, timeoutMs === 0 ? 1000 : (lightweightMode ? 500 : 300));", 'poll cadence')

path.write_text(source)
