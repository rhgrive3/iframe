# iOS Safari 逐次重くなる問題 — 調査報告

対象: `a.js` (AutoFlow Studio)。調査開始時 `APP_VERSION 55` / `b81482b`、修正後 `APP_VERSION 57`。
観測事実: iPad Safari で複数戦を回すと徐々に重くなる。**親ページの完全更新でだけ確実に軽くなる。**

この報告は推測ではなく、(1) コードの参照関係の全数確認、(2) 実ブラウザ上で `a.js` をそのまま
動かした計測、(3) iPad 実機での計測、の 3 つに基づく。計測スクリプトは `tools/leak-probe.js` として同梱した。

**要約: 真因は「バトル軽量化ランタイムが `win.Function()` の CSP 拒否で一度も注入されておらず、
軽量化ゼロのままバトルを回していた」こと。** 親側の参照リークは実機・ローカルとも存在しない (結論 A)。

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

### 結論 B — **実機で否定。真因は「軽量化ランタイムが一度も注入されていなかった」こと**

当初 B として挙げた「child realm の多重 prototype patch」は iPad 実機の計測で否定された。
実機の `protoReport()` は次を示した。

| 対象 (iframe realm) | 実機の結果 |
|---|---|
| `HTMLImageElement.prototype.src` | **native (未 patch)** |
| `Element.prototype.setAttribute` | **native (未 patch)** |
| `WebGL(2)RenderingContext.prototype.drawArrays / drawElements` | **native (未 patch)** |
| `__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__` | **未インストール (親・子とも)** |

`patchImageSources()` と `patchRendering()` はトグルの ON/OFF に関係なく install 時に必ず走る。
それが native のままということは、**そもそも runtime が一度も実行されていない**。
多重化以前に patch が 1 つも当たっていなかった。

つまり **バトルの重量級描画・アセット読込・音声を潰す機能が丸ごと無効の状態で、
フルスペックのグラブルのバトルを iframe で回していた**。3〜6 戦で Safari が落ちるのはこれで説明が付く。

実機で非 native だった `CanvasRenderingContext2D.prototype.drawImage` と
`createjs.LoadQueue.prototype.loadManifest / loadFile` は、親・子で同一の難読化コード
(`function(e,t,i,o,r,u,d,a,c){if(n.isUndefined(a)...`) であり **グラブル自身の実装**。AutoFlow の patch ではない。

#### 原因: `win.Function()` が Content-Security-Policy に弾かれていた

旧 `bootstrapBattlePerformanceFrameRuntime()` はランタイムを**ソース文字列として iframe へ運び、
子 realm の `win.Function()` でコンパイル**していた。`Function` コンストラクタは
「文字列を JS として評価」する API なので、`script-src` に `'unsafe-eval'` が無い document では
`EvalError` になる。その例外は `catch { return null; }` に飲まれ、**完全に無音**だった。

a.js 本体はブックマークレット / Web Inspector から注入されるため CSP の対象外で普通に動く。
結果として「本体は動くのに軽量化だけ死ぬ」という気付きにくい形になっていた。

**ローカルで完全再現した** (`script-src 'self' 'unsafe-inline'` を iframe の document にだけ付与):

| | 旧コード + CSP | iPad 実機 | 新コード + CSP |
|---|---|---|---|
| `runtimeKey` | false | **未インストール** | **true** |
| `HTMLImageElement.prototype.src` | native | **native** | patch 済 |
| `Element.prototype.setAttribute` | native | **native** | patch 済 |
| WebGL drawArrays / drawElements | native | **native** | patch 済 |
| `createjs.LoadQueue.*` | 非 native (ゲーム自身) | **非 native** | 非 native |
| バトル canvas | **visible** | — | **hidden** |
| 軽量化スタイル | 入らない | — | 入る |

実機のスクリーンショットと「旧コード + CSP」の結果が完全に一致する。

#### 修正: eval を捨て、同一オリジンのフレームを親から直接駆動する

iframe は同一オリジンなので、親から `win.HTMLImageElement.prototype` /
`win.CanvasRenderingContext2D.prototype` / `win.createjs` / `win.document.head` を**直接**触れる。
コンパイル工程が無いので CSP が拒否する対象が存在しない。

* `installBattlePerformanceChildRuntime()` → `installBattlePerformanceRuntime(win)`。
  内部の `window` / `document` / `location` はすべて `win` / `doc` / `loc` に置換。
* 親からの注入と `window.top !== window` での自己注入が**同一のコードパス**になった。
* 失敗は二度と無音にしない。`state.battlePerformanceFailure` に理由を記録し、
  `appendLog(..., 'error')` でログパネルに 1 回だけ出す。
  `__AUTO_TEST__.diagnostics()` の `battlePerformanceInstalled` / `battlePerformanceFailure` からも読める。

#### 当初 B として入れた修正の扱い

多重 patch は真因ではなかったが、`destroy()` での完全復元・marker による冪等化・
bfcache での suspend / resume は、**親が patch を当てる構成になったことでむしろ必須**になった
(親は生き続けるので、フレーム破棄時に確実に元へ戻す必要がある)。そのまま残す。

<details>
<summary>参考: 否定された当初の結論 B (多重 prototype patch)</summary>

同一 document へ再注入するたびに wrapper が積み上がり、`setAttribute` 20,000 回の所要が
8.1 → 16.0 ms (9 層) に増えることをローカルで実測した。機構としては実在するが、
実機では runtime 自体が注入されていなかったため発火していなかった。

</details>


### 結論 B-2 (実機報告 → 実測で再現) — 軽量化を ON にするとゲームが停止する

B の修正でランタイムが実際に注入されるようになった結果、今度は
「軽量化 ON でゲームが動かない」という症状が出た。原因は 2 つ。

#### (1) ホットパスで毎回 `document.querySelector` していた

```js
const isBattleRuntime = () => isBattleLocation() || Boolean(doc.querySelector('.cnt-raid-stage'));
const shouldReplaceAsset = value => { if (!enabled || !isBattleRuntime()) return false; ... };
const battleCanvas = canvas => Boolean(enabled && isBattleRuntime() && ... canvas.closest?.('.cnt-raid-stage'));
```

`battleCanvas()` は **`drawImage` のたび**、`shouldReplaceAsset()` は **`img.src` 代入のたび**に呼ばれる。
非 raid URL では `isBattleLocation()` が false になるので、**呼び出しごとに全 document 走査**が走っていた。
グラブルのバトルは 1 フレームに数千回 `drawImage` を呼ぶ。

2500 要素の document で実測:

| ホットパス | 修正前 | 修正後 |
|---|---|---|
| `drawImage` × 20,000 | **1140 ms** | **55.8 ms** (約 20 倍) |
| `img.src` × 5,000 | **277.1 ms** | **9.8 ms** (約 28 倍) |

1 フレーム分の描画に 1 秒以上かかっていた。DOM が大きいほど悪化するので実機ではさらに重い。

修正: 判定を 100 ms のポーリング時にだけ計算して `battleRuntimeActive` (boolean) に保持し、
ホットパスはその boolean だけを読む。canvas ごとの祖先walk (`closest`) も
`WeakMap` + 世代番号でキャッシュする。

#### (2) ゲームの読込パイプラインに嘘をつく処理が既定で有効だった

`patchLoadQueue()` / `patchImageSources()` は CJS 画像・背景・敵画像を 1×1 の透明 GIF に差し替え、
`patchSoundObject()` は音声モジュールの `loadBGM` などを解決済み Deferred に、`playSE` などを
`undefined` を返す関数に置き換える。**メモリ削減の本体はここだが、ゲーム側の前提を壊しうるのもここ**
(1×1 画像に対するスプライトシートのフレーム計算、戻り値の型を前提にしたチェーン)。

修正: 設定を 2 段階に分離した。

| 段階 | 内容 | 既定 |
|---|---|---|
| **バトル軽量化・高速化** | CSS 抑止 (canvas 非表示・背景画像除去・演出短縮) + バトル canvas への描画コール停止 + `Game.setting.sound_flag` / `createjs.Sound.setMute` によるミュート。**ゲームの読込処理には触れない** | ON にできる |
| **アセット差し替え (強力・実験的)** | 画像の透明 GIF 置換 + 音声モジュールのメソッド置換 | **OFF** |

上段だけでも WebGL / Canvas への描画とテクスチャ更新は止まるので、GPU 側の負荷は大きく下がる。
下段は「バトルが進まなくなったら OFF」と UI に明記した。

また OFF に戻したときに `restoreAllPatches()` を通すようにして、
**スイッチを切れば prototype が完全に素の状態へ戻る** ようにした
(以前は `enabled=false` の素通し wrapper が残り続けていた)。

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
| **child realm の prototype patch** | **旧: CSP で注入自体が失敗し軽量化ゼロ。新: 親から直接 patch し、フレーム破棄時に完全復元** | 初期化 | **結論 B** |
| **Performance Resource Timing** | **維持・単調増加** | 初期化 | **1 戦 +1** |
| `history.length` | **単調増加**。iframe 内のゲーム側遷移が親のセッション履歴を押す | (reload でも維持) | **実機で 4 戦 +20** |
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
