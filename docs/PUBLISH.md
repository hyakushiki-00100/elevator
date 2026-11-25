# Rule the Lift — 公開の手順書(14日目)

最終更新: 2026-11-25(説明文を8ステージ版に)。登録と投稿は、あなたのアカウントで行う作業です。
「確信度: 中」と書いた箇所は、画面の項目名などを公式の説明で確かめられていません。実際の画面に合わせて読み替えてください。

---

## 0. 用意するもの(このリポジトリで作れる)

| もの | 作り方 | 置き場所 |
|---|---|---|
| itch.io 用の ZIP(広告なし) | `npm run package` | `out/release/rule-the-lift-itch.zip` |
| CrazyGames 用の ZIP(SDK 版) | `npm run package` | `out/release/rule-the-lift-crazygames.zip` |
| 表紙の画像(CrazyGames 用3枚 1920×1080 / 800×1200 / 800×800、itch.io 用 630×500) | `npm run promo` | `out/promo/cover-*.png` |
| 紹介動画2本(横 1920×1080 / 縦 1080×1620、各18秒、音なし) | `npm run promo` | `out/promo/video-*.mp4` |

- `npm run package` は `zip` コマンドを使います。Windows で `zip` がない場合は、`dist` フォルダの**中身**(`index.html` と `assets`)を選んで「送る → 圧縮フォルダー」で ZIP にしてください。**フォルダごと**圧縮すると `index.html` が一段下になり、itch.io で動きません。
- `npm run promo` は Playwright と ffmpeg が必要です。クラウド環境で作ったものを渡してあるので、手元で作り直す必要は通常ありません。
- 2026-11-22 時点の容量: ZIP は約72KB(CrazyGames の上限 50MB、スマホの上位表示の条件 20MB を十分下回る)。

---

## 1. itch.io で公開する(無料)

公式の説明: https://itch.io/docs/creators/html5

1. itch.io でアカウントを作る(無料)。
2. ダッシュボードで新しいプロジェクトを作る(確信度: 中「Create new project」)。
3. 基本の設定
   - Title: `Rule the Lift`
   - Kind of project: **HTML**
   - Pricing: 無料(寄付なし、または任意の寄付)
4. Uploads: `rule-the-lift-itch.zip` を上げ、「ブラウザで遊ぶファイル」の印を付ける(確信度: 中「This file will be played in the browser」)。
5. Embed options(埋め込みの設定)
   - Viewport dimensions: **960 × 540**(自動検出は失敗することがあるので、手で入れる)
   - 全画面のボタン: 付ける
   - Mobile friendly: 付ける、向きは横(Landscape)
6. 説明文・ジャンル・タグを入れる(下の「8. 説明文の案」)。カバー画像は `cover-itch-630x500.png`(登録欄はページ右側の列の一番上。推奨の大きさは確信度: 中)。生成AIの申告(AI generation disclosure)は Yes、Code・Graphics・Sounds(説明文を案のまま使うなら Text も)。
7. 公開の範囲を「下書き(Draft)」のまま保存し、自分で開いて遊べることを確かめる。
   - 確かめること: 最初の画面が出る/1日を遊べる/カードを置ける/音が鳴る/スマホで横向きにして遊べる
8. 問題なければ「公開(Public)」にする。

---

## 2. CrazyGames に投稿する(Basic Launch)

公式の説明(2026-11-21〜22 に確認): https://docs.crazygames.com/requirements/intro/ ・ technical ・ gameplay ・ game-covers ・ ads

1. CrazyGames の開発者向けの場所(Developer Portal)でアカウントを作る(確信度: 中、URL は developer.crazygames.com と記憶。要確認)。
2. 新しいゲームを投稿する: HTML5 として `rule-the-lift-crazygames.zip` を上げる。
   - Basic Launch では SDK は任意で、広告は無効(収益は出ない)。広告の部分は「広告なし」として動くことを確認済み。
3. 情報を入れる
   - タイトル: `Rule the Lift`
   - 説明文と操作方法(英語が必須。下の案)
   - 対応する向き: 横(Landscape)。向きの指定は投稿の設定でできる(ゲーム側で縦横を固定する必要はない、と公式の説明にある)
4. 表紙の画像3枚と紹介動画2本を上げる(`out/promo/`)。
   - 決まり: 表紙の文字はタイトルだけ。動画は15〜20秒、音なし、最初のコマは表紙(どれも満たしている)
5. Developer Portal の確認の画面(QA ツール)で、実際の CrazyGames の中と同じように動くか確かめる。
   - **特に確かめること**: SDK を後から読み込む作り(公式の例は index.html の head で読み込む)で問題が出ないか/1日の終わりに止まらず結果画面に進めるか/音を消す設定が効くか
6. Basic Launch に申し込む。一定期間、少数のプレイヤーに公開され、数字で正式公開(Full Launch)に進めるかが判断される。

### 正式公開(Full Launch)に進むときに必要になること(今は未対応)
- 開いたらすぐに遊べる(最大1回のクリックまで)。今は最初の画面で開始ボタンを押す。
- 進行状況を CrazyGames のアカウントに結びつける(今は端末内だけ)。
- 広告は SDK 経由のみ(対応済み)。

---

## 3. 公開した後

- 公開した版の共有文字列(`EV1-...`)の意味は変えない。sim の動き・採点・カードの番号・歩く時間・正式な点の日数を変えたら、共有文字列の版を上げる(CLAUDE.md 5.7)。
- CrazyGames の数字(遊ばれた回数、遊んだ時間)を見て、次に何を直すかを決める。

---

## 8. 説明文の案

### 英語(必須)
**Short:** Run the elevators by hand, then automate them with rule cards. Find the most efficient combination and share it.

**Long:**
Passengers walk in, the floors fill up, and the elevators can't keep up.
At first you tap floors to send the car. As the building gets busier, you collect rule cards — "nearest call", "same direction first", "express to the lobby", "low/high zone" — and stack them to automate each elevator.
8 buildings, up to 3 elevators and 10 floors: an office with morning and evening rushes, a department store where everyone comes from the lobby, a hotel with two separate crowds — plus people in a hurry, tour groups and shoppers with luggage that take up more room. No rule wins everywhere.
Earn stars to open new buildings. Score is the average of 20 simulated days, so the best rules really are the best. Share your rule code and anyone can reproduce your score.
No text, no account — just numbers, colors and icons.

**Controls:** Mouse or touch. Tap a floor to send the elevator (with two elevators, tap the elevator first). Drag cards into the slots before the day starts.

### 日本語(itch.io などに添える)
乗客が歩いてやって来て、各階に行列ができていく。最初は階をタップしてエレベーターを動かすけれど、すぐに手が回らなくなる。
集めた「運行ルール」のカード(近い呼び出しへ/同じ方向を優先/空なら急行で1階へ/下層・上層の担当)を並べて、エレベーターを自動で動かそう。
建物は8つ、エレベーターは最大3基・10階建て。朝夕にラッシュがあるオフィス、1日中1階から人が来るデパート、上と下の2つの集団が動くホテル。急いでいる人、団体客、場所を取る荷物持ちもやって来る。建物ごとに人の流れが違い、万能のルールはない。
星を集めると新しい建物が開く。点数は20日分の平均なので、強いルールは本当に強い。ルールを短い文字列で共有すれば、誰でも同じ点数を確かめられる。
文字なし、登録なし。数字と色とアイコンだけで遊べる。
