# iframe autoclicker

`a.js` is the Safari-ready distribution script.

The controller supports click actions, URL navigation, condition waits, touch recording, presets, timing jitter, and positional jitter.

## 実行中の安全装置

- **認証（画像認証）画面**: サーバー要求で `#pop-c-a-i` の認証ポップアップが出た時点で実行中のワークフロー／旧マクロを即時停止する。停止したまま30秒放置されると、親ページを `https://www.google.com/` へ強制的に移動する。30秒以内に認証が閉じられるか、実行を再開すれば離脱はしない。
- **エラー時のやり直し**: ブロック実行がエラーになった場合はワークフローの先頭から自動でやり直す。直前と同じ失敗（コード・ブロック・メッセージが一致）を連続で繰り返した場合のみ、従来どおりエラー表示を出して停止する。
