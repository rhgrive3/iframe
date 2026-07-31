# iOS Safari 逐次重くなる問題 — 調査報告

対象: `a.js` (AutoFlow Studio, `APP_VERSION 55` 時点 / `b81482b`)
観測事実: iPad Safari で複数戦を回すと徐々に重くなる。**親ページの完全更新でだけ確実に軽くなる。**

この報告は推測ではなく、(1) コードの参照関係の全数確認、(2) 実ブラウザ (Chromium/Blink) 上で
`a.js` をそのまま動かした計測、の 2 つに基づく。計測スクリプトは `tools/leak-probe.js` として同梱した。

---

## 1. 結論

### 結論 A (確度: 高 / 実測で否定) — 「親 window が旧 iframe を強参照している」は**誤り**

依頼書の必須調査項目 1 (クロージャ / Promise / timer / Observer / Map・Set / baseline / metadata …)
を全数確認し、さらに実ブラウザで 20 戦ぶんの実フロー
(`replaceFrame` → `waitForFrameReady` → `ensureFullAuto` → `jqTapStrict` → `armPendingAutoAttack`
→ `waitForAutoAttack` → `restartWorkflowAfterBattleEnd`) を回して計測した結果、
**親側には戦闘数に比例して増えるものが 1 つしか無い**。

| 計測項目 (20 戦の差分) | 結果 |
|---|---|
| `addEventListener` / `removeEventListener` 累計 | 435 / 435 (**純増 0**) |
| `MutationObserver` 生成 / disconnect | 120 / 120 (**純増 0**) |
| `setInterval` 生成 / clear | 100 / 100 (**純増 0**) |
| `requestAnimationFrame` 発行 / 発火 | 60 / 60 (**未発火 0**) |
| 親 DOM ノード数 / listener 数 / Document 数 | すべて増減なし |
| 追跡した旧 iframe / contentWindow / contentDocument | **21 件中 21 件が GC 済み** |
| JS heap | +160 KB (ノイズ域) |
| **Performance Resource Timing entry** | **+20 (1 戦につき +1、単調増加)** ← 唯一 |

`b81482b`「fix: fully recycle iframe and parent observers」で入った
`frameLifecycleSubscribers` / `cleanupMonitor` / `clearPendingAutoAttack` の後始末は
**すでに正しく効いている**。つまり「iframe 再生成まわりをもっと綺麗にする」方向の追加修正は
効果が無い。ここに時間を使ってはいけない。

### 結論 B (確度: 高 / 実測で再現) — 実在する最有力の欠陥は **child realm の復元不能な多重 prototype patch**

`installBattlePerformanceChildRuntime()` の `patchImageSources()` (a.js:224-243) には
**marker も original 保存も復元処理も無い**。`destroy()` (a.js:291-307) も復元しない。

同一 document へ再注入するたびに `Element.prototype.setAttribute` と
`HTMLImageElement.prototype.src` の setter が**入れ子で積み上がり、永久に外れない**。

実測 (同一 document へ再注入を繰り返し、`setAttribute` を 20,000 回呼んだ所要時間):

| 注入回数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| 所要 ms | 8.1 | 9.2 | 9.8 | 11.2 | 11.4 | 14.0 | 14.1 | 14.9 | **16.0** |

グラブルのバトルは `setAttribute` / `img.src` を毎フレーム大量に呼ぶ。
層が増えるほど**全描画が線形に遅くなる**。しかも
「**その realm を捨てる (= 親ページ完全更新 or iframe の document 破棄) 以外に元へ戻す手段が無い**」。
観測事実 (親更新でだけ軽くなる) と挙動が完全に一致する唯一の実在欠陥。

同型の欠陥がもう 1 つある: `patchSoundObject()` (a.js:152-176) のガードは
runtime インスタンスごとの `patchedSoundObjects = new WeakSet()`。runtime を作り直すと
WeakSet も新品になるため、**RequireJS のモジュールキャッシュ上で生き残っている同じ
`model/sound` オブジェクトを二重に上書きし、`originals` には「すでに潰された関数」が入る**。
`restoreSoundRuntime()` は潰れた関数へ「復元」してしまう。

**production での発火経路** (依頼書の「pagehide だけに依存しているため destroy が漏れるケース」に該当):

```
window.addEventListener('pagehide', destroy, { once: true })   // a.js:318
  ↓ iOS Safari: タブ切替 / アプリのバックグラウンド化 / back-forward cache 入りで pagehide が発火
destroy() → prototype は patch されたまま / window[RUNTIME_KEY] だけ delete
  ↓ pageshow(persisted=true) で「同じ document」が復帰する
setBattlePerformanceEnabled() か次の load で syncBattlePerformanceFrame()
  ↓ win[RUNTIME_KEY] が無いので再注入
bootstrapBattlePerformanceFrameRuntime() → patchImageSources() が 2 層目を積む
```

iPad で他アプリへ切り替える運用なら何度でも踏む。踏むたびに層が増え、親更新まで戻らない。

### 結論 C (確度: 中 / 実機検証が必要) — 残る候補は **WebKit の detached subframe 遅延解放**

結論 A で親側の JS 参照が潔白と分かったので、これが残る。ただし
「Safari だから仕方ない」で終わらせず、`tools/leak-probe.js` の `gcReport()` で
**「戦闘数に比例して alive が単調増加するか」**を実機で確認して切り分けること (第 4 章)。
Blink では 21/21 回収されたので、もし iPad で alive が単調増加するなら
それは JS の参照ではなく WebKit の browsing context 解放タイミングの問題だと確定できる。

---

## 2. 根拠 — 参照経路の全数確認

### 2-1. 親 → 旧 iframe への強参照候補と、その切断箇所

| 参照元 | 保持するもの | 切断箇所 | 判定 |
|---|---|---|---|
| `iframe` (module local, a.js:1189) | 現行 iframe 要素 | `replaceFrame` a.js:3472 で差し替え | OK |
| `window.__AUTO_TEST__.iframe` (a.js:7859) | iframe 要素 | a.js:3478 で更新 | OK |
| `monitorFrame` の `observedDoc` / `observedRoots` / `listenedFrame` | 旧 Document / 旧 Element / iframe 要素 | `cleanupMonitor` a.js:3622-3638、`onFrameLifecycle` a.js:3737-3749 | OK |
| `frameLifecycleSubscribers` (Set) | monitor のクロージャ | `cleanupMonitor` で `delete` a.js:3637 | OK |
| `state.pendingAutoAttack.baseline` | `start`/`dummy`/`cancel` の**旧 Element** | `clearPendingAutoAttack` a.js:5312-5317、`replaceFrame` 先頭 a.js:3452 | OK |
| `performFrameOperation` の `before.doc` (`captureFrameState({includeDocument:true})`) | 旧 Document | `waitForFrameReady` の解決とともにクロージャごと解放 | OK (実測で docs=0) |
| `state.telemetryTimers` (Set) | timer id のみ | `handleFrameLoad` の中で `delete` a.js:3417 / `destroy` a.js:7564 | OK |
| `FlowRestart.details.endState` | プレーンオブジェクトのみ (`detectBattleEndState` a.js:4974-4993) | — | OK |
| `error.block` (a.js:5886) | ワークフロー定義 (DOM 無し) | — | OK |
| `state.logs` | 文字列のみ・`MAX_LOGS=20` で切詰 | a.js:1508 | OK |
| `state.workflowUndo/Redo` | JSON スナップショット・40 件/12 MB で切詰 | `trimWorkflowHistory` a.js:2024 | OK |
| `battleProgressCache` | `WeakMap<Document, …>` | 弱参照 | OK |
| `activeTapTargets` | `WeakSet<Element>` | 弱参照 | OK |
| `tapQueue` (Promise チェーン) | 直前タスクのみ | `queueExclusive` a.js:3816-3820 | OK (下記 2-3 の例外あり) |
| 親から子 document / 子 window への `addEventListener` | — | **そもそも 1 つも無い** (iframe 要素の `load` のみ) | OK |

`runAssistListTransition` (a.js:4638) だけは親から**子 document 上に** `MutationObserver` を張るが、
`finally { observer.disconnect(); }` で必ず外れる。

### 2-2. 親 window に注入されるコードは無い

`.prototype` への代入は a.js 全体で 9 箇所、**すべて
`installBattlePerformanceChildRuntime()` の内部** = `win.Function(...)` で child realm に
注入された側でしか実行されない (a.js:1296-1314)。
親 (top frame) は `if (window.top !== window)` (a.js:328) で弾かれるため
**親の prototype は一切汚染されない**。依頼書の項目 3 「親ページ完全更新でしか prototype が
初期化されないなら最重要原因候補」は、親については該当しない。**child realm については該当する**
(結論 B)。

### 2-3. 副次的に見つかった欠陥

**(a) `nextAnimationFrame` が永久に settle しない経路がある** — a.js:3996-4013

```js
frameId = request(timestamp => { signal?.removeEventListener('abort', onAbort); resolve(timestamp); });
signal?.addEventListener('abort', onAbort, { once: true });
```

`win` は子 window。子 document が破棄されると rAF コールバックは実行されない。
その場合この Promise は永久に未解決になり、

* `signal` (= `startWorkflow` の `context.signal`、**実行中ずっと生きている**) に
  `onAbort` クロージャが残り、そこから **旧子 window / 旧 Element / trajectory** を強参照し続ける。
* `waitForGestureProgress` → `jqTapStrict` → `queueExclusive` が未解決のまま残るので、
  `tapQueue` が**恒久的に詰まり**、以後すべての tap が実行されなくなる。

タップは touchstart〜touchend の間に画面遷移が起きにくいので発火頻度は低いが、
起きると「重い」ではなく「止まる」形で出る。無条件に潰しておくべき。

**(b) 親の Performance Resource Timing が単調増加** — 実測 1 戦 +1 entry

親 document のバッファは既定 250 件。埋まると `resourcetimingbufferfull` 後は記録が止まるので
致命的ではないが、**親の完全更新でしか消えない、実測で唯一の単調増加**なので潰す。

**(c) child runtime の install 中に例外が出ると patch だけ残る** — a.js:309-320

`patchImageSources(); patchRendering(); ensureStyle(); patchNow(); …; window[KEY] = {…}`
の順。`window[KEY]` 代入前に例外が出ると
`bootstrapBattlePerformanceFrameRuntime` の `catch` が握り潰し、
**prototype は patch 済み・runtime キーは未設定**という結論 B と同じ状態になる。

---

## 3. 親ページ完全更新との差分

| リソース・状態 | iframe 交換 (現状) | 親ページ更新 | 実測での増加 |
|---|---|---|---|
| 親 window の JS heap | 維持 | 破棄 | **増えない** (20 戦 +160 KB) |
| 親 window の prototype patch | — | — | **そもそも patch していない** |
| 親側 closure | 維持 | 破棄 | 旧 iframe 参照は **0** |
| 親側 timer | 維持 | 全破棄 | 生成 = 解除、**純増 0** |
| 親側 listener | 維持 | 全破棄 | 追加 = 削除、**純増 0** |
| 親側 MutationObserver | 維持 | 全破棄 | 生成 = disconnect、**純増 0** |
| Shadow DOM | 維持 | 破棄 | 要素数変化なし |
| 親側 Map / Set | 維持 | 破棄 | すべて有界 or WeakMap/WeakSet |
| iframe Window / Document | 交換 | 破棄 | **21/21 GC 済み** |
| **child realm の prototype patch** | **document ごと。ただし同一 document へ再注入されると多重化して永久に残る** | 初期化 | **結論 B** |
| **Performance Resource Timing** | **維持・単調増加** | 初期化 | **1 戦 +1** |
| `history.length` | 変化なし (replace 遷移) | (reload でも維持) | 増えない |
| RequireJS module cache | child は document 依存 / 親は `discardHostRuntimeShell` で 1 回だけ解放 | 初期化 | 1 回きり |
| WebGL / GPU リソース | `WEBGL_lose_context` + canvas 0×0 は実施済み。WebKit 側の実解放は GC 依存 | WebProcess 単位で解放されやすい | **結論 C・実機検証** |

**この差分から導かれる結論**: 「親更新と同等の軽量化」に必要なのは
親 JS 状態の作り直し (案 1 / 案 2) では**ない**。必要なのは
(i) child realm の patch を確実に元へ戻せるようにすること、
(ii) 同一 realm への再注入で層が増えないようにすること、
(iii) 親側で唯一単調増加する Resource Timing を定期的に捨てること。

案 3 (別 origin / 別 top-level) と案 4 (親自己再構築) は、
結論 C が実機で確定した場合にのみ検討する。現時点の証拠では過剰。

---

## 4. 診断方法 (実機 Safari で原因を確定する手順)

`tools/leak-probe.js` を使う。**本番コードとは完全に分離してある**。読み込むだけでは何もせず、
`install()` を呼んだときだけ計測器を取り付け、`uninstall()` で原状復帰する。

### 手順

1. iPad を Mac に繋ぎ、Safari > 開発 > iPad > **親ページ** のコンソールを開く
   (iframe のコンソールではない)。
2. `tools/leak-probe.js` の全文を貼って実行。
3. ```js
   __leakProbe.install();
   __leakProbe.autoTrack();      // iframe が差し替わるたびに WeakRef で追跡
   __leakProbe.mark('before');
   ```
4. ワークフローを **20 戦以上**回す (体感で重くなるまで)。
5. ```js
   __leakProbe.mark('after');
   __leakProbe.diff('before', 'after');   // A. 親側の増加監視
   __leakProbe.gcReport();                // B. 旧 iframe の GC 確認
   __leakProbe.protoReport();             // C. prototype 多重 patch 確認
   ```
6. `__leakProbe.uninstall();`

### 読み方

* **`diff()` で `累計 listenersAdded` と `累計 listenersRemoved` の delta が一致するか。**
  一致しなければ親側 listener リーク (Blink では一致した)。
  `未 disconnect MutationObserver` / `生存 setInterval` / `未発火 rAF` も同様。
* **`gcReport()` の `alive` が戦闘数に比例して単調増加するか。**
  * 増加する → 旧 browsing context が解放されていない。`diff()` が全部 0 なら
    JS 参照ではなく **WebKit の遅延解放 (結論 C)** が確定する。
  * 数件で頭打ち → 正常 (遅延回収)。
  * **限界**: Safari には明示 GC が無いので「alive = リーク」ではない。必ず**傾き**で判断すること。
    確定させるには Web Inspector > Timelines > **JavaScript Allocations** でスナップショットを取り、
    `Document` / `HTMLIFrameElement` の retainer path を見る。
* **`protoReport()`**: `realm: iframe` の行で `native: no` かつ `marker: false` のものが
  復元不能 patch。`推定層` が 2 以上、または**同じ document のまま**
  「バトル軽量化トグルを OFF→ON」した前後で `reinjectDelta()` が
  「NO (差し替わった)」を返すなら、**多重化が実機で起きている**証拠。
* `state.frameLifecycleSubscribers` / `state.cleanup` は `a.js` 側の
  `__AUTO_TEST__.diagnostics()` から取得している (本 PR で追加)。

### 追加で必ず取ってほしいデータ

重くなった状態で、iframe を差し替えずに次を実行:

```js
// 子 realm の patch 層を直接数える (setAttribute の実コスト)
(() => {
  const w = __AUTO_TEST__.iframe.contentWindow, d = w.document, e = d.createElement('div');
  const t = w.performance.now();
  for (let i = 0; i < 20000; i++) e.setAttribute('data-x', String(i));
  return `setAttribute 20k: ${(w.performance.now() - t).toFixed(1)} ms`;
})();
```

起動直後の値と、重くなった後の値を比較する。**倍以上になっていれば結論 B が実機で確定**。

---

## 5. 修正方針

### 最小修正 (本 PR で実施 / 確度の高いものだけ)

1. **child runtime の patch を全部復元可能にする** — `patchImageSources` / `patchRendering` /
   `patchLoadQueue` / `patchSoundObject` の original を保持し、`destroy()` で完全復元。
   これにより「再注入で層が増える」経路が**構造的に消える**。
2. **同一 realm での多重 patch を marker で禁止**。`patchSoundObject` のガードを
   runtime インスタンス依存の WeakSet から**対象オブジェクト上の marker** に変更。
3. **`pagehide` だけに依存しない**。bfcache 復帰 (`pagehide` の `persisted`) では
   `destroy()` ではなく `suspend()` (poll 停止 + patch 復元) にし、`pageshow` で `resume()`。
   本当の破棄は非 persisted の pagehide と親からの明示呼び出しのみ。
4. **install を冪等にし、順序を安全にする** — `window[KEY]` を patch より**先に**確保して、
   途中で例外が出ても「patch 済み・キー無し」状態を作らない。
5. **`nextAnimationFrame` に必ず settle する保険を入れる** — rAF が来ない場合の
   タイムアウト fallback。`tapQueue` の恒久デッドロックと、実行中ずっと生きる
   `context.signal` への listener 滞留を同時に潰す。
6. **親側リセット専用関数 `resetParentRuntimeState()` を新設** —
   `clearPendingAutoAttack` / `telemetryTimers` 一掃 / `blockProgress` 一掃 /
   `performance.clearResourceTimings()` を 1 箇所に集約し、
   メモリ解放ブロック (`gbfReleaseResources`) と N 戦ごとの軽量化で呼ぶ。
7. **`__AUTO_TEST__.diagnostics()`** を追加し、外から観測できない内部 Set のサイズを公開。

### 根本修正 (結論 C が実機で確定した場合のみ)

* **案 1 (Controller soft restart) は不要**と判断する。親側に作り直すべき状態が実測で無い。
* **案 2 (UI / runtime 分離) も現時点では過剰**。
* 結論 C が確定したら **案 3** を優先する。実ゲームを別 top-level document
  (別タブ / `window.open`) に隔離し、親は制御だけを持つ。
  browsing context ごと閉じられるので WebKit が確実に解放する。
* **案 4 (親自己再構築) は最後の手段**。採用するなら
  `sessionStorage` に `state` スナップショットを退避 → `location.reload()` →
  復帰後に自動再開、をユーザー操作なしで成立させること。
  現状の `destroy({restoreHost:true})` は既に `window.location.reload()` を呼ぶ (a.js:7592) が、
  ワークフロー再開はしないので、そのままでは案 4 に使えない。

---

## 6. リスク

| 変更 | リスク | 緩和 |
|---|---|---|
| patch の完全復元 | destroy 後にアセット差し替えが効かなくなる | それが正しい挙動。runtime が生きている間は従来通り |
| `pagehide(persisted)` で suspend | bfcache 復帰後に軽量化が一瞬効かない | `pageshow` で即 resume。`patchNow()` は 100 ms poll でも追従 |
| `patchSoundObject` の marker 化 | 別インスタンスが同じ sound を patch できなくなる | 意図通り。多重化防止が目的 |
| `nextAnimationFrame` の fallback | タップ軌跡の時間分解能がわずかに変わる | fallback は rAF が 250 ms 来なかった場合のみ。通常 16 ms で発火するので実質不変。既存の touch イベント回帰テストで担保 |
| `performance.clearResourceTimings()` | 他ツールの計測を消す | 親ページに他ツールは無い。メモリ解放ブロック実行時のみ |
| `resetParentRuntimeState()` | 実行中フローを壊す | ワークフロー状態・保存設定・UI 状態・undo 履歴には触らない。タップキューと進行中ジェスチャにも触らない |
| `diagnostics()` の追加 | 内部構造の露出 | `__AUTO_TEST__` は既にテスト用に多数公開済み。読み取り専用のサイズのみ |

保存データ (`localStorage` のワークフロー / レガシー設定 / プリセット / チェックポイント) には
一切触れない。iOS Safari 優先で、デスクトップ限定の API は使わない
(`WeakRef` / `FinalizationRegistry` は診断コード側のみ、かつ未対応環境でも動く)。
