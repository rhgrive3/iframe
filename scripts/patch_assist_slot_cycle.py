from pathlib import Path

path = Path('a.js')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    source = source.replace(old, new, 1)


def replace_section(start_marker: str, end_marker: str, replacement: str, label: str) -> None:
    global source
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label}: start marker not found')
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'{label}: end marker not found')
    source = source[:start] + replacement + source[end:]


replace_once('  const APP_VERSION = 28;', '  const APP_VERSION = 29;', 'version')

replace_once(
    "    assistRows: '#prt-search-list > .btn-multi-raid.lis-raid.search',\n    supporterScreen:",
    "    assistRows: '#prt-search-list > .btn-multi-raid.lis-raid.search',\n    assistSlot: '#prt-search-switch .btn-search-switch',\n    unclaimedAttention: '.btn-unconfirmed-result.flow-unclaimed.attention',\n    supporterScreen:",
    'assist selectors',
)

replace_once(
    "        return { minimumHp: 50, baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15, maxAttempts: 10000, supporterCandidates: defaultSupporterCandidates() };",
    "        return { minimumHp: 50, baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15, maxAttempts: 10000, assistSlots: [1], supporterCandidates: defaultSupporterCandidates() };",
    'assist defaults',
)

replace_once(
    "  function normalizeCandidates(value) {",
    "  function normalizeAssistSlots(value) {\n    const raw = Array.isArray(value) ? value : [value];\n    const slots = [...new Set(raw.map(item => int(item, 0)).filter(item => item >= 1 && item <= 4))]\n      .sort((a, b) => a - b);\n    return slots.length ? slots : [1];\n  }\n\n  function normalizeCandidates(value) {",
    'assist slot normalization',
)

replace_once(
    "          maxAttempts: clamp(int(config.maxAttempts, 10000), 1, 100000),\n          supporterCandidates: normalizeCandidates(config.supporterCandidates)",
    "          maxAttempts: clamp(int(config.maxAttempts, 10000), 1, 100000),\n          assistSlots: normalizeAssistSlots(config.assistSlots),\n          supporterCandidates: normalizeCandidates(config.supporterCandidates)",
    'assist slot config normalization',
)

replace_once(
    "  function renderBlockConfig(block, container) {",
    "  function renderAssistSlots(block, container) {\n    const selectedSlots = normalizeAssistSlots(block.config.assistSlots);\n    const grid = element('div', { className: 'grid2' });\n    for (const slot of [1, 2, 3, 4]) {\n      const input = element('input', { type: 'checkbox' });\n      input.checked = selectedSlots.includes(slot);\n      input.addEventListener('change', () => {\n        let accepted = true;\n        updateBlockConfig(block, config => {\n          const slots = new Set(normalizeAssistSlots(config.assistSlots));\n          if (input.checked) slots.add(slot);\n          else if (slots.size > 1) slots.delete(slot);\n          else accepted = false;\n          config.assistSlots = [...slots].sort((a, b) => a - b);\n        });\n        if (!accepted) input.checked = true;\n      });\n      grid.append(field(`救援${slot}`, input));\n    }\n    container.append(\n      element('div', { className: 'cardTitle', text: '巡回する救援番号（2件以上で有効）' }),\n      grid,\n      element('div', { className: 'hint', text: '複数選択時はこの順で切替。1件だけなら従来どおり更新ボタンを使用します。' })\n    );\n  }\n\n  function renderBlockConfig(block, container) {",
    'assist slot UI helper',
)

replace_once(
    "        addNumber('最大再試行回数', 'maxAttempts', 1, 100000, 1);\n        container.append(grid);\n        renderCandidates(block, container);",
    "        addNumber('最大再試行回数', 'maxAttempts', 1, 100000, 1);\n        container.append(grid);\n        renderAssistSlots(block, container);\n        renderCandidates(block, container);",
    'assist slot UI',
)

replace_section(
    "  function rankAssistRows(rows, minimumHp = 50) {",
    "\n  function findAssistRowByRaidId",
    "  function eligibleAssistRows(rows, minimumHp = 50) {\n    return [...rows].map(parseAssistRow).filter(item =>\n      Number.isFinite(item.hp)\n      && item.hp >= minimumHp\n      && Number.isInteger(item.currentPeople)\n      && item.currentPeople > 0\n    );\n  }\n\n  function rankAssistRows(rows, minimumHp = 50) {\n    return eligibleAssistRows(rows, minimumHp).sort((a, b) => {\n      if (b.score !== a.score) return b.score - a.score;\n      return a.index - b.index;\n    });\n  }\n",
    'assist eligibility helpers',
)

replace_section(
    "  async function refreshAssistList(config, context, { waitForCompletion = true } = {}) {",
    "\n  function visibleSupporterRows",
    "  async function tapAssistListControl(config, context, { selector, label, waitForCompletion = true }) {\n    const { signal } = context;\n    await waitRandomized(config.baseDelaySec, config.jitterSec, signal);\n    const doc = frameDocument();\n    assertNoUnknownPopup(doc);\n    if (detectScreenState(doc).type !== 'ASSIST_LIST') {\n      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });\n    }\n    const currentDoc = frameDocument();\n    const control = currentDoc.querySelector(selector);\n    const beforeList = currentDoc.querySelector(SELECTORS.assistList);\n    if (!control || !computedVisible(control)) throw new FlowError(`${label}が表示されていません`, 'ASSIST_CONTROL_MISSING', { selector });\n    if (!beforeList) throw new FlowError('救援一覧コンテナが見つかりません', 'ASSIST_LIST_MISSING');\n    const beforeSignature = assistListSignature(beforeList);\n    if (!waitForCompletion) {\n      await jqTapStrict(control, { signal, label });\n      return { tapped: true, waitedForCompletion: false };\n    }\n\n    let sawMutation = false;\n    let sawLoading = false;\n    let loadingEnded = false;\n    let observer = null;\n    try {\n      const observationRoot = beforeList.parentElement || beforeList;\n      observer = new MutationObserver(records => {\n        sawMutation ||= records.some(record =>\n          record.target === observationRoot\n          || record.target === beforeList\n          || beforeList.contains(record.target)\n        );\n      });\n      observer.observe(observationRoot, {\n        subtree: true,\n        childList: true,\n        attributes: true,\n        attributeFilter: ['class', 'style'],\n        characterData: true\n      });\n      const waitPromise = monitorFrame(() => {\n        const docNow = frameDocument();\n        const listNow = docNow.querySelector(SELECTORS.assistList);\n        const loadingVisible = !hiddenOrAbsent(docNow, '#loading') || !hiddenOrAbsent(docNow, '#ready');\n        if (loadingVisible) sawLoading = true;\n        if (sawLoading && !loadingVisible) loadingEnded = true;\n        const reconstructed = Boolean(listNow && listNow !== beforeList);\n        const changedSignature = Boolean(listNow && assistListSignature(listNow) !== beforeSignature);\n        const completed = reconstructed || changedSignature || loadingEnded || sawMutation;\n        if (!completed || !listNow || loadingVisible) return false;\n        return { list: listNow, reconstructed, changedSignature, loadingEnded, sawMutation };\n      }, {\n        signal,\n        timeoutMs: config.timeoutSec * 1000,\n        stableMs: DEFAULT_STABLE_MS,\n        description: `${label}後の救援一覧更新完了待ち`\n      });\n      await jqTapStrict(control, { signal, label });\n      const completion = await waitPromise;\n      return { tapped: true, waitedForCompletion: true, completion };\n    } finally {\n      observer?.disconnect();\n    }\n  }\n\n  async function refreshAssistList(config, context, { waitForCompletion = true } = {}) {\n    return tapAssistListControl(config, context, {\n      selector: SELECTORS.assistRefresh,\n      label: '救援一覧更新',\n      waitForCompletion\n    });\n  }\n\n  async function switchAssistSlot(slot, config, context, { waitForCompletion = true } = {}) {\n    const normalized = int(slot, 0);\n    if (normalized < 1 || normalized > 4) throw new FlowError(`救援番号が不正です: ${slot}`, 'INVALID_ASSIST_SLOT');\n    return tapAssistListControl(config, context, {\n      selector: `${SELECTORS.assistSlot}[data-slot=\"${normalized}\"]`,\n      label: `救援番号${normalized}`,\n      waitForCompletion\n    });\n  }\n\n  function activeAssistSlot(doc = frameDocument()) {\n    const active = doc.querySelector(`${SELECTORS.assistSlot}.active[data-slot]`);\n    const slot = Number.parseInt(active?.dataset.slot || '', 10);\n    return Number.isInteger(slot) ? slot : null;\n  }\n",
    'assist list controls',
)

replace_section(
    "  async function recoverKnownPopup(stateInfo, refreshConfig, context) {",
    "\n  async function pressDeckConfirm",
    "  async function recoverKnownPopup(stateInfo, refreshConfig, context) {\n    if (stateInfo.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();\n    if (!['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(stateInfo.type)) {\n      throw new FlowError(`処理できない画面状態です: ${stateInfo.type}`, 'UNEXPECTED_STATE');\n    }\n    if (stateInfo.type === 'UNCLAIMED_ERROR') {\n      await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['UNCLAIMED_LIST'] });\n      await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);\n      return { retry: true, reason: '未確認バトルを処理しました' };\n    }\n\n    await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['ASSIST_LIST'] });\n    if (stateInfo.type === 'MAX_ASSIST_ERROR') {\n      const doc = frameDocument();\n      const attention = doc.querySelector(SELECTORS.unclaimedAttention);\n      if (attention && computedVisible(attention)) {\n        const waitPromise = waitForGbfState(['UNCLAIMED_LIST'], {\n          signal: context.signal,\n          timeoutMs: refreshConfig.timeoutSec * 1000,\n          description: '通知付き未確認バトル画面待ち'\n        });\n        await jqTapStrict(attention, { signal: context.signal, label: '通知付き未確認バトル' });\n        await waitPromise;\n        const result = await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);\n        return { retry: true, reason: `最大3件エラー後に未確認バトルを${result.processed}件処理しました` };\n      }\n    }\n\n    await refreshAssistList(refreshConfig, context);\n    return { retry: true, reason: stateInfo.type === 'MAX_ASSIST_ERROR' ? '最大3件エラーから再試行' : '参戦人数上限から再試行' };\n  }\n",
    'known popup recovery',
)

replace_section(
    "  async function assistSelectFullFlow(config, context) {",
    "\n  function evaluateWorkflowCondition",
    "  async function assistSelectFullFlow(config, context) {\n    const { signal } = context;\n    const refreshConfig = { baseDelaySec: config.baseDelaySec, jitterSec: config.jitterSec, timeoutSec: config.timeoutSec };\n    const selectedSlots = normalizeAssistSlots(config.assistSlots);\n    const cyclesAssistSlots = selectedSlots.length > 1;\n    let slotCursor = 0;\n\n    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {\n      throwIfAborted(signal);\n      context.setProgress(`${attempt}回目`);\n      const current = detectScreenState();\n      if (current.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();\n      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(current.type)) {\n        await recoverKnownPopup(current, refreshConfig, context);\n        continue;\n      }\n      if (current.type === 'UNCLAIMED_LIST') {\n        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);\n        continue;\n      }\n      if (current.type === 'BATTLE') return { attempts: attempt, alreadyInBattle: true };\n      if (current.type !== 'ASSIST_LIST') {\n        await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });\n      }\n\n      const doc = frameDocument();\n      assertNoUnknownPopup(doc);\n      if (cyclesAssistSlots && !selectedSlots.includes(activeAssistSlot(doc))) {\n        const slot = selectedSlots[slotCursor % selectedSlots.length];\n        slotCursor = (slotCursor + 1) % selectedSlots.length;\n        context.setProgress(`${attempt}回目・救援${slot}へ切替`);\n        await switchAssistSlot(slot, refreshConfig, context);\n        continue;\n      }\n\n      const rows = [...doc.querySelectorAll(SELECTORS.assistRows)];\n      const eligible = eligibleAssistRows(rows, config.minimumHp);\n      if (!eligible.length) {\n        if (cyclesAssistSlots) {\n          const slot = selectedSlots[slotCursor % selectedSlots.length];\n          slotCursor = (slotCursor + 1) % selectedSlots.length;\n          context.setProgress(`${attempt}回目・救援${slot}へ切替`);\n          await switchAssistSlot(slot, refreshConfig, context);\n        } else {\n          await refreshAssistList(refreshConfig, context, { waitForCompletion: false });\n        }\n        continue;\n      }\n\n      const selected = cyclesAssistSlots ? eligible[0] : rankAssistRows(rows, config.minimumHp)[0];\n      const tapped = await tapCurrentAssistRow(selected, context);\n      if (!tapped) continue;\n\n      let next = await waitForGbfState([\n        'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR',\n        'DECK_CONFIRM', 'SUPPORTER', 'UNCLAIMED_LIST', 'BATTLE'\n      ], { signal, timeoutMs: config.timeoutSec * 1000, description: '救援選択後待ち' });\n      if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();\n      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {\n        await recoverKnownPopup(next, refreshConfig, context);\n        continue;\n      }\n      if (next.type === 'UNCLAIMED_LIST') {\n        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);\n        continue;\n      }\n      if (next.type === 'BATTLE') return { attempts: attempt };\n\n      if (next.type === 'SUPPORTER') {\n        const supporterResult = await selectSupporterConditional({\n          timeoutSec: config.timeoutSec,\n          supporterCandidates: config.supporterCandidates\n        }, context);\n        next = supporterResult.next || { type: 'DECK_CONFIRM' };\n        if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();\n        if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {\n          await recoverKnownPopup(next, refreshConfig, context);\n          continue;\n        }\n      }\n\n      if (next.type === 'DECK_CONFIRM' || detectScreenState().type === 'DECK_CONFIRM') {\n        const deckResult = await pressDeckConfirm({\n          timeoutSec: config.timeoutSec,\n          refreshBaseDelaySec: config.baseDelaySec,\n          refreshJitterSec: config.jitterSec\n        }, context);\n        if (deckResult.retry) continue;\n        if (deckResult.battle) return { attempts: attempt };\n      }\n    }\n    throw new FlowError('救援参加の最大再試行回数に達しました', 'ASSIST_MAX_ATTEMPTS');\n  }\n",
    'assist selection flow',
)

path.write_text(source, encoding='utf-8')

tests = Path('tests/autoflow.static.test.mjs')
test_source = tests.read_text(encoding='utf-8')
marker = "test('multiple assist slots cycle while single selection retains refresh behavior'"
if marker not in test_source:
    test_source += """

test('multiple assist slots cycle while single selection retains refresh behavior', () => {
  assert.match(source, /assistSlots: \[1\]/);
  assert.match(source, /function normalizeAssistSlots/);
  assert.match(source, /selectedSlots\.length > 1/);
  assert.match(source, /await switchAssistSlot\(slot, refreshConfig, context\)/);
  assert.match(source, /await refreshAssistList\(refreshConfig, context, \{ waitForCompletion: false \}\)/);
});

test('multi-slot evaluation enters the first eligible row', () => {
  const body = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.match(body, /cyclesAssistSlots \? eligible\[0\] : rankAssistRows/);
  assert.match(body, /activeAssistSlot\(doc\)/);
});

test('max-assist recovery clears notification-backed unclaimed battles', () => {
  assert.ok(source.includes('.btn-unconfirmed-result.flow-unclaimed.attention'));
  const body = source.slice(source.indexOf('async function recoverKnownPopup'), source.indexOf('async function pressDeckConfirm'));
  assert.match(body, /stateInfo\.type === 'MAX_ASSIST_ERROR'/);
  assert.match(body, /SELECTORS\.unclaimedAttention/);
  assert.match(body, /confirmAllUnclaimed/);
});
"""
    tests.write_text(test_source, encoding='utf-8')

for temporary in (
    Path('scripts/patch_assist_slot_cycle.py'),
    Path('.github/workflows/apply-assist-slot-cycle.yml'),
    Path('.github/assist-slot-cycle.trigger'),
):
    temporary.unlink(missing_ok=True)
