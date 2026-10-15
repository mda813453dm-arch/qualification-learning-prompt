# チャット画面で動作確認するための手順

作成：2026年10月15日｜Claude

AIアプリのチャット画面（iPhone アプリを含む）から学習エンジンを使えるようにする手順です。
**運営者が A を一度行えば、学習者はプロンプトを貼るだけで使えます**（GPT の作成やコネクタの登録は不要。仕組みは `../83_プロンプトだけで使う方式.md`）。

- この手順を実行すると、学習エンジンと分解サーバーが Google Cloud（東京）に置かれ、インターネットから呼べる状態になります（＝公開）。
- 呼び出しにはトークンが必要なので、トークンを知らない人は使えません。トークンはチャットに貼らないでください。
- 費用：試すだけなら無料枠の範囲で、ほぼ0円の見込みです（無料トライアルのクレジット内）。

---

## A. Google Cloud に配置する（20分ほど。待ち時間がほとんど）

1. ブラウザ（iPhone の Safari でも可）で https://shell.cloud.google.com/ を開き、Google アカウントでログインする。
   画面下に黒い画面（Cloud Shell）が出ます。
2. 画面上部でプロジェクトを選ぶ（無料トライアル登録時に作られた「My First Project」などで構いません）。
   黒い画面の行頭に `(プロジェクト名)` が出ていれば選べています。出ていなければ、次を実行します（`プロジェクトID` は画面上部のプロジェクト選択で確認できます）。
   ```
   gcloud config set project プロジェクトID
   ```
3. 次の3行を黒い画面に貼り付けて Enter（「承認しますか」と出たら「承認」を押す）。
   ```
   git clone -b ai-learning-system https://github.com/mda813453dm-arch/qualification-learning-prompt.git
   cd qualification-learning-prompt
   bash 新システム開発/deploy/cloudshell-deploy.sh
   ```
4. 最後に「完了しました。」と表示されたら成功です。表示された次の2つを使います。
   - **GPTに貼るAPI定義**：`cloudshell edit ~/qlp-openapi.yaml` を実行するとファイルが開くので、全文をコピーする。
   - **トークン**：`gcloud secrets versions access latest --secret=qlp-api-token; echo` を実行すると表示される英数字の列。

途中で止まったときは、表示されたエラーの文面（トークン以外）をこのスレッドに貼ってください。何度実行し直しても問題ありません。

## A-2. 学習者として試す（ChatGPT・Claude・Perplexity 共通）

1. Cloud Shell で `cat ~/qlp-start-prompt.txt` を実行し、表示された文（入口URL入り。トークンは入っていません）をコピーする。
2. ChatGPT・Claude・Perplexity の新しいチャットに貼って送る。資格の一覧が出たら、番号で答えて進める。
3. 途中で出る「続きから始めるURL」を控えておき、別の新しいチャットで、プロンプトの下にそのURLを貼って送る。記録が表示され、再開を選べれば成功です。

### 確かめてほしいこと

1. AIがページを開き、資格の一覧 → 試験概要 → （宅建は免除）→ 学習状況 → 学習計画 → 開始の確認 → 学習方法 の順に進むか
2. 番号で答えたとき、AIが次のページを開いて進むか（「開けません」と言われたら、その画面のスクリーンショットを送ってください）
3. 実践問題で問題文・選択肢・公式PDFのリンクが出るか、測量士補は図が画像で出るか
4. 答えると正誤と正答が出て、そのあとAIの解説が出るか
5. 別の新しいチャットで最初から始めたとき、違う引継ぎIDが出るか
6. 続きから始めるURLで、記録の表示 → 再開ができるか

---

以下の B〜B-3 は、GPT やコネクタで使う場合の手順です（運営者の確認用。学習者には不要）。

## B. ChatGPT に「資格学習」の GPT を作る（10分ほど）

GPT の作成には ChatGPT の有料プラン（Plus など）が必要です。作った GPT は iPhone アプリからも使えます。

1. パソコンのブラウザで https://chatgpt.com/gpts/editor を開き、「構成（Configure）」タブを選ぶ。
2. 次のとおり入力する。
   - **名前**：資格学習（テスト）
   - **指示（Instructions）**：Cloud Shell で `cloudshell edit ~/qualification-learning-prompt/新システム開発/deploy/gpt-instructions.txt` を実行して開き、全文をコピーして貼る（このスレッドに添付したファイルと同じ内容です）
   - **機能**：「ウェブ検索」をオンにする（公式PDFのURLを探すため）
3. 下の「アクションを作成する（Create new action）」を押す。
   - **認証（Authentication）**：「APIキー」を選び、キーに A-4 のトークンを貼り、認証タイプは「Bearer」を選んで保存。
   - **スキーマ（Schema）**：A-4 でコピーした API 定義を全文貼る。下に操作が6つ（startSession など）並べば成功です。
4. 右上の「作成（Create）」→ 公開範囲は「自分だけ（Only me）」で保存する。

## B-2. Claude で使う（カスタムコネクタ）

Claude は無料プランでもカスタムコネクタを1つ登録できます。登録は claude.ai の画面で行い、登録後はスマホの Claude アプリでも使える見込みです（スマホでの動作は未確認）。

1. Cloud Shell で、A-4 の最後に表示された「Claude・Perplexity に登録するURL」のコマンドを実行し、表示されたURLをコピーする。
2. https://claude.ai/settings/connectors を開き、「カスタムコネクタを追加」を押す。
3. 名前に「資格学習」、URL に 1 のURLを貼り、認証は「サインインなし（No sign in）」を選んで追加する。
4. 新しいチャットで、入力欄の「＋」からコネクタ「資格学習」がオンになっていることを確かめ、C のように話しかける。
   プロンプトはコネクタから自動で渡るので、貼る必要はありません。

## B-3. Perplexity で使う

Perplexity の有料プランには、カスタムコネクタ（同じ MCP のURLを登録する機能）があります。ただし利用者の報告では、つながらない例や、必要なプランが変わった例があり、安定していません。Claude で動くことを確かめてから試すのがおすすめです。手順は B-2 と同じURLを、Perplexity の設定のコネクタ画面に登録します（認証は「なし」）。

## Gemini について

Gemini にもカスタムアプリ（MCP）を登録する機能がありますが、2026年10月時点の公式ヘルプでは「米国在住・18歳以上・英語のみ」で、日本からは使えません。日本で使えるようになったら、同じURLで登録できる作りにしてあります。

## C. 試してみる

GPT を開いて、まずは次のように話しかけてください（公式PDFの URL は確認済みのものです）。

- 宅建（文字だけの問題、取り込みは数秒）
  > 宅建の勉強をしたいです。過去問は令和7年度（2025年）の公式PDF https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf を使ってください。
- 測量士補（図のある問題、取り込みに1分ほど）
  > 測量士補の勉強をしたいです。過去問は2026年度の問題PDF https://www.gsi.go.jp/common/000278974.pdf と正答PDF https://www.gsi.go.jp/common/000278975.pdf を使ってください。

### 確かめてほしいこと

1. 導入の6段階（試験概要 → 免除 → 学習状況 → 学習計画 → 開始の確認 → 学習方法）の順に進むか
2. 実践問題で、問題文・図・選択肢・公式PDFのリンクが全部出るか（測量士補は図が画像で出るか、OCRの注意書きが出るか）
3. 番号で答えると、正誤と正答・正答PDFのリンクが出るか
4. 「次」と言うと次の問題に進むか。答える前に「次」と言ったら同じ問題が出るか
5. 「引継ぎデータを出して」で引継ぎデータが出て、新しいチャットに貼ると続きから再開できるか
6. 測量士補の最初の取り込みで、待ちきれずにエラーにならないか（分かっている課題）

結果は、うまくいかなかった画面のスクリーンショットをこのスレッドに貼っていただければ、こちらで原因を調べます。

## 止めるとき・消すとき

- 使わなければ費用はほぼかかりません（保管料の数円〜数十円のみ）。
- 完全に消すときは Cloud Shell で次を実行します。
  ```
  gcloud scheduler jobs delete qlp-warm --location asia-northeast1
  gcloud run services delete qlp-engine --region asia-northeast1
  gcloud run services delete qlp-parser --region asia-northeast1
  ```

## プログラムを更新したとき

Cloud Shell で次を実行すると、最新のプログラムに置き換わります（トークンは変わりません）。
```
cd ~/qualification-learning-prompt && git pull && bash 新システム開発/deploy/cloudshell-deploy.sh
```
