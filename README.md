- 音声モード（10語単位で音声回答し、四択中も単語の音声練習を連続して行える）
# English Vocabulary 1–100

GitHub + Vercel で公開できるシンプルな英単語学習アプリです。

## ファイル

- `index.html`：画面
- `style.css`：デザイン・スマホ対応
- `script.js`：学習処理
- `words.json`：銀フレの単語データ
- `kikutan-word.json`：キクタンの単語データ
- `kikutan-pronunciation.json`：キクタンの米音IPAデータ
- `sentences.json`：文章学習モード用の英文・日本語訳（1〜50語）

## 現在の機能

- 教材選択（キクタンが初期選択、銀フレにも切り替え可能）
- 教材ごとの単語範囲選択
- 4択モード
- カードモード
- 学習モード（10語ずつ4択・英語入力で確認し、未習得語を繰り返し出題）
- 音声モード（学習モードと同じ10語単位の進行で、英語回答を音声認識）
- 文章学習モード（1〜50語の英文穴埋め・日本語訳の答え箇所を強調・不正解語を次の周回へ繰り越し）
- PCの学習モード四択画面に、ドラッグ移動できるタイピング練習ポップアップ（正誤履歴つき）
- 単語表示時の自動発音
- カードモードでの米音IPA表示
- 発音ボタン
- 正解・不正解判定
- 結果表示
- 間違えた単語一覧
- 間違えた単語だけ再出題
- 再出題でも間違えた単語だけが次の結果に残る
- ブラウザの `localStorage` を使った学習履歴
- スマートフォン対応

## 注意

単語データは提供された `word1-100` の表記をそのまま使用しています。
そのため `informatiom` も元データどおりです。

キクタンのIPAデータは [open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) の米音データを使用しています。ライセンスと著作権表記は `IPA-DATA-LICENSE.md` を参照してください。

発音はブラウザ標準の Speech Synthesis を使っています。
ブラウザによっては自動発音が制限される場合があるため、その場合は「🔊 発音」ボタンを押してください。

音声モードはブラウザ標準の Speech Recognition を使います。音声認識に対応したブラウザ（Chrome系など）とマイクの使用許可が必要です。

## Vercel公開

1. GitHubで新しいリポジトリを作る
2. `index.html`、`style.css`、`script.js`、`words.json`、`kikutan-word.json`、`kikutan-pronunciation.json`、`sentences.json` をアップロード
3. Vercelで GitHub リポジトリを選択
4. Deploy

`words.json` に今後101–200などを追加し、`script.js` の範囲選択を拡張すれば、同じ形式で増やせます。
