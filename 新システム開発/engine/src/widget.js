/**
 * ChatGPT アプリ（MCP Apps / Apps SDK）の問題画面。
 * 問題文・図・選択肢は、エンジンが返した内容（structuredContent）だけでこの画面が描く。AIは中身を書き換えたり、別の図を足したりできない。
 * 回答の採点・次の問題もこの画面からエンジンを呼ぶ。解説だけをAIに頼む（「解説して」とチャットに送る）。
 */
export const WIDGET_URI = 'ui://qlp/question-v149.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';
export const WIDGET_VERSION = '2026-10-31.149';

/** 追加料金ゼロで待機を避けるための監修対象・固定基礎教材。AI生成や公式過去問と混同しない。 */
export const PREPARED_LESSONS = {
  "基礎法学": {
    "intro": [
      "法は社会生活の権利・義務や手続を定めるルールです。まず「誰に、どのような要件で、どんな効果が生じるか」の順に読みます。",
      "法規範には憲法・法律・政令・省令・条例などがあり、法令同士の上下関係と制定主体を区別します。憲法は国の最高法規です。",
      "実体法は権利義務の内容を、手続法はその権利を実現・争うための手続を扱います。行政法や民法の問題でも、この区別が役立ちます。",
      "条文を解釈するときは文言だけでなく、他の規定とのつながりや制度の目的を確認します。"
    ],
    "example": "例：契約により代金支払義務が生じるかは実体法上の問題で、裁判でその請求をどう主張するかは手続法上の問題です。",
    "pitfall": "「公法／私法」と「実体法／手続法」は別々の分類軸です。民法と民事訴訟法、行政実体法と行政争訟制度を混同しないようにします。",
    "questions": [
      {
        "question": "次のうち、権利義務の内容と、その権利を裁判で実現する手続の関係について、最も適切なのはどれか。",
        "choices": [
          "実体法は権利義務の内容を扱い、手続法は裁判などの手続を扱う。",
          "実体法と手続法は全く同じ意味である。",
          "手続法は権利義務の内容だけを定め、実体法は裁判の方式だけを定める。"
        ],
        "correctAnswer": 1,
        "explanation": "実体法は権利・義務の発生や内容を定め、手続法はそれを実現するための手続を定めます。両者は同じものではなく、役割が異なります。"
      },
      {
        "question": "日本の法規範の基本的な位置づけについて、正しいものはどれか。",
        "choices": [
          "政令は憲法に優先する。",
          "憲法は国の最高法規であり、法律・命令などはこれに反してはならない。",
          "省令は法律の上位にある。"
        ],
        "correctAnswer": 2,
        "explanation": "日本国憲法98条1項は憲法の最高法規性を定めます。法律・政令・省令などは憲法に反することができません。"
      },
      {
        "question": "条文の解釈として、最も適切な学習の進め方はどれか。",
        "choices": [
          "単語を暗記し、制度の目的や前後の条文は見ない。",
          "条文の趣旨を無視し、語感だけで結論を決める。",
          "文言、関連条文との関係、制度の目的を確認して解釈する。"
        ],
        "correctAnswer": 3,
        "explanation": "法解釈では文言を出発点とし、体系や制度目的も確認します。単語だけの暗記や語感だけの判断は事例問題で誤答につながります。"
      }
    ]
  },
  "憲法": {
    "intro": [
      "憲法は基本的人権の保障と国の統治の仕組みを定めます。出題は「人権」と「統治」を分けて整理すると理解しやすくなります。",
      "人権分野では表現の自由・経済的自由・平等・社会権などを、制約が許される条件や判例の考え方とともに学びます。",
      "統治分野では国会・内閣・裁判所の権限、地方自治、違憲審査の役割を整理します。"
    ],
    "example": "例：ある規制が表現の自由を制約するときは、規制目的と手段の関係、関連する判例の判断枠組みを区別して検討します。",
    "pitfall": "条文の原則と例外、判例の結論とその理由を取り違えないことが大切です。",
    "questions": [
      {
        "question": "日本国憲法の学習分野の大きな区分として、最も適切な組合せはどれか。",
        "choices": [
          "民事執行と商業登記",
          "基本的人権と統治機構",
          "不法行為と売買契約"
        ],
        "correctAnswer": 2,
        "explanation": "憲法では基本的人権の保障と、国会・内閣・裁判所などの統治機構を中心に学習します。他の選択肢は主に別分野の内容です。"
      },
      {
        "question": "日本国憲法のもとで、法律を制定する国の機関はどれか。",
        "choices": [
          "国会",
          "内閣だけ",
          "最高裁判所だけ"
        ],
        "correctAnswer": 1,
        "explanation": "日本国憲法41条は国会を国の唯一の立法機関と定めています。内閣は行政を担い、裁判所は司法権を担います。"
      },
      {
        "question": "違憲審査の意味として、最も適切なものはどれか。",
        "choices": [
          "行政機関が税額を算定すること",
          "国会が必ず新法を作ること",
          "法令等が憲法に適合するかを裁判所が審査すること"
        ],
        "correctAnswer": 3,
        "explanation": "日本国憲法81条は最高裁判所に違憲審査権を認めています。日本では具体的な争訟の中で憲法適合性が争われます。"
      }
    ]
  },
  "行政法": {
    "intro": [
      "行政法は、国や地方公共団体が行政活動を行う際の根拠・手続・救済を扱います。まず「行政が何をしたか」と「争う方法」を分けます。",
      "行政手続法の申請に対する処分、不利益処分、行政指導は同じではありません。相手方への法的効果や義務付けの有無を確認します。",
      "行政に不服がある場合は、行政不服審査法による審査請求と、行政事件訴訟法による訴訟の違いを整理します。"
    ],
    "example": "例：許可申請を認めない処分と、担当者による任意の行政指導では、処分性や用いる救済手段が異なる場合があります。",
    "pitfall": "行政指導を直ちに行政処分と同一視しないこと。制度や救済については適用法令と個別の要件を確認します。",
    "questions": [
      {
        "question": "行政指導と行政処分を区別する際、重要な観点として正しいものはどれか。",
        "choices": [
          "行為の名称に「行政」が付くかだけで判断する。",
          "相手方に対する法的効果や行為の性質を確認する。",
          "行政庁の担当者が口頭で話したかだけで判断する。"
        ],
        "correctAnswer": 2,
        "explanation": "処分性の判断では名称や口頭・文書の形式だけではなく、公権力の行使として相手方の法的地位にどう影響するかなどを検討します。"
      },
      {
        "question": "行政不服審査法に基づく一般的な不服申立てとして正しいものはどれか。",
        "choices": [
          "審査請求",
          "起訴",
          "株主代表訴訟"
        ],
        "correctAnswer": 1,
        "explanation": "行政不服審査法では審査請求が基本的な不服申立ての手段です。起訴は刑事手続、株主代表訴訟は会社法上の制度です。"
      },
      {
        "question": "行政手続法の学習で区別すべき概念として、最も適切な組合せはどれか。",
        "choices": [
          "売買と贈与と相続",
          "株主総会と取締役会と代表取締役",
          "申請に対する処分と不利益処分と行政指導"
        ],
        "correctAnswer": 3,
        "explanation": "行政手続法の重要な基本区分は申請に対する処分・不利益処分・行政指導です。それぞれ適用される手続や趣旨が異なります。"
      }
    ]
  },
  "民法": {
    "intro": [
      "民法は私人間の権利義務を扱います。基本は「当事者・意思表示・契約・権利の移転・義務違反」を順番に考えることです。",
      "総則では意思表示・代理・時効を、債権分野では契約・債務不履行・不法行為を扱います。物権や相続も独立して整理します。",
      "事例問題は誰が誰に何を請求できるかを最初に書き出すと解きやすくなります。"
    ],
    "example": "例：売買契約では売主と買主が何を約束したか、代金支払や目的物引渡しが履行されたか、問題になった行為は誰の行為かを整理します。",
    "pitfall": "契約上の責任と不法行為責任、代理権のある代理と無権代理を混同しないようにします。",
    "questions": [
      {
        "question": "民法の売買契約について、最も適切な説明はどれか。",
        "choices": [
          "売主と買主の合意により成立する諾成契約である。",
          "書面を作らない限り売買契約は絶対に成立しない。",
          "相続が開始しなければ売買契約は成立しない。"
        ],
        "correctAnswer": 1,
        "explanation": "民法555条の売買は、一方が財産権の移転を約し、相手方が代金の支払を約する合意によって成立する諾成契約です。"
      },
      {
        "question": "代理権のない者が本人の代理人と称して契約した場合の検討として、最も適切なのはどれか。",
        "choices": [
          "代理権がなくても常に本人が当然に拘束される。",
          "本人の追認や表見代理などの要件を確認する。",
          "代理行為は刑法だけで判断する。"
        ],
        "correctAnswer": 2,
        "explanation": "無権代理は原則として本人に効力を生じず、追認や表見代理等が問題になります。代理権の有無と例外の要件が重要です。"
      },
      {
        "question": "債務不履行と不法行為の関係として、最も適切なものはどれか。",
        "choices": [
          "両者は常に同じ要件である。",
          "不法行為は相続のときだけ問題になる。",
          "債務不履行は既存の債務違反、不法行為は一般的な権利侵害等を中心に考える。"
        ],
        "correctAnswer": 3,
        "explanation": "債務不履行責任は債務の履行を前提とし、不法行為責任は故意・過失による権利等の侵害を中心に要件を検討します。"
      }
    ]
  },
  "商法・会社法": {
    "intro": [
      "商法では商人・商行為などの商取引のルールを学びます。会社法では法人としての会社の仕組み、会社の機関、株式、役員の責任を整理します。",
      "株式会社の基本機関として、株主総会と取締役を区別します。会社の形態や機関設計により取締役会等の要否は異なります。",
      "株主、会社、取締役、代表取締役の権限や責任をそれぞれ別に考えることが得点につながります。"
    ],
    "example": "例：株主が議決権を行使する場面と、取締役が業務を執行する場面では、意思決定を行う主体が異なります。",
    "pitfall": "株主総会・取締役会・代表取締役を同一のものとして扱わないこと。機関設計による違いにも注意します。",
    "questions": [
      {
        "question": "株式会社の株主について、正しいものはどれか。",
        "choices": [
          "株主は原則として出資額を超えて会社の債務を直接弁済する義務を負う。",
          "株主の責任は原則として引き受けた株式の引受価額を限度とする。",
          "株主は全員が必ず代表取締役になる。"
        ],
        "correctAnswer": 2,
        "explanation": "会社法104条により株主の責任は、原則としてその有する株式の引受価額を限度とします。株主であることだけで代表取締役にはなりません。"
      },
      {
        "question": "株主総会と取締役の役割の説明として、最も適切なものはどれか。",
        "choices": [
          "株主総会は法令・定款で定める事項などについて決議し、取締役は職務を執行する。",
          "株主総会と取締役は法律上必ず同じ人物を指す。",
          "取締役は株主総会の決議に一切関係しない。"
        ],
        "correctAnswer": 1,
        "explanation": "株主総会は株主の意思決定機関で、取締役は会社の業務執行などを担います。具体的な権限は会社法と機関設計に従います。"
      },
      {
        "question": "株式会社の代表取締役について正しい説明はどれか。",
        "choices": [
          "代表取締役は国の立法機関である。",
          "代表取締役は会社の債務をすべて個人で無条件に負担する。",
          "代表取締役は会社を代表する権限を持つ役員である。"
        ],
        "correctAnswer": 3,
        "explanation": "代表取締役は株式会社を代表し、その業務に関する裁判上・裁判外の行為をする権限を有します。"
      }
    ]
  },
  "基礎知識": {
    "intro": [
      "行政書士試験の基礎知識では、行政書士法等の諸法令、情報通信・個人情報保護、文章理解、一般知識などを扱います。",
      "知識を暗記するだけでなく、用語の意味を理解し、文章の主張・根拠・結論を分けることが重要です。",
      "情報通信分野では情報の安全な取扱いや個人情報の保護の基本原則を、文章理解では接続語や指示語を根拠に読みます。"
    ],
    "example": "例：文章理解で「しかし」が出たら、その後に著者の対比や主張が置かれていないか確認します。",
    "pitfall": "最新の制度・時事情報は受験年度の公的資料で必ず確認し、過去の知識をそのまま当てはめないようにします。",
    "questions": [
      {
        "question": "文章理解の問題で、筆者の主張を把握する方法として最も適切なのはどれか。",
        "choices": [
          "各段落の主張と根拠、接続語のつながりを確認する。",
          "本文を読まず、選択肢の長さだけで正答を決める。",
          "「しかし」などの対比表現をすべて無視する。"
        ],
        "correctAnswer": 1,
        "explanation": "文章理解では段落同士の論理関係と主張・根拠をつかみます。接続語は対比や因果の手掛かりです。"
      },
      {
        "question": "個人情報の取扱いについて、基本的な考え方として適切なのはどれか。",
        "choices": [
          "取得した個人情報は目的に関係なく自由に公開してよい。",
          "利用目的や安全管理などの規律を確認して扱う。",
          "個人情報は紙で保存すると法的規律を受けなくなる。"
        ],
        "correctAnswer": 2,
        "explanation": "個人情報の保護では利用目的や安全管理措置などが重要です。媒体が紙か電子かだけで規律がなくなるわけではありません。"
      },
      {
        "question": "試験範囲に時事的・制度改正の内容が含まれる場合、適切な学習方法はどれか。",
        "choices": [
          "古い記事の記載だけを必ず正解とする。",
          "制度名が同じなら変更点の確認は不要である。",
          "受験年度の公的資料などで改正状況を確認する。"
        ],
        "correctAnswer": 3,
        "explanation": "法制度や情報通信分野は改正・更新があります。受験年度の公式・公的資料で正確な内容を確認する必要があります。"
      }
    ]
  }
};

/** 画面の HTML。 */
export function widgetHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--sub:#555;--line:#ddd;--bg:#fff;--ok:#0a7d32;--ng:#c62828;--btn:#f4f4f4;--acc:#1557b0;--accbg:#eaf2fd}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--sub:#aaa;--line:#444;--bg:#1e1e1e;--btn:#2a2a2a;--acc:#8ab4f8;--accbg:#22304a;--ok:#79e6a0;--ng:#ff9696}}
body{margin:0;font:16px/1.7 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg)}
#app{padding:12px 14px;min-height:120px;box-sizing:border-box}
/* 二重縦スクロールを避ける: iframeの内容は自然高さ、ChatGPT側が縦方向にスクロールする。
   iframeへの高さ通知はfit()/ResizeObserverが担当し、内容に上限を設けない。 */
#app.study-viewport{height:auto;max-height:none;overflow:visible;overscroll-behavior:auto;scroll-behavior:auto;scroll-padding-top:0;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}
html,body{height:auto;min-height:0;overflow:visible}
/* 全画面は利用者・ホストによる選択時だけ対応する。学習中の強制切替はしない。 */
html.study-fullscreen #app.study-viewport:not(.is-old){padding-top:calc(64px + env(safe-area-inset-top,0px))}
#app.is-old{height:auto;min-height:0;max-height:none;overflow:visible;padding:4px 8px}.old-screen{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--sub);font-size:12px;line-height:1.35}.old-screen button{font:inherit;border:1px solid var(--line);border-radius:7px;background:var(--btn);color:var(--fg);padding:3px 7px;cursor:pointer;white-space:nowrap}
h2{font-size:19px;font-weight:700;color:var(--acc);background:var(--accbg);margin:0 0 10px;padding:9px 12px;border-radius:10px;line-height:1.4}
.field{display:inline-block;color:var(--acc);background:var(--accbg);font-weight:700;font-size:15px;margin-bottom:8px;padding:3px 10px;border-radius:999px}
.stem{white-space:pre-wrap;margin:10px 0;font-size:16px;line-height:1.8}.stem p{margin:0 0 .75em;white-space:pre-wrap}.stem p:last-child{margin-bottom:0}
.fig{margin:10px 0}.fig-open{display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:zoom-in}.fig-open img{display:block;width:100%;height:auto}.fig-hint{font-size:13px;color:var(--sub)}
.descriptive-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0;line-height:1.75;font-size:16px}
.table-scroll{overflow-x:auto;max-width:100%;margin:12px 0;-webkit-overflow-scrolling:touch}
.question-table{border-collapse:collapse;min-width:max-content;width:100%;font-size:14px;line-height:1.5}
.question-table caption{text-align:left;font-weight:700;margin-bottom:6px}
.question-table th,.question-table td{border:1px solid var(--line);padding:6px 8px;text-align:center;white-space:nowrap}
.question-table th{background:var(--accbg);font-weight:700}
.descriptive-source{margin:12px 0}.descriptive-source summary{cursor:pointer;font-weight:700;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--btn)}
.descriptive-source[open] summary{margin-bottom:8px}.descriptive-page{margin:12px 0 18px}.descriptive-page .fig{margin-top:5px}
.descriptive-explanation{font-size:16px;line-height:1.8;overflow-wrap:anywhere;margin:8px 0 18px}
.descriptive-explanation p{margin:10px 0 16px;white-space:normal;line-height:1.85}
.descriptive-explanation h2{color:var(--fg);background:transparent;border-radius:0;font-size:19px;margin:24px 0 10px;line-height:1.5;border-bottom:1px solid var(--line);padding:0 0 7px}
.descriptive-explanation h3{color:var(--fg);font-size:17px;margin:20px 0 9px;line-height:1.5}
.descriptive-explanation ul,.descriptive-explanation ol{padding-left:1.5em;margin:8px 0}
.descriptive-explanation code{background:var(--btn);border-radius:4px;padding:1px 3px;white-space:pre-wrap;overflow-wrap:anywhere}
.descriptive-explanation .equation{background:var(--accbg);padding:10px 12px;border-radius:8px;overflow-x:auto;overflow-wrap:normal;white-space:pre-wrap;font-size:15px;line-height:1.75}.descriptive-explanation .math-inline{font-family:ui-monospace,Menlo,monospace;font-size:.94em;overflow-wrap:anywhere}.descriptive-explanation .question-table td,.descriptive-explanation .question-table th{text-align:left;white-space:normal;vertical-align:top;min-width:4em}.descriptive-explanation .table-scroll{margin:14px 0}.descriptive-explanation pre{white-space:pre-wrap;overflow-x:auto;background:var(--btn);border-radius:8px;padding:10px 12px;font-size:14px;line-height:1.6}
.descriptive-actions{border-top:2px solid var(--line);padding-top:14px;margin-top:12px}
.fig-overlay{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;flex-direction:column}.fig-controls{display:flex;gap:8px;align-items:center;padding:8px;background:var(--bg);border-bottom:1px solid var(--line)}.fig-controls button{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--btn);color:var(--fg)}.fig-scroll{flex:1;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom}.fig-scroll img{display:block;height:auto;max-width:none;background:#fff}
.choices{display:flex;flex-direction:column;gap:5px;margin:8px 0}
.choices button{display:flex;gap:12px;font-size:17px;text-align:left;font:inherit;color:var(--fg);background:var(--btn);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}
.choices .opt{display:flex;gap:8px;align-items:center;background:var(--btn);border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer}.choices .opt input{margin:0}.choices .opt.correct{border-color:var(--ok);border-width:2px}.choices .opt.picked{outline:2px solid var(--sub)}
.choices button b,.choices .opt b{min-width:1.7em;height:1.7em;line-height:1.7em;text-align:center;border-radius:50%;background:var(--acc);color:var(--bg);font-size:14px;flex:none}.choices .opt{font-size:15px;line-height:1.5;padding:8px 10px}.choices{gap:8px;margin:14px 0 8px}
.choices button:disabled{opacity:.6;cursor:default}
.choices button.correct{border-color:var(--ok);border-width:2px}.choices button.picked{outline:2px solid var(--sub)}
.choices button.chosen{border:2px solid var(--acc);background:var(--accbg);opacity:1}
.stage-ack{color:var(--acc);font-weight:700;padding:8px 12px;border-left:3px solid var(--acc);margin:4px 0 10px}
.stage-arrived{font-weight:700;border-left:3px solid var(--acc);padding:8px 12px;margin:8px 0 12px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
button{word-break:keep-all;overflow-wrap:normal;line-break:strict;text-wrap:balance;max-width:100%;box-sizing:border-box}
.btn-line{display:block;white-space:nowrap}
.row button{font:inherit;font-size:16px;font-weight:600;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer}
.row .file-picker{position:relative;display:inline-flex;align-items:center;min-height:44px;font:inherit;font-size:16px;font-weight:600;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer;box-sizing:border-box;max-width:100%}
.file-picker input[type=file]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0}
.file-picker:focus-within{outline:2px solid var(--acc);outline-offset:2px}
.file-picker[aria-busy=true]{opacity:.6}
.import-state{border:2px solid var(--acc);border-radius:14px;background:var(--accbg);padding:16px;margin:12px 0;color:var(--fg)}
.import-state.ready{border-color:var(--ok);background:#e7f6ec}.import-state.pending{border-color:var(--line);background:var(--btn)}
.import-state strong{display:block;font-size:20px;line-height:1.45;margin-bottom:5px}
.import-state p{font-size:15px;line-height:1.6;margin:6px 0}
.import-state .import-auto{font-weight:700;color:var(--acc)}
.import-spinner{display:inline-block;width:16px;height:16px;margin-right:8px;border:3px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-3px;animation:import-spin .8s linear infinite}
@keyframes import-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.import-spinner{animation:none}}
.row button#licensedStart{width:100%;min-height:56px;background:var(--acc);color:var(--bg);border-color:var(--acc);font-size:19px;box-shadow:0 3px 9px rgba(0,0,0,.12)}
.import-action-status{font-size:15px;font-weight:700;padding:8px 10px;border-left:4px solid var(--acc);background:var(--accbg);margin:8px 0}
.import-action-status.busy::before{content:'';display:inline-block;width:14px;height:14px;margin-right:8px;border:3px solid var(--acc);border-right-color:transparent;border-radius:50%;vertical-align:-3px;animation:import-spin .8s linear infinite}
.import-action-status[role=alert]{border-color:var(--ng);background:#fdecec}
@media(prefers-reduced-motion:reduce){.import-action-status.busy::before{animation:none}}
@media(prefers-color-scheme:dark){.import-state.ready{background:#16301f}.import-action-status[role=alert]{background:#3a1d1d}}
@media(max-width:420px){.row button{font-size:clamp(13px,3.7vw,16px);padding:10px 11px;max-width:100%;overflow-wrap:normal;word-break:keep-all}}
@media(max-width:420px){.row .file-picker{font-size:clamp(13px,3.7vw,16px);padding:10px 11px}}
.row button#next,.row button#decide,.row button#startStudy{background:var(--acc);color:var(--bg);border-color:var(--acc)}
.notice{font-size:14px;color:var(--sub);white-space:pre-wrap;line-height:1.6;margin:6px 0}
.notice b{color:var(--fg);font-size:15px}
.result{font-weight:800;font-size:23px;margin:10px 0 6px;line-height:1.4;padding:12px 14px;border-radius:12px;border:2px solid var(--line)}.result.ok{color:var(--ok);background:#e7f6ec;border-color:#2e924e}.result.ng{color:var(--ng);background:#fdecec;border-color:#d14343}
.result-grade{border-left-width:7px;padding:14px 16px}.grade-word{display:block;font-size:30px;font-weight:900;letter-spacing:.03em;line-height:1.35}.grade-detail{display:block;font-size:15px;font-weight:600;line-height:1.6;margin-top:5px;color:var(--fg)}
@media (prefers-color-scheme:dark){.result.ok{background:#16301f}.result.ng{background:#3a1d1d}}
.ov{margin:0 0 14px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ov-h{background:var(--accbg);color:var(--acc);font-size:20px;font-weight:700;padding:10px 14px;line-height:1.4}
.ov-b{padding:6px 14px 10px}
.ov-r{padding:8px 0;border-bottom:1px solid var(--line)}.ov-r:last-child{border-bottom:0}
.ov-r{display:grid;grid-template-columns:6.2em 1fr;gap:2px 10px;align-items:baseline}
 .ov-r .ov-k{display:block}
.ov-r.full{display:block}
.ov-r.full .ov-v{display:block;width:100%;line-height:1.7}
@media (max-width:520px){.ov-r:not(.full){grid-template-columns:minmax(0,1fr);gap:0}.ov-r .ov-k{padding-bottom:2px}.ov-r .ov-v{overflow-wrap:anywhere}}
.ov-r.major .ov-v{font-weight:700}
.ov-r.tone-date .ov-k{color:#1557b0}.ov-r.tone-score .ov-k{color:#0a7d32}.ov-r.tone-fee .ov-k{color:#b45309}.ov-r.tone-note .ov-k{color:#6b5b95}
.ov-r.minor .ov-k{font-weight:600}.ov-r.minor .ov-v{color:var(--sub)}
.ov-k{display:block;color:var(--acc);font-weight:700;font-size:16px}
.ov-v{display:block;font-size:16px;line-height:1.65;overflow-wrap:anywhere}.ov-r>*{min-width:0}
.md p{margin:8px 0;line-height:1.75;overflow-wrap:anywhere}.md h3{font-size:17px;margin:14px 0 6px}.md ul,.md ol{margin:6px 0;padding-left:1.4em;line-height:1.75}.md-t{overflow-x:auto;margin:8px 0}.md table{border-collapse:collapse;width:100%;font-size:15px}.md th,.md td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.md a{color:var(--acc);text-decoration:underline;overflow-wrap:anywhere}.md code{background:#f1f3f4;padding:0 4px;border-radius:4px}
.ov-l{margin:4px 0 0;padding-left:1.6em;font-size:16px}.ov-l li{margin:3px 0}
.ov-n{font-size:14px;color:var(--sub);padding-top:8px}
.ov-a{display:inline-block;margin-top:8px;font-size:15px;color:var(--acc);font-weight:700}
a{color:inherit}
.latest{font-size:13px;font-weight:700;color:var(--acc);background:var(--accbg);border-radius:8px;padding:4px 10px;margin-bottom:8px}
.latest:focus{outline:2px solid var(--acc);outline-offset:2px}
.study-progress{padding:8px 10px 10px;margin:0 0 12px;border:1px solid var(--line);border-radius:10px;background:var(--accbg)}
.study-progress .progress-head{display:flex;justify-content:space-between;gap:10px;font-size:14px;font-weight:700;color:var(--acc)}
.study-progress .progress-track{height:9px;border-radius:99px;background:var(--bg);border:1px solid var(--line);overflow:hidden;margin:6px 0}
.study-progress .progress-fill{height:100%;background:var(--acc)}
.study-progress .progress-detail{font-size:13px;color:var(--sub);line-height:1.5}
</style></head><body><div id="app" aria-live="polite"><h2>資格学習</h2><p>学習画面を読み込んでいます…</p><div class="notice">表示されない場合は「画面が表示されない」とチャットに入力してください。</div></div>
<script>
(function(){
  var app = document.getElementById('app');
  var preparedLessons = ${JSON.stringify(PREPARED_LESSONS)};
  // 内容による自然高さ。#appにvhや高さ制限を設けないことで内側の縦スクロールを廃止。
  // ChatGPTホストが大きな高さを拒否する場合、完全な単一スクロールは保証できない。
  if (app.classList && app.classList.add) app.classList.add('study-viewport');
  var state = { sessionId: null, question: null, answered: false, privateLicensedUpload: false };
  var pending = {}, rid = 1, bridgeReady = false, hasView = false;
  function rpc(method, params){ return new Promise(function(res, rej){
    var id = rid++;
    var timer = setTimeout(function(){ delete pending[id]; rej(new Error('通信が時間切れになりました')); }, method === 'ui/initialize' ? 5000 : 45000);
    pending[id] = { res: res, rej: rej, timer: timer };
    window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params }, '*');
  }); }
  function notify(method, params){ window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*'); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // AI解説はツールの文字列を必ずエスケープしてから、限定したMarkdownだけ描画する。
  // HTMLやJavaScriptを解説文から実行させない。
  function explanationInline(s){
    return esc(s).replace(/\\x60([^\\x60\\n]+)\\x60/g, '<code>$1</code>')
      .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\\\\\((.*?)\\\\\\)/g, '<span class="math-inline">$1</span>');
  }
  function explanationHtml(markdown){
    var lines = String(markdown || '').replace(/\\r\\n/g,'\\n').split('\\n'), html = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()){ i++; continue; }
      // 数式の独立行とコードブロックは文章に吸収せず、読みやすい塊として描画する。
      if (/^\\s*(?:\\$\\$|\\\\\\[)\\s*$/.test(line)) {
        var endMark = line.trim() === '$$' ? '$$' : '\\\\]';
        var mathLines=[]; i++;
        while(i<lines.length && lines[i].trim() !== endMark) mathLines.push(lines[i++]);
        if(i<lines.length)i++;
        html.push('<p class="equation">'+esc(mathLines.join('\\n'))+'</p>');continue;
      }
      if (/^\\s*\x60\x60\x60/.test(line)) {
        var codeLines=[];i++;
        while(i<lines.length && !/^\\s*\x60\x60\x60/.test(lines[i])) codeLines.push(lines[i++]);
        if(i<lines.length)i++;
        html.push('<pre><code>'+esc(codeLines.join('\\n'))+'</code></pre>');continue;
      }
      if (/^\\s*\\|.*\\|\\s*$/.test(line) && /^\\s*\\|[\\s|:-]+\\|\\s*$/.test(lines[i+1] || '')) {
        var tableLines=[line, lines[i+1]]; i+=2;
        while(i<lines.length && /^\\s*\\|.*\\|\\s*$/.test(lines[i])) tableLines.push(lines[i++]);
        html.push(stemHtml(tableLines.join('\\n'))); continue;
      }
      var heading=line.match(/^\\s*#{1,4}\\s+(.+)$/);
      if (heading){var depth=(line.match(/^\\s*(#{1,4})/)||[])[1]?.length||3;html.push((depth<=2?'<h2>':'<h3>')+explanationInline(heading[1])+(depth<=2?'</h2>':'</h3>'));i++;continue;}
      if (/^\\s*[-*]\\s+/.test(line) || /^\\s*\\d+[.)]\\s+/.test(line)) {
        var ordered=/^\\s*\\d+[.)]\\s+/.test(line), list=[];
        while(i<lines.length && (ordered ? /^\\s*\\d+[.)]\\s+/ : /^\\s*[-*]\\s+/).test(lines[i])) {
          list.push('<li>'+explanationInline(lines[i++].replace(ordered ? /^\\s*\\d+[.)]\\s+/ : /^\\s*[-*]\\s+/,''))+'</li>');
        }
        html.push('<'+(ordered?'ol':'ul')+'>'+list.join('')+'</'+(ordered?'ol':'ul')+'>');continue;
      }
      var paragraph=[];
      while(i<lines.length && lines[i].trim() && !/^\\s*#{1,4}\\s+/.test(lines[i]) &&
        !/^\\s*[-*]\\s+/.test(lines[i]) &&
        !( /^\\s*\\|.*\\|\\s*$/.test(lines[i]) && /^\\s*\\|[\\s|:-]+\\|\\s*$/.test(lines[i+1] || '') )) paragraph.push(lines[i++]);
      if (!paragraph.length){i++;continue;}
      var eq = paragraph.length === 1 && /^(?:S\\s*=|[A-Za-zα-ωΑ-ΩΔθ]\\s*=|[0-9A-Z]+\\s*=)/.test(paragraph[0].trim());
      html.push('<p'+(eq?' class="equation"':'')+'>'+paragraph.map(explanationInline).join('<br>')+'</p>');
    }
    return html.join('');
  }
  function stemHtml(t){
    var lines=String(t == null ? '' : t).split(/\\r?\\n/), out=[];
    for(var i=0;i<lines.length;){
      if (/^\\s*\\|.*\\|\\s*$/.test(lines[i] || '') && /^\\s*\\|[\\s|:-]+\\|\\s*$/.test(lines[i+1] || '')) {
        var arr=[lines[i]], j=i+2;
        while(j<lines.length && /^\\s*\\|.*\\|\\s*$/.test(lines[j])) arr.push(lines[j++]);
        var rows=arr.map(function(v){return v.trim().replace(/^\\||\\|$/g,'').split('|').map(function(c){return c.trim();});});
        if(rows.length>1 && rows.every(function(r){return r.length===rows[0].length;})){
          out.push(descriptiveBlockHtml({kind:'table',caption:'',rows:rows},i));i=j;continue;
        }
      }
      if((lines[i] || '').trim())out.push('<p>'+esc(lines[i])+'</p>');
      i++;
    }
    return out.join('');
  }
  function safeUrl(u){ return /^https:\\/\\//.test(String(u || '')) ? String(u) : ''; }
  function figureHtml(u, i){ return '<div class="fig"><button class="fig-open" type="button" data-figure="' + esc(safeUrl(u)) + '" aria-label="公式の問題の図' + (i + 1) + 'を拡大"><img alt="公式の問題の図' + (i + 1) + '" src="' + esc(safeUrl(u)) + '"></button><div class="fig-hint">図をタップして拡大できます</div></div>'; }
  // 問題文と表はネイティブ要素で表示する。公式図の画像だけ拡大できる。
  function descriptiveBlockHtml(block, idx){
    if (!block) return '';
    if (block.kind === 'text') return '<p class="descriptive-text">' + esc(block.text || '') + '</p>';
    if (block.kind === 'table') {
      var rows = Array.isArray(block.rows) ? block.rows : [];
      if (!rows.length) return '<div class="notice" role="alert">公式表を検証できません。</div>';
      var cells = function(row, tag){
        return '<tr>' + row.map(function(c){return '<' + tag + '>' + esc(c == null ? '' : c) + '</' + tag + '>';}).join('') + '</tr>';
      };
      return '<div class="table-scroll" role="region" tabindex="0" aria-label="公式問題の表"><table class="question-table">' +
        (block.caption ? '<caption>' + esc(block.caption) + '</caption>' : '') +
        '<thead>' + cells(rows[0], 'th') + '</thead><tbody>' + rows.slice(1).map(function(row){return cells(row, 'td');}).join('') +
        '</tbody></table></div>';
    }
    if (block.kind === 'figure') return figureHtml(block.url, idx);
    return '';
  }
  function bindFigures(){ app.querySelectorAll('.fig-open').forEach(function(b){ b.onclick = function(){
    var overlay = document.createElement('div'); overlay.className = 'fig-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', b.getAttribute('aria-label'));
    overlay.innerHTML = '<div class="fig-controls"><button type="button" data-close>閉じる</button><button type="button" data-minus aria-label="縮小">−</button><button type="button" data-plus aria-label="拡大">＋</button></div><div class="fig-scroll"><img alt="拡大した公式の問題の図" src="' + esc(b.getAttribute('data-figure')) + '"></div>';
    document.body.appendChild(overlay); var img = overlay.querySelector('img'), scroll = overlay.querySelector('.fig-scroll'), scale = 2;
    // モーダルを開いた直後は必ず図の左上を表示。親ページのスクロール位置を引き継がない。
    overlay.scrollTop = 0; scroll.scrollTop = 0; scroll.scrollLeft = 0;
    function resize(){ img.style.width = Math.round(scroll.clientWidth * scale) + 'px'; scroll.scrollTop = 0; scroll.scrollLeft = 0; }
    img.addEventListener('load', function(){ scroll.scrollTop = 0; scroll.scrollLeft = 0; });
    resize(); overlay.querySelector('[data-close]').onclick = function(){ overlay.remove(); };
    overlay.querySelector('[data-plus]').onclick = function(){ scale = Math.min(6, scale + 1); resize(); };
    overlay.querySelector('[data-minus]').onclick = function(){ scale = Math.max(1, scale - 1); resize(); };
  }; }); }
  async function callTool(name, args){
    var r = bridgeReady ? await rpc('tools/call', { name: name, arguments: args }) : (window.openai && window.openai.callTool) ? await window.openai.callTool(name, args) : await ready.then(function(){ return rpc('tools/call', { name: name, arguments: args }); });
    return full(r);
  }
  async function ask(text, actionLabel){
    try {
      var oldError = document.getElementById('requestError'); if (oldError) oldError.remove();
      // 入力欄への不要な添付を避けるため、操作の合図は短い自然文だけを送る。
      // 詳細はツール説明とエンジンの保存記録から取得する。
      if (!bridgeReady) await ready;
      var visible = actionLabel || text;
      return await rpc('ui/message', { role: 'user', content: [{ type: 'text', text: visible }] });
    } catch (e) {
      var err = document.getElementById('requestError');
      if (!err) { app.insertAdjacentHTML('beforeend', '<div id="requestError" class="notice" role="alert"></div>'); err = document.getElementById('requestError'); }
      err.textContent = '操作を続けられませんでした。同じボタンで再試行できます。';
    }
  }
  // 画面用の全文は _meta.qlp（AIには渡らない）、無ければ structuredContent
  function full(r){ return r && ((r._meta && r._meta.qlp) || r.structuredContent || r); }
  function input(){ return (window.openai && window.openai.toolInput) || {}; }

  // iPhone/MCP Appsのファイル機能を使い、AIのツール選択を経由せずPDFを登録する。
  function yearFromPdfName(fileName) {
    var n = String(fileName || '').normalize('NFKC').replace(/[\\u3000\\s]+/g, '');
    var gregorian = n.match(/(?:^|[^0-9])((?:19|20)\\d{2})(?=[^0-9]|$)/);
    if (gregorian) return Number(gregorian[1]);
    var reiwa = n.match(/(?:^|[^a-zA-Z0-9])(?:令和|R)0?(\\d{1,2})(?=[^0-9]|$)/i);
    if (reiwa && Number(reiwa[1]) >= 1 && Number(reiwa[1]) <= 99) return 2018 + Number(reiwa[1]);
    var heisei = n.match(/(?:^|[^a-zA-Z0-9])(?:平成|H)0?(\\d{1,2})(?=[^0-9]|$)/i);
    if (heisei && Number(heisei[1]) >= 1 && Number(heisei[1]) <= 31) return 1988 + Number(heisei[1]);
    return null;
  }
  function planLicensedUpload(files, htmlAnswers, maxFiles) {
    if (!Array.isArray(files) || files.length < 1 || files.length > maxFiles)
      throw new Error('PDFは一度に1〜' + maxFiles + 'ファイルを選んでください。');
    var byYear = new Map();
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = String(f.name || f.fileName || '');
      if (!/\\.pdf$/i.test(name) && f.mimeType !== 'application/pdf' && f.type !== 'application/pdf')
        throw new Error('PDF以外は登録できません：' + name);
      if (typeof f.size === 'number' && f.size > 30 * 1024 * 1024)
        throw new Error('30MBを超えるPDFは登録できません：' + name);
      var year = yearFromPdfName(name);
      if (!year) throw new Error('ファイル名から年度を確認できません：' + name + '。例：R2_Mondai.pdf または 2020_問題.pdf として選択してください。');
      var isAnswer = /(?:answer|ans(?:wer)?|seikai|kaitou|解答|正答|正解)/i.test(name);
      if (htmlAnswers && isAnswer) throw new Error('行政書士は問題PDFだけを選んでください：' + name);
      var row = byYear.get(year) || { year:year, question:null, answer:null };
      var field = isAnswer ? 'answer' : 'question';
      if (row[field]) throw new Error(year + '年度の' + (isAnswer ? '正答' : '問題') + 'PDFが重複しています。');
      row[field] = f;
      byYear.set(year, row);
    }
    var list = Array.from(byYear.values()).sort(function(a,b){return a.year-b.year;});
    for (var j = 0; j < list.length; j++) {
      if (!list[j].question || (!htmlAnswers && !list[j].answer))
        throw new Error(list[j].year + '年度の' + (!list[j].question ? '問題' : '正答') + 'PDFがありません。');
    }
    return list;
  }

  // 診断：画面が動いたことを、エンジンの記録に残す（中身は送らない）。iPhone のアプリで画面が出ない原因を調べるため
  function diag(k){
    // 学習用メニューのスキーマ外の値を送らない。初期化完了後の専用ツールのみ。
    var args = { stage: k, version: '${WIDGET_VERSION}' };
    if (!bridgeReady && !(window.openai && window.openai.callTool)) return;
    callTool('reportUiEvent', args).catch(function(){});
  }
  var diagged = false;
  // 学習の番号（sessionId・学習ID）を、同じ学習の別の枠（解説・次へのメニュー）でも使えるよう控える。終了ボタンをAIに任せず、枠から確実に押せるようにするため
  var currentStudyId = null;
  function saveIds(){ try { var cur = {}; try { cur = JSON.parse(localStorage.getItem('qlp_ids') || '{}') || {}; } catch (e) {} if (state.sessionId && cur.sid && cur.sid !== state.sessionId) cur = {}; if (state.sessionId) cur.sid = state.sessionId; if (currentStudyId) cur.studyId = currentStudyId; if (studyLid) cur.lid = studyLid; if (studyField) cur.field = studyField; localStorage.setItem('qlp_ids', JSON.stringify(cur)); } catch (e) {} }
  function loadIds(){ try { return JSON.parse(localStorage.getItem('qlp_ids') || '{}') || {}; } catch (e) { return {}; } }
  function journeyBar(fieldIndex, fieldTotal, stage, fieldName){
    if (!Number.isInteger(fieldIndex) || !Number.isInteger(fieldTotal) || fieldIndex < 1 || fieldTotal < fieldIndex) return '';
    var step = stage === 'explain' ? 1 : stage === 'check1' ? 2 : stage === 'check2' ? 3 : stage === 'check3' ? 4 : stage === 'practice2' ? 6 : stage === 'practice3' ? 7 : 5;
    var total = fieldTotal * 7, position = (fieldIndex - 1) * 7 + step;
    var label = stage === 'explain' ? '解説' : stage.indexOf('check') === 0 ? '確認問題' : '実践問題';
    return '<div class="study-progress"><div class="progress-head"><span>全分野の学習ルート</span><span>' + esc(fieldIndex) + ' / ' + esc(fieldTotal) + '分野</span></div>' +
      '<div class="progress-track" role="progressbar" aria-label="全分野の学習ルートの位置" aria-valuemin="0" aria-valuemax="' + esc(total) + '" aria-valuenow="' + esc(position) + '"><div class="progress-fill" style="width:' + esc(Math.round(100 * position / total)) + '%"></div></div>' +
      '<div class="progress-detail">今：' + esc(fieldName || 'この分野') + '・' + label + ' ／ 全' + esc(total) + '段階中 ' + esc(position) + '段階目（解説1・確認3・実践3を各分野の目安とした位置。習得率ではありません）</div></div>';
  }
  function localBar(label, position, total){
    return '<div class="study-progress"><div class="progress-head"><span>' + esc(label) + '</span><span>' + esc(position) + ' / ' + esc(total) + '問</span></div>' +
      '<div class="progress-track" role="progressbar" aria-label="' + esc(label) + 'の位置" aria-valuemin="0" aria-valuemax="' + esc(total) + '" aria-valuenow="' + esc(position) + '"><div class="progress-fill" style="width:' + esc(Math.round(100 * position / total)) + '%"></div></div>' +
      '<div class="progress-detail">この問題を含めて残り ' + esc(total - position + 1) + '問</div></div>';
  }
  // 1セッション1固定枠。最初に開いた枠が表示を担当し、後続ツール結果の枠は通知だけ行う。
  // ChatGPTホストが過去のiframeを破棄する場合はリース期限後に別枠へ自動復帰する。
  var myAt = 0, locked = false, bc = null;
  var frameId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  var ownedSession = null, followerSession = null, refreshScheduled = false, lastRenderedSignature = null;
  var frameLeasePrefix = 'qlp_fixed_frame_v103:', frameChangePrefix = 'qlp_frame_change_v103:';
  var FRAME_LEASE_MS = 8000;
  function leaseKey(sid){ return frameLeasePrefix + encodeURIComponent(String(sid)); }
  function readLease(sid){
    try { return JSON.parse(localStorage.getItem(leaseKey(sid)) || 'null'); } catch(e){ return null; }
  }
  function liveLease(record){ return record && record.id && Number.isFinite(Number(record.time)) && Date.now() - Number(record.time) < FRAME_LEASE_MS && Date.now() >= Number(record.time); }
  function releaseOwnedSession(){
    if (!ownedSession) return;
    try { var old = readLease(ownedSession); if (old && old.id === frameId) localStorage.removeItem(leaseKey(ownedSession)); } catch(e){}
    ownedSession = null;
  }
  function claimFirstFrame(sid, force){
    if (!sid) return true;
    sid = String(sid);
    if (ownedSession && ownedSession !== sid) releaseOwnedSession();
    var current = readLease(sid);
    if (!force && liveLease(current) && current.id !== frameId) { followerSession = sid; return false; }
    try {
      localStorage.setItem(leaseKey(sid), JSON.stringify({ id: frameId, time: Date.now() }));
      var confirmed = readLease(sid);
      if (confirmed && confirmed.id !== frameId && liveLease(confirmed)) { followerSession = sid; return false; }
    } catch(e) { /* 保存禁止の環境では単一枠内の通常操作を維持する */ }
    ownedSession = sid;
    followerSession = null;
    return true;
  }
  function isFirstFrame(sid){
    var owner = readLease(sid);
    return ownedSession === sid && (!liveLease(owner) || owner.id === frameId);
  }
  function lockOld(){
    if (locked) return;
    locked = true;
    descriptiveScreen = null;
    app.style.opacity = '';
    app.classList.add('is-old');
    app.innerHTML = '<div class="old-screen" role="status">' +
      '<span>この枠は以前の表示です。新しい学習画面で続けてください。</span>' +
      '<button type="button" id="reopenStudy">この枠で再開</button></div>';
    document.getElementById('reopenStudy').onclick = function(){ restoreFromServer(true); };
    fit();
  }
  function announceChange(sid, at){
    if (!sid) return;
    var msg = { kind: 'updated', sessionId: String(sid), from: frameId, at: Number(at) || Date.now() };
    try { if (bc) bc.postMessage(msg); } catch(e){}
    try { localStorage.setItem(frameChangePrefix + encodeURIComponent(String(sid)), JSON.stringify(msg)); } catch(e){}
  }
  function scheduleFirstFrameRefresh(sid){
    if (!sid || !isFirstFrame(sid) || locked || refreshScheduled) return;
    refreshScheduled = true;
    setTimeout(function(){
      refreshScheduled = false;
      if (!isFirstFrame(sid) || locked) return;
      if (restoring) { scheduleFirstFrameRefresh(sid); return; }
      // 採点や次問取得を繰り返さず、保存された最新の表示状態だけを復元する。
      restoreFromServer(false);
    }, 180);
  }
  function onFrameMessage(msg){
    if (!msg || msg.kind !== 'updated' || msg.from === frameId) return;
    if (ownedSession && String(msg.sessionId) === ownedSession) scheduleFirstFrameRefresh(ownedSession);
  }
  try {
    bc = new BroadcastChannel('qlp-fixed-study-frame-v103');
    bc.onmessage = function(e){ onFrameMessage(e && e.data); };
  } catch(e){}
  window.addEventListener('storage', function(e){
    if (!e.key) return;
    if (ownedSession && e.key === frameChangePrefix + encodeURIComponent(ownedSession) && e.newValue) {
      try { onFrameMessage(JSON.parse(e.newValue)); } catch(err){}
    }
    if (ownedSession && e.key === leaseKey(ownedSession)) {
      var current = readLease(ownedSession);
      if (liveLease(current) && current.id !== frameId) { releaseOwnedSession(); lockOld(); }
    }
  });
  // iframeが無くなった場合でも新しい枠で操作不能にならないよう有期限で引き継ぐ。
  function fixedFrameHeartbeat(){
    if (ownedSession && !locked) {
      var owner = readLease(ownedSession);
      if (liveLease(owner) && owner.id !== frameId) { releaseOwnedSession(); lockOld(); return; }
      try { localStorage.setItem(leaseKey(ownedSession), JSON.stringify({ id: frameId, time: Date.now() })); } catch(e){}
    } else if (locked && followerSession && claimFirstFrame(followerSession, false)) {
      // 元の枠が消えたときだけ、残った枠を復元して利用可能にする。
      locked = false;
      app.classList.remove('is-old');
      restoreFromServer(false);
    }
    // setTimeout is supported even in restricted/legacy MCP Apps host environments.
    setTimeout(fixedFrameHeartbeat, 2000);
  }
  setTimeout(fixedFrameHeartbeat, 2000);
  function stamp(data){
    var sid = data && data.sessionId || state.sessionId || (input() && input().sessionId);
    // iOSは画面外の古いiframeを休止することがある。
    // 新しく登録されたAI解説は、現在表示されている枠へ確実に表示する。
    // 他の枠はlease変更を検出して操作不能にする（同時編集を防ぐ）。
    if (sid && data && data.status === 'menu' && data.menu?.kind === 'lesson' &&
        data.menu.body && !data.restored) claimFirstFrame(sid, true);
    if (sid && !claimFirstFrame(sid, false)) {
      state.sessionId = String(sid);
      announceChange(sid, data && data.at);
      lockOld();
      return;
    }
    myAt = Math.max(myAt, Number(data && data.at) || 0);
    // 後から再生成されたツール結果はサーバーから読み直すため、旧時刻で上書きしない。
  }
  function stableViewSignature(data){
    if (!data || typeof data !== 'object') return '';
    var copy = { ...data };
    // エンジンの読取結果につく一時的な表示属性は学習状態の変更ではない。
    delete copy.at; delete copy.restored;
    try { return JSON.stringify(copy); } catch(e) { return ''; }
  }
  // 追加年度の登録時期を明示し、学習中の状態を変えずに閲覧する。
  // 登録状況の確認はread-only。戻るときもnextQuestionを呼ばず、同じ問題を再表示する。
  var lastLearningView = null;
  var sourceManagerOpen = false;
  function sourceManagerBar(){
    return '<div class="row" style="margin-top:10px"><button type="button" id="sourceManagerBtn" class="quiet">過去問の追加・登録状況</button></div>';
  }
  function bindSourceManager(){
    var button = document.getElementById('sourceManagerBtn');
    if (button) button.onclick = openSourceManager;
  }
  async function openSourceManager(){
    if (!state.sessionId || sourceManagerOpen) return;
    var savedView = lastLearningView && lastLearningView.sessionId === state.sessionId ? lastLearningView : null;
    var checked = app.querySelector('input[name=ans]:checked');
    var chosen = checked ? checked.value : null;
    var guessed = document.getElementById('guess');
    var guessChecked = !!(guessed && guessed.checked);
    var sameSession = state.sessionId;
    sourceManagerOpen = true;
    app.innerHTML = '<h2>過去問の追加・登録状況</h2>' +
      '<div id="sourceManageStatus" class="notice" role="status">登録状況を確認しています。解答履歴と現在の問題は変更しません。</div>' +
      '<div class="row"><button type="button" id="sourceManageBack">学習中の問題に戻る</button></div>';
    async function goBack(){
      if (!sourceManagerOpen) return;
      var statusNode = document.getElementById('sourceManageStatus');
      if (statusNode) statusNode.textContent = '保存済みの学習画面を復元しています。';
      // 誤答・採点後に古い未回答の問題を再表示しない。read-only で最新の状態を読む。
      try {
        var snapshot = await callTool('getStudySnapshot', {sessionId:sameSession});
        if (!sourceManagerOpen || state.sessionId !== sameSession) return;
        if (!snapshot || snapshot.error || (!snapshot.status && !snapshot.question && !snapshot.menu && !snapshot.onboarding))
          throw new Error('STUDY_SNAPSHOT_UNAVAILABLE');
        sourceManagerOpen = false;
        // 元の問題とサーバー状態が同一でも、現在DOMは管理画面。
        // 復元時の重複描画抑止が管理画面を残してしまわないよう解除する。
        lastRenderedSignature = null;
        render(snapshot);
        if (chosen && snapshot.question && savedView?.question?.questionId === snapshot.question.questionId &&
            snapshot.status === 'question') {
          var radio = Array.from(app.querySelectorAll('input[name=ans]')).find(function(x){return x.value === chosen;});
          if (radio) {
            radio.checked = true;
            var row = document.getElementById('decrow');
            if (row) row.style.display = 'flex';
          }
          var newGuess = document.getElementById('guess');
          if (newGuess) newGuess.checked = guessChecked;
        }
      } catch (e) {
        if (!sourceManagerOpen) return;
        // 読取エラー時は未回答だったことを確認できる場合のみ元の画面へ戻す。
        // 採点済みの可能性があれば再採点ボタンを作らず、読取専用の復元を再試行させる。
        if (!state.answered && savedView && savedView.question) {
          sourceManagerOpen = false;
          lastRenderedSignature = null;
          render(savedView);
        } else {
          var warning = document.getElementById('sourceManageStatus');
          if (warning) {
            warning.textContent = '最新の学習状態を確認できません。学習履歴は保持されています。同じボタンで復元を再試行してください。';
            warning.setAttribute('role','alert');
          }
        }
      }
    }
    document.getElementById('sourceManageBack').onclick = goBack;
    try{
      var lib = await callTool('getOfficialLibrary', {sessionId:sameSession});
      if (!sourceManagerOpen || state.sessionId !== sameSession) return;
      if (!lib || lib.error || lib.status !== 'officialLibrary') throw new Error('LIBRARY_UNAVAILABLE');
      var ready = Array.isArray(lib.readyYearDetails) ? lib.readyYearDetails : [];
      var importing = Array.isArray(lib.importingYearDetails) ? lib.importingYearDetails : [];
      var failed = Array.isArray(lib.failedYearDetails) ? lib.failedYearDetails : [];
      var years = new Set(ready.map(function(x){return x.year;}));
      var entries = ready.length
        ? ready.map(function(x){return '<p>' + esc(x.year) + '年度・' + esc(x.section || '本試験') +
            '：利用可能 ' + esc(x.questions) + '問</p>';}).join('')
        : '<p>出題可能として検証済みの年度は、まだありません。</p>';
      var customs = lib.qualificationId === 'q098' || lib.qualificationName === '通関士';
      var caution = customs
        ? '<p><b>通関士の追加可能年度：</b>現在、出題・採点の検証が完了しているのは2025年度の択一式29問です。2024年度以前のPDFは、正答との対応検証が未完了のため、まだ登録可能とは案内しません。対応が追加された年度は、この画面で確認できます。</p>'
        : '<p>追加年度は公式問題PDFと公式正答を照合できたものから利用可能になります。年度の違う正答を流用しません。</p>';
      var multipleSections = Array.isArray(lib.uploadSections) && lib.uploadSections.length > 1;
      var answerHint = lib.answerFormat === 'html'
        ? 'この資格は問題PDFのみ添付してください。正答は登録済みの公式Web資料から照合します。'
        : '公式の問題PDFと同年度・同区分の正答PDFを選んでください。正答を別年度から流用しません。';
      var optionalFields = '<details class="notice"><summary>ファイル名から年度・試験区分が分からないとき</summary>' +
        '<label>実施年度（任意・西暦） <input id="sourceManageYearHint" type="number" min="1900" max="2200" placeholder="例：2024" inputmode="numeric"></label>' +
        (multipleSections ? '<label>試験区分（任意） <select id="sourceManageSectionHint"><option value="">ファイル名から自動判定</option>' +
          lib.uploadSections.map(function(x){ return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') + '</select></label>' : '') +
        '<p>複数年度・複数区分を一度に追加するときは、各PDFのファイル名に年度・区分を入れてください。区別できない原本は推測で登録しません。</p>' +
        '</details>';
      var pending = importing.length ? '<div class="notice">解析中：' +
        importing.map(function(x){return esc(x.year)+'年度 '+esc(x.section||'');}).join('、') + '</div>' : '';
      var errors = failed.length ? '<div class="notice" role="alert">取込失敗：' +
        failed.map(function(x){return esc(x.year)+'年度 '+esc(x.section||'')+'（'+esc(x.reason)+'）';}).join('、') + '</div>' : '';
      app.innerHTML = '<h2>過去問の追加・登録状況</h2>' +
        '<div id="sourceManageStatus" class="notice" role="status"><b>追加する時期は自由です。</b> おすすめは①初回の実践前、②同分野3問の区切り、③登録済み問題が残り少なくなったときです。回答途中でも登録状況を確認できますが、登録作業は回答後がスムーズです。今の問題と学習記録は保持します。</div>' +
        '<div class="import-state ready"><strong>現在利用できる過去問</strong><div id="sourceManageReadyList">' + entries + '</div></div>' +
        pending + errors + '<div class="notice">' + caution + '</div>' +
        (lib.sourceAttachmentSupported ?
          '<div class="import-state pending"><strong>別の年度のPDFを追加</strong>' +
          '<p>実践開始前・同分野3問の区切り・登録済み問題が少なくなった時がおすすめです。追加は任意です。</p>' +
          '<p>' + answerHint + '（1回の選択で最大10ファイル）</p>' +
          optionalFields +
          (lib.permissionedUpload ? '<label class="notice"><input type="checkbox" id="sourceManageRights"> 添付するPDFの保存・解析に必要な権利者の許諾を得ています</label>' : '') +
          '<div class="row"><label class="file-picker"><span>ローカルのPDFを追加する</span><input id="sourceManageUpload" type="file" accept=".pdf,application/pdf" multiple aria-label="ローカルのPDFを追加する"></label></div>' +
          '<p id="sourceManageUploadStatus" role="status">PDF選択後、自動で受付と公式正答照合を開始します。</p></div>'
          : '<div class="notice">この資格のPDF取込方式は未実装です。現在の履歴を保持し、取込可能な年度だけ表示します。</div>') +
        (customs && !years.has(2025) ?
          '<div class="row"><button type="button" id="sourceManageCustoms">2025年度公式PDFを取り込む</button></div>' : '') +
        (lib.qualificationId === 'land_surveyor' ?
          '<div class="import-state pending"><strong>取得・検証済みの旧年度過去問</strong><p>2015〜2021年度のうち、原本・正答を照合した区分を自動で取り込みます。2007〜2014年度など未検証の問題は出題しません。</p>' +
          '<div class="row"><button type="button" id="sourceManageLandArchive">旧年度の検証済み過去問を取り込む</button></div>' +
          '<p id="sourceManageLandArchiveStatus" role="status">問題・正答の照合が完了した区分だけ登録します。</p></div>' : '') +
        '<div class="row"><button type="button" id="sourceManageBack">同じ問題に戻る</button></div>';
      document.getElementById('sourceManageBack').onclick = goBack;
      var extraInput = document.getElementById('sourceManageUpload');
      if (extraInput) extraInput.onchange = async function(){
        var input = this;
        var status = document.getElementById('sourceManageUploadStatus');
        if (!status || !sourceManagerOpen || state.sessionId !== sameSession) return;
        var selected = Array.from(input.files || []);
        if (!selected.length) return;
        if (selected.length > 10 || selected.some(function(f){ return !String(f.name || '').toLowerCase().endsWith('.pdf') ||
            (f.type && f.type !== 'application/pdf'); })) {
          status.textContent = 'PDFだけを最大10ファイル選んでください。';
          status.setAttribute('role','alert'); input.value=''; return;
        }
        var rights = document.getElementById('sourceManageRights');
        if (lib.permissionedUpload && (!rights || !rights.checked)) {
          status.textContent = '先に、PDFの保存・解析に必要な権利者の許諾確認へチェックしてください。';
          status.setAttribute('role','alert'); input.value=''; return;
        }
        var host = window.openai || {};
        if (typeof host.uploadFile !== 'function' || typeof host.getFileDownloadUrl !== 'function') {
          status.textContent = 'このChatGPTアプリではPDF選択からの登録機能を利用できません。';
          status.setAttribute('role','alert'); input.value=''; return;
        }
        var yearInput=document.getElementById('sourceManageYearHint');
        var typedYear=yearInput && yearInput.value.trim() ? Number(yearInput.value) : null;
        var sectionInput=document.getElementById('sourceManageSectionHint');
        var typedSection=sectionInput && sectionInput.value ? String(sectionInput.value) : null;
        if (typedYear !== null && (!Number.isInteger(typedYear) || typedYear < 1900 || typedYear > 2200)) {
          status.textContent='実施年度は西暦4桁で指定してください。'; status.setAttribute('role','alert');
          input.value='';return;
        }
        input.disabled=true; status.setAttribute('role','status');
        status.textContent='PDFをエンジンへ送信中です。登録と正答検証が終わるまでは出題しません。';
        try {
          if (lib.permissionedUpload) {
            // 利用者の明示チェックに限り合法的に扱う。既存許諾を勝手に推定しない。
            var granted=await callTool('confirmUploadRights',{sessionId:sameSession,year:0,confirmed:true});
            if (!granted || granted.error || granted.status !== 'uploadPermissionConfirmed')
              throw new Error('UPLOAD_PERMISSION_UNAVAILABLE');
          }
          var refs=[];
          for (var f of selected) {
            var uploaded=await host.uploadFile(f);
            var id=uploaded && (uploaded.fileId || uploaded.file_id);
            if(typeof id!=='string'||!id) throw new Error('PDF_UPLOAD_FAILED');
            var link=await host.getFileDownloadUrl({fileId:id});
            var url=link && link.downloadUrl;
            if(typeof url!=='string'||!url.startsWith('https://'))
              throw new Error('PDF_DOWNLOAD_URL_MISSING');
            refs.push({file_id:id,file_name:String(f.name),mime_type:'application/pdf',download_url:url});
          }
          var isAnswer=function(f){return /正答|正解|解答|seikai|answer|correct|配点/i.test(f.file_name);};
          // 宅建は問題と正答が同じ公式PDFにある年度がある。1ファイルを両資料として検証する。
          // 他資格の「問題+解答」表記は自動で兼用と決めつけず、パーサーの仕様を優先する。
          var isTakkenCombined=function(f){return lib.qualificationId === 'q041' &&
            /問題|question|shiken/i.test(f.file_name) && isAnswer(f);};
          var questionPdfs=refs.filter(function(f){return !isAnswer(f) || isTakkenCombined(f);});
          var answerPdfs=lib.answerFormat==='html' ? [] : refs.filter(isAnswer);
          if (!questionPdfs.length) throw new Error('NO_QUESTION_PDF');
          var options={sessionId:sameSession,questionPdfs:questionPdfs,answerPdfs:answerPdfs};
          if (typedYear!==null){
            options.years=questionPdfs.map(function(){return typedYear;});
            if(answerPdfs.length) options.answerYears=answerPdfs.map(function(){return typedYear;});
          }
          if (typedSection) {
            options.sections=questionPdfs.map(function(){return typedSection;});
            if(answerPdfs.length) options.answerSections=answerPdfs.map(function(){return typedSection;});
          }
          var result=await callTool('attachPdfBatchFromPicker',options);
          if (!result || result.error || result.status !== 'attachedBatch')
            throw new Error(result?.error || 'PDF_REGISTER_FAILED');
          var errors=Array.isArray(result.results) ? result.results.filter(function(x){return x.status==='failed';}) : [];
          status.textContent='受付 '+Number(result.requested||0)+'件／解析開始 '+Number(result.queued||0)+
            '件／既存 '+Number(result.existing||0)+'件／正答確認待ち '+Number(result.pendingOfficialAnswer||0)+
            '件／失敗 '+Number(result.failed||0)+'件。' +
            (errors.length?' 登録できない理由：'+errors.map(function(x){return x.reason||x.code||'確認が必要です';}).join('、'):'')+
            (Array.isArray(result.unmatchedAnswerFiles)&&result.unmatchedAnswerFiles.length
              ? ' 年度・区分が不明な正答PDF：'+result.unmatchedAnswerFiles.map(function(x){return String(x).slice(0,80);}).join('、')+'。':'')+
            ' 学習に戻っても履歴は保持されます。';
          // 登録状態を同じ枠で監視し、過去問の実際の検証済み数だけ更新する。
          var attempts=0;
          async function refresh(){
            if (!sourceManagerOpen || !status.isConnected || state.sessionId!==sameSession) return;
            try{
              var updated=await callTool('getOfficialLibrary',{sessionId:sameSession});
              if(!updated || updated.error || updated.status!=='officialLibrary') throw new Error('LIBRARY_STATUS_FAILED');
              var finished=Array.isArray(updated.readyYearDetails)?updated.readyYearDetails:[];
              var running=Array.isArray(updated.importingYearDetails)?updated.importingYearDetails:[];
              var failed=Array.isArray(updated.failedYearDetails)?updated.failedYearDetails:[];
              var readyList=document.getElementById('sourceManageReadyList');
              if(readyList) readyList.innerHTML=finished.length
                ? finished.map(function(x){return '<p>'+esc(x.year)+'年度・'+esc(x.section||'本試験')+'：利用可能 '+esc(x.questions)+'問</p>';}).join('')
                : '<p>出題可能として検証済みの年度は、まだありません。</p>';
              status.textContent='出題可能：'+finished.map(function(x){return x.year+'年度 '+(x.section||'')+' '+x.questions+'問';}).join('、')+
                '／解析中：'+running.length+'件／失敗：'+failed.length+'件。'+
                (running.length?' 終了後に自動で登録状況を更新します。':' 完了した問題は次の出題から使用できます。');
              if(!running.length) return;
            }catch(err){
              status.textContent='登録状況を再確認中です。学習履歴は保持しています。';
            }
            if(++attempts<36 && sourceManagerOpen && status.isConnected)
              setTimeout(refresh,7000);
          }
          if (Number(result.queued||0)>0) refresh();
        } catch(e) {
          status.textContent='PDFを登録できませんでした（'+String(e.message||'通信エラー')+'）。学習記録は変更していません。';
          status.setAttribute('role','alert');
        } finally {input.disabled=false;input.value='';}
      };
      var landArchiveBtn = document.getElementById('sourceManageLandArchive');
      if (landArchiveBtn) landArchiveBtn.onclick = async function(){
        if (!sourceManagerOpen || state.sessionId !== sameSession) return;
        var notice = document.getElementById('sourceManageLandArchiveStatus');
        landArchiveBtn.disabled = true;
        landArchiveBtn.textContent = '旧年度の過去問を登録中…';
        if (notice) notice.textContent = '対象年度のPDFを取得し、問題・正答を検証しています。学習履歴はそのままです。';
        try {
          var result = await callTool('importLandSurveyorArchive',{sessionId:sameSession});
          if (!result || result.error || result.status !== 'archivedImportQueued')
            throw new Error('ARCHIVE_IMPORT_FAILED');
          if (notice) notice.textContent = '取り込み受付：' + Number(result.requestedSections||0) +
            '区分。検証できた問題から出題可能にします。';
          var checks = 0;
          async function refreshLandArchive(){
            if (!sourceManagerOpen || state.sessionId !== sameSession || !notice || !notice.isConnected) return;
            try {
              var updated = await callTool('getOfficialLibrary',{sessionId:sameSession});
              if (!updated || updated.error || updated.status !== 'officialLibrary') throw Error('LIBRARY_STATUS_FAILED');
              var done = Array.isArray(updated.readyYearDetails) ? updated.readyYearDetails : [];
              var processing = Array.isArray(updated.importingYearDetails) ? updated.importingYearDetails : [];
              var failed = Array.isArray(updated.failedYearDetails) ? updated.failedYearDetails : [];
              var list = document.getElementById('sourceManageReadyList');
              if(list && list.isConnected){
                list.innerHTML=done.length ? done.map(function(x){
                  return '<p>'+esc(x.year)+'年度・'+esc(x.section||'本試験')+
                    '：利用可能 '+esc(x.questions)+'問</p>';
                }).join('') : '<p>出題可能として検証済みの年度は、まだありません。</p>';
              }
              notice.textContent = '登録済み：' + done.map(function(x){
                return x.year+'年度 '+(x.section||'')+' '+x.questions+'問';
              }).join('、') + '／解析中：' + processing.length + '区分／失敗：' + failed.length + '区分。' +
                (processing.length ? ' 完了した区分から自動更新します。' :
                ' 完了した問題は次の出題から利用できます。');
              if (!processing.length) return;
            } catch(e){
              notice.textContent = '登録状況を再確認中です。既存の回答・復習記録は維持しています。';
            }
            if (++checks < 48 && sourceManagerOpen && notice && notice.isConnected)
              setTimeout(refreshLandArchive,7000);
          }
          await refreshLandArchive();
        } catch(e){
          if (notice) {notice.setAttribute('role','alert');notice.textContent='旧年度の登録を開始できませんでした。現在の学習記録は変更していません。';}
        } finally {
          if (landArchiveBtn.isConnected) {
            landArchiveBtn.disabled=false;
            landArchiveBtn.textContent='旧年度の検証済み過去問を取り込む';
          }
        }
      };
      var importBtn = document.getElementById('sourceManageCustoms');
      if(importBtn) importBtn.onclick = async function(){
        importBtn.disabled=true;importBtn.textContent='公式PDFを登録中…';
        try {
          var out = await callTool('importOfficialCustoms2025',{sessionId:sameSession});
          if (!out || out.error || out.status !== 'attachedBatch') throw Error('IMPORT_FAILED');
          app.insertAdjacentHTML('beforeend','<div class="notice" role="status">公式PDFの登録を開始しました。学習に戻っても登録は継続します。登録状況は再度この画面で確認できます。</div>');
        } catch(err){app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">PDFを登録できませんでした。学習に戻っても解答履歴は残ります。</div>');}
        finally {importBtn.disabled=false;importBtn.textContent='2025年度公式PDFを取り込む';}
      };
    } catch(err){
      if (!sourceManagerOpen) return;
      app.innerHTML = '<h2>過去問の追加・登録状況</h2><div id="sourceManageStatus" class="notice" role="alert">登録状況を取得できませんでした。学習はそのまま続行できます。</div>' +
        '<div class="row"><button type="button" id="sourceManageBack">同じ問題に戻る</button></div>';
      document.getElementById('sourceManageBack').onclick = goBack;
    }
    scrollUp();
    fit();
  }
  var renderFocusTurn = 0;
  var licensedPollGeneration = 0;
  var attachmentPollGeneration = 0;
  var customsPollGeneration = 0;
  var licensedConsentSessionId = null;
  function render(data){
    if (sourceManagerOpen && data?.restored) return;
    if (data && (data.question || data.grade || ['sourceUnavailable','waiting','finished','restoredGrade','reviewEmpty'].includes(data.status)))
      lastLearningView = data;
    // PDF添付のツール結果は新しいチャットメッセージ側に学習枠を生成する。
    // 前の学習枠はiPhoneで休止されることがあるため、この受領枠を最新の表示担当に切り替える。
    if (data && ['attached','attachedBatch','attachedAlready','pendingOfficialAnswer'].includes(data.status)) {
      var sid = data.sessionId || state.sessionId || (input() && input().sessionId);
      var previousSession = state.sessionId;
      if (sid && !hasView) claimFirstFrame(sid, true);
      // 先に開いた枠へ後から通知が届いても、回答中の問題を受領メッセージで消さない。
      if (hasView && state.question && !state.answered) return;
      if (sid && !claimFirstFrame(sid, false)) { lockOld(); return; }
      if (sid && previousSession && previousSession !== sid) { state.privateLicensedUpload = false; licensedConsentSessionId = null; }
      if (sid) { state.sessionId = sid; saveIds(); }
      hasView = true;
      licensedPollGeneration++;
      var generation = ++attachmentPollGeneration;
      var receiptSession = sid;
      var requestInFlight = false;
      function drawReceipt(message, error){
        if (locked || generation !== attachmentPollGeneration) return;
        app.innerHTML = '<h2>過去問の登録状況</h2>' +
          '<div class="import-state ' + (error ? 'pending' : '') + '" role="' + (error ? 'alert' : 'status') + '" aria-live="polite">' +
          '<strong>' + (error ? '登録状況を確認できません' : '<span class="import-spinner" aria-hidden="true"></span>PDFを登録・照合しています') + '</strong>' +
          '<p id="attachedStatus">' + esc(message) + '</p>' +
          '<p class="import-auto">' + (error ? '通信が戻れば自動で再確認します。' : '完了した年度は自動で表示を更新します。このままお待ちください。') + '</p></div>' +
          '<div class="row"><button type="button" id="retryAttached">今すぐ登録状況を確認</button></div>';
        var retry = document.getElementById('retryAttached');
        if (retry) retry.onclick = function(){ checkAttachedStatus(); };
        scrollUp();
        fit();
      }
      async function checkAttachedStatus(){
        if (locked || generation !== attachmentPollGeneration || requestInFlight) return;
        if (!receiptSession) {
          drawReceipt('学習セッションを確認できません。新しい学習画面から状態を復元してください。', true);
          return;
        }
        requestInFlight = true;
        try {
          var latest = await callTool('getOfficialLibrary', { sessionId:receiptSession });
          if (locked || generation !== attachmentPollGeneration || state.sessionId !== receiptSession) return;
          if (!latest || latest.error || latest.status !== 'officialLibrary' || !latest.permissionedUpload) {
            throw new Error('LIBRARY_REFRESH_FAILED');
          }
          // 同じ枠内で年度別の登録進行と選択ボタンを描画し、その画面の継続監視へ引き継ぐ。
          render({ ...latest, status:'sourceUnavailable' });
          return;
        } catch(error) {
          if (locked || generation !== attachmentPollGeneration) return;
          drawReceipt('登録状況の取得に失敗しました。PDFの再添付は不要です。通信を確認し、自動で再試行します。', true);
        } finally {
          requestInFlight = false;
        }
        // ネットワーク一時失敗時も受領だけで止まらない。表示中は再確認し続ける。
        if (!locked && generation === attachmentPollGeneration) setTimeout(checkAttachedStatus, 8000);
      }
      drawReceipt(sid ? 'PDFを受け付けました。登録・公式正答照合の状況を確認しています。' :
        '学習セッションを確認できません。学習画面を復元してください。', !sid);
      checkAttachedStatus();
      return;
    }
    if (data && ['officialLibrary','uploadPermissionConfirmed'].includes(data.status)) return;
    licensedPollGeneration++;
    if (data && data.status !== 'lesson_pending') lessonPollGeneration++;
    if (data && data.status !== 'confirmation_pending') confirmationPollGeneration++;

    if (!data || (!data.onboarding && !data.planReady && !data.menu && !data.question && !data.grade && !data.screen && !data.notice && !data.display && !data.error && !data.sessionId && !['waiting', 'finished', 'needPlan', 'toolError', 'reviewEmpty', 'figure', 'diagPreview', 'diagResult', 'remediation', 'remediation_question', 'remediation_retry', 'remediation_complete', 'confirmation_question', 'confirmation_result', 'confirmation_pending', 'lesson_pending', 'diagIntro', 'restoredGrade', 'restoreIdle', 'sourceUnavailable'].includes(data.status))) return;
    // ロック中の新しい結果も最初の枠へ送るため、stampは先に通す。
    stamp(data);
    if (locked) return;
    // 復元は読取専用。内容が変わらない再取得でボタンや入力状態を破棄しない。
    var nextSignature = stableViewSignature(data);
    if (data.restored && hasView && nextSignature === lastRenderedSignature) return;
    lastRenderedSignature = nextSignature;
    // 分岐ごとの表示更新が scrollUp を呼び忘れても、描画完了後に最新位置へ移動する.
    // 採点や問題取得を再実行せず、表示位置だけを調整する。
    var thisRender = ++renderFocusTurn;
    Promise.resolve().then(function(){ if (!locked && thisRender === renderFocusTurn) scrollUp(); });
    if (data.sessionId && state.sessionId && data.sessionId !== state.sessionId) { state.privateLicensedUpload = false; licensedConsentSessionId = null; }
    if (data.sessionId) state.sessionId = data.sessionId;
    if (data.uploadPermissionConfirmed === true) licensedConsentSessionId = state.sessionId;
    if (data.permissionedUpload || (data.question && /^(q097|q090):/.test(String(data.question.questionId || ''))))
      state.privateLicensedUpload = true;
    if (data.studyId) currentStudyId = data.studyId;
    if (data.learnerId) studyLid = data.learnerId;
    if (!state.sessionId && input().sessionId) state.sessionId = input().sessionId;
    saveIds();
    hasView = true;
    if (!diagged && (bridgeReady || (window.openai && window.openai.callTool))) { diagged = true; diag(data.onboarding ? 'render_onboarding' : data.question ? 'render_question' : 'render_other'); }
    if (data.error || data.status === 'toolError') {
      // 未対応の資格や導入画面の取得失敗を「問題を準備中」と偽装しない。
      var issue = String(data.error || 'UNEXPECTED_START_RESULT');
      var nameError = issue === 'QUALIFICATION_NOT_SUPPORTED' || issue === 'QUALIFICATION_INVALID';
      var message = nameError ? '資格名を認識できませんでした。学習する資格名を入力してください。' :
        issue === 'ONBOARDING_UNAVAILABLE' ? '試験概要と学習状況の画面を取得できませんでした。学習記録は保持しています。' :
        issue === 'DAILY_LIMIT' ? '本日の利用上限に達しました。学習記録は保持しています。' :
        issue === 'ACCESS_CODE_REQUIRED' ? '利用コードの入力が必要です。' :
        '学習画面を開けませんでした。学習記録は保持しています。';
      app.innerHTML = '<h2>学習の開始を確認してください</h2><div class="notice" role="alert">' + esc(message) + '</div>' +
        (nameError ? '<label for="retryQualification">学習する資格名</label><input id="retryQualification" placeholder="例：宅建" autocomplete="off" maxlength="100" style="display:block;width:100%;font:inherit;padding:12px;margin:8px 0 14px">' +
          '<button id="retryQualificationStart">この資格で開始する</button>' :
          data.sessionId || state.sessionId ? '<div class="row"><button id="retryInit">学習画面を再取得する</button></div>' : '') +
        ((data.sessionId || state.sessionId) && !nameError ? endBar() : '');
      var retryName = document.getElementById('retryQualificationStart');
      if (retryName) retryName.onclick = async function(){
        var q = document.getElementById('retryQualification').value.trim();
        if (!q) { document.getElementById('retryQualification').focus(); return; }
        this.disabled = true;
        try {
          var started = await callTool('startSession', { qualificationId: q, sources: [] });
          if (!started || started.error || !Array.isArray(started.onboarding) || !started.onboarding.length) throw new Error('ONBOARDING_UNAVAILABLE');
          render(started);
        } catch (e) {
          this.disabled = false;
          var n = document.getElementById('startRetryError');
          if (!n) { app.insertAdjacentHTML('beforeend','<div class="notice" id="startRetryError" role="alert"></div>'); n = document.getElementById('startRetryError'); }
          n.textContent = 'この資格の学習を開始できませんでした。資格名を確認して、同じボタンから再試行できます。';
        }
      };
      var retryInit = document.getElementById('retryInit');
      if (retryInit) retryInit.onclick = function(){ nextBelow(function(){
        return callTool('nextQuestion', { sessionId: state.sessionId }).then(function(v){
          if (!v || v.error || (!v.question && !v.onboarding && !v.notice && !['waiting','finished','sourceUnavailable','restoreIdle','remediation'].includes(v.status))) throw new Error('START_VIEW_UNAVAILABLE');
          render(v);
        });
      }); };
      bindEnd(); return;
    }
    if (data.status === 'questionUnavailable') {
      // 指定問が無いとき、別の問題や学習計画に置き換えず、その問だけ再検査する。
      app.innerHTML = '<h2>指定した公式過去問を確認できません</h2>' +
        '<div class="field">' + esc(data.requestedQuestion || '') + '</div>' +
        '<div class="notice" role="status">' + esc(data.notice || '指定の問題は現在利用できません。') + '</div>' +
        (data.sharedLibrary ? libraryHtml(data.sharedLibrary) : '') +
        '<div class="row"><button id="retryRequestedQuestion">同じ問題を再確認する</button></div>' + endBar();
      var retry = document.getElementById('retryRequestedQuestion');
      retry.onclick = async function(){
        retry.disabled = true;
        retry.textContent = '同じ問題を確認しています…';
        try {
          var answer = await callTool('nextQuestion', {
            sessionId: state.sessionId, question: data.requestedQuestion,
          });
          if (!answer || answer.error ||
              !['question','questionUnavailable','waiting'].includes(answer.status))
            throw new Error('DIRECT_QUESTION_RETRY_FAILED');
          render(answer);
        } catch(e) {
          retry.disabled = false;
          retry.textContent = '同じ問題を再確認する';
          app.insertAdjacentHTML('beforeend',
            '<div class="notice" role="alert">指定した問題の取得に失敗しました。同じボタンで再試行できます。</div>');
        }
      };
      bindEnd(); scrollUp(); return;
    }
    if (data.status === 'descriptiveActions') {
      showDescriptiveActions(data);
      return;
    }
    if (data.status === 'descriptiveQuestion' || data.status === 'descriptiveReveal') {
      showDescriptiveQuestion(data);
      return;
    }
    if (data.status === 'restoredGrade') {
      // 採点済みの問を先に同一問題として描き、その上に正答と続きの操作を復元する。
      render({ ...data, status: 'question', grade: undefined, next: undefined });
      state.next = data.next || null;
      state.answered = true;
      showGrade(data.grade);
      return;
    }
    if (data.status === 'restoreIdle') {
      // 資格の確認なしに「再開済み」とだけ表示すると、別資格の記録と取り違える。
      var restoreTitle = data.qualificationName ? data.qualificationName + '｜学習再開' : '学習を再開しました';
      app.innerHTML = '<h2>' + esc(restoreTitle) + '</h2><div class="notice">' + esc(data.notice || '') + '</div>' +
        (Number.isInteger(data.answeredCount) ? '<div class="stem">保存済みの回答：' + esc(data.answeredCount) + '問</div>' : '') +
        '<div class="row"><button id="restoreContinue">学習を続ける</button></div>' + endBar();
      document.getElementById('restoreContinue').onclick = function(){
        nextBelow(function(){ return callTool('nextQuestion', { sessionId: state.sessionId }).then(render); });
      };
      bindEnd(); return;
    }
    if (data.grade && data.next) {
      if (state.question && !state.answered) { state.answered = true; showGrade(data.grade); state.next = data.next; return; }
      var g = data.grade; render(data.next);
      app.insertAdjacentHTML('afterbegin', '<div class="notice">前の問題：' + (g.skipped ? 'スキップ' : g.dontKnow ? '分からない（正答は ' + esc(g.correctAnswerLabel || g.correctAnswer) + '）' : (g.correct ? '正解' : '不正解') + '（正答は ' + esc(g.correctAnswerLabel || g.correctAnswer) + '）') + '</div>');
      return;
    }
    if (data.status === 'diagPreview') { diagPreview(data.diag); return; }
    if (data.status === 'diagIntro') { diagIntro(data.diag, data.question); return; }
    if (data.status === 'diagResult') { diagResultScreen(data); return; }
    if (data.status === 'resumeReady') {
      // 引継ぎ済みなら初回の試験概要・免除・学習状況・計画を再表示しない。
      // 既存の出題・採点履歴を変更せず、学習開始を利用者が選ぶまで待つ。
      studyLid = data.learnerId || studyLid;
      var count = Number(data.answeredCount) || 0;
      var wrong = Number(data.wrongCount) || 0;
      app.innerHTML = '<h2>' + esc(data.qualificationName || '資格学習') + '｜続きから再開</h2>' +
        '<div class="notice">前回の学習記録を読み込みました。試験概要・免除・学習状況・計画を最初から設定し直す必要はありません。</div>' +
        '<div class="stem">回答済み：' + esc(count) + '問　／　要復習：' + esc(wrong) + '問</div>' +
        (data.pendingQuestion ? '<div class="notice">前回未回答：' + esc(data.pendingQuestion) + '（その問題から再開します）</div>' : '') +
        '<div class="row"><button id="resumeSavedStudy">学習を再開する</button></div>';
      saveIds();
      var resumedStudyId = null, isResuming = false;
      document.getElementById('resumeSavedStudy').onclick = async function(){
        if (isResuming) return;
        isResuming = true; this.disabled = true;
        var btn = this; btn.textContent = '学習記録を開いています…';
        try {
          if (!resumedStudyId) {
            var started = await callTool('startStudy', { qualificationName: data.qualificationName, learnerId: data.learnerId });
            if (!started || started.error || !started.studyId) throw new Error('RESUME_STUDY_NOT_STARTED');
            resumedStudyId = started.studyId;
          }
          currentStudyId = resumedStudyId; saveIds();
          var next = await callTool('nextQuestion', { sessionId: state.sessionId });
          if (!next || next.error || !['question','waiting','finished','remediation','confirmation_pending','sourceUnavailable'].includes(next.status)) {
            throw new Error('RESUME_QUESTION_UNAVAILABLE');
          }
          render(next);
        } catch(e) {
          btn.disabled = false; btn.textContent = '学習を再開する';
          var msg = document.getElementById('resumeError');
          if (!msg) { app.insertAdjacentHTML('beforeend','<div class="notice" id="resumeError" role="alert"></div>'); msg = document.getElementById('resumeError'); }
          msg.textContent = '続きの問題を取得できませんでした。学習記録は保持しています。もう一度押してください。';
        } finally { isResuming = false; }
      };
      return;
    }
    if (data.planReady) { planDraft = null; onboardOv = Object.assign({}, data.overview || {}, { fields: (data.plan && data.plan.fields) || [], diagResult: data.diagResult || [] }); studyLearner = data.learnerId || state.sessionId; planPanel([(data.plan && data.plan.note) || '']); return; }
    if (Array.isArray(data.onboarding) && data.onboarding.length) { onboardOv = data.overview || null; onboardSteps = data.onboarding; studyLearner = data.learnerId || state.sessionId; onboard(data.onboarding, []); return; }
    if (data.menu) { showMenu(data.menu); return; }
    if (typeof data.handoff === 'string' && typeof data.display === 'string') { showEnd(data); return; }
    if (data.status === 'figure' && (data.figureUrls || []).length) {
      var fh = '<div class="notice">' + esc(data.screen || '') + '</div>';
      data.figureUrls.forEach(function(u, i){ if (safeUrl(u)) fh += figureHtml(u, i); });
      app.innerHTML = fh; bindFigures(); return;
    }
    if (data.status === 'remediation_question') {
      showRemediationQuestion(data);
      return;
    }
    if (data.status === 'lesson_pending') {
      showPendingLesson(data);
      return;
    }
    if (data.status === 'confirmation_question') { showConfirmationQuestion(data); return; }
    if (data.status === 'confirmation_result') { showConfirmationResult(data); return; }
    if (data.status === 'confirmation_pending') {
      var position = Number(data.position) || 1;
      var bank = preparedLessons[data.fieldName] && preparedLessons[data.fieldName].questions;
      var bankReady = !!(bank && bank[position-1]);
      app.innerHTML = journeyBar(data.journey?.fieldIndex, data.journey?.fieldTotal, 'check' + position, data.fieldName) +
        localBar('この分野の確認問題', position, 3) +
        '<h2>確認問題・第' + esc(position) + '問（全3問）</h2>' +
        '<div id="preparedCheckStatus" class="notice" role="status">' +
        (bankReady ? '確認問題を表示します。少しお待ちください。' :
          esc(data.notice || 'AI作成の確認問題の登録を待っています。')) + '</div>' +
        '<div class="row"><button id="continueConfirmation">' + (bankReady ? '同じ枠に第' + esc(position) + '問を表示' : '第' + esc(position) + '問を作成・登録') + '</button></div>' + endBar();
      var idForConfirmation = state.sessionId;
      document.getElementById('continueConfirmation').onclick = async function(){
        var button = this; button.disabled = true;
        try {
          if (bankReady) await registerPreparedConfirmation(data.fieldName, position, idForConfirmation);
          else await ask(data.fieldName + 'の確認問題第' + position + '問をregisterConfirmationQuestionに登録して画面に表示してください。',
            data.fieldName + 'の確認問題・第' + position + '問を作成して学習画面に登録する');
        } finally { if (button.isConnected) button.disabled = false; }
      };
      if (bankReady) {
        // 出題前に教材内の正答・全選択肢・簡易解説をエンジンへ登録する。採点は必ずエンジン側。
        // 二重実行でも既存challengeがあればエンジンが同じ問を返す。
        Promise.resolve().then(function(){
          if (!locked && idForConfirmation === state.sessionId &&
              document.getElementById('continueConfirmation'))
            registerPreparedConfirmation(data.fieldName, position, idForConfirmation);
        });
        bindEnd(); return;
      }
      // 他資格のAI作成問題は従来どおりだが、登録前に新しい枠を作ることはしない。
      var checkPollId = ++confirmationPollGeneration;
      var checkDelays = [2000, 3000, 5000, 8000, 12000];
      function checkPublished(index){
        if (index >= checkDelays.length || checkPollId !== confirmationPollGeneration) return;
        setTimeout(async function(){
          if (checkPollId !== confirmationPollGeneration || locked || !state.sessionId ||
              !document.getElementById('continueConfirmation')) return;
          if (!restoring) await restoreFromServer(false);
          if (checkPollId === confirmationPollGeneration) checkPublished(index + 1);
        }, checkDelays[index]);
      }
      checkPublished(0);
      bindEnd(); return;
    }
    if (data.status === 'remediation_retry') {
      app.innerHTML = '<h2>AI作成確認問題の結果</h2><div class="result ng">不正解</div>' +
        (data.correctAnswer ? '<div class="stem">正答：' + esc(data.correctAnswer) + '</div>' : '') +
        '<div class="notice">' + esc(data.notice || '同じ分野をもう一度確認します。') + '</div>' +
        '<div class="row"><button id="retryRemediation">別の確認問題を出す</button></div>' + endBar();
      document.getElementById('retryRemediation').onclick = function(){
        this.disabled = true;
        ask('先ほどのAI作成確認問題は不正解でした。公式過去問はまだ再開しません。別のAI作成確認問題を1問作り、本文・全選択肢・確定した正答番号をregisterRemediationQuestionへ登録してから画面で出してください。', '同じ分野の確認問題をもう一度見る');
      };
      bindEnd();
      return;
    }
    if (data.status === 'remediation_complete') {
      app.innerHTML = '<h2>確認問題の結果</h2><div class="result ok">正解</div><div class="notice">' +
        esc(data.notice || '確認問題に正解しました。') +
        '</div><div class="row"><button id="resumeAfterRemediation">同じ分野の公式過去問に戻る</button></div>' + endBar();
      document.getElementById('resumeAfterRemediation').onclick = async function(){
        this.disabled = true;
        try { render(await callTool('nextQuestion', { sessionId: state.sessionId })); }
        catch (e) {
          this.disabled = false;
          app.insertAdjacentHTML('beforeend','<div class="notice">公式過去問を取得できませんでした。このボタンで再試行してください。</div>');
        }
      };
      bindEnd();
      return;
    }
    if (data.status === 'remediation') {
      app.innerHTML = '<div class="notice" role="alert">' + esc(data.notice || 'この分野の確認問題に正解するまで次の公式過去問へ進めません。') + '</div><div class="row"><button id="mandatoryCheck">AI作成確認問題を始める</button></div>' + endBar();
      document.getElementById('mandatoryCheck').onclick = function(){
        this.disabled = true;
        ask((data.fieldName || '今の分野') + 'で同一分野3問連続不正解です。次の公式過去問へ進まず、AI作成の確認問題を出題し、回答後に正答を照合してください。正解時だけcompleteRemediationで確認結果を記録して同じ分野の実践問題へ戻してください。不正解時は別の確認問題で補強してください。', (data.fieldName || '今の分野') + 'の確認問題を始める');
      };
      bindEnd();
      return;
    }
    if (data.status === 'sourceUnavailable' && data.permissionedUpload) {
      var personal = Array.isArray(data.personalUploadedYears) ? [...new Set(data.personalUploadedYears)] : [];
      var readyDetails = Array.isArray(data.readyYearDetails) ? data.readyYearDetails : [];
      var readyQuestions = readyDetails.reduce(function(sum, v){ return sum + (Number(v.questions) || 0); }, 0);
      var pending = Array.isArray(data.pendingOfficialAnswerYears) ? [...new Set(data.pendingOfficialAnswerYears)].filter(function(y){ return !personal.includes(y); }) : [];
      var maxBatch = Number.isInteger(data.maxBatchFiles) && data.maxBatchFiles > 0 ? data.maxBatchFiles : 10;
      var importing = Array.isArray(data.importingYears) ? data.importingYears : [];
      var failedImports = Array.isArray(data.failedYears) ? data.failedYears : [];
      var importRecords = Array.isArray(data.importHistory) ? data.importHistory : [];
      var importStates = {registered:'受付',running:'解析中',retry:'再試行',done:'検証完了',failed:'失敗',pending:'確認待ち'};
      var isHtmlAnswer = data.answerFormat === 'html' || /行政書士/.test(data.qualificationName || '');
      var officialLink = safeUrl(data.officialUrl);
      var uploadHint = isHtmlAnswer ? '各年度の公式問題PDF（正答PDFは不要です）' : '各年度の公式問題PDFと正答PDF';
      var readyYears = readyDetails.length ? readyDetails.map(function(v){ return esc(v.year) + '年度 ' + esc(v.questions) + '問'; }).join('・') : personal.map(function(y){ return esc(y) + '年度'; }).join('・');
      var statusCard = personal.length ?
        '<div class="import-state ready" role="status" aria-live="polite"><strong>公式過去問を解けます</strong><p>' + readyYears +
        (readyQuestions ? '／計' + esc(readyQuestions) + '問' : '') + '</p>' +
        (importing.length ? '<p>追加したPDFも解析中です。完了した年度から自動で表示を更新します。</p>' :
          pending.length ? '<p>一部の年度は公式正答の確認待ちです。利用できる年度から学習できます。</p>' :
          '<p>登録・正答照合が完了した年度から学習できます。</p>') +
        '<div class="row"><button id="licensedStart" type="button">公式過去問を解く</button></div></div>' :
        importing.length ? '<div class="import-state" role="status" aria-live="polite"><strong><span class="import-spinner" aria-hidden="true"></span>PDFを解析中です</strong><p>' + importing.map(function(y){return esc(y) + '年度';}).join('・') + 'の登録・正答照合を進めています。</p><p class="import-auto">出題できるようになったら、この画面を自動で更新します。</p></div>' :
        pending.length ? '<div class="import-state pending" role="status"><strong>公式正答の確認待ちです</strong><p>正答を照合できた年度から出題できます。登録状況は自動で確認します。</p></div>' :
        '<div class="import-state pending" role="status"><strong>出題できる過去問はまだありません</strong><p>PDFを選んで登録すると、状況を自動で更新します。</p></div>';
      app.innerHTML = '<h2>' + (personal.length ? '公式過去問を解けます' : importing.length ? '過去問を取り込んでいます' : '過去問PDFの取り込み') + '</h2>' +
        statusCard +
        (personal.length ? '<div class="notice"><b>あなたの登録済み過去問（本人専用・出題可能）：</b>' + (readyDetails.length ?
          readyDetails.map(function(v){ return esc(v.year) + '年度 ' + esc(v.questions) + '問'; }).join('・') :
          personal.map(function(y){ return esc(y) + '年度'; }).join('・')) +
          (readyQuestions ? '<div>検証済みの計' + esc(readyQuestions) + '問から学習できます。</div>' : '') + '</div>' : '') +
        (pending.length ? '<div class="notice"><b>公式正答の確認待ち：</b>' + pending.map(function(y){return esc(y) + '年度';}).join('・') + '<div>問題PDFは受け取り済みです。公式正答の年度照合が終わるまで出題・採点はしません。</div></div>' : '') +
        (importing.length ? '<div class="notice"><b>登録処理中：</b>' + importing.map(function(y){return esc(y) + '年度';}).join('・') + '</div>' : '') +
        (failedImports.length ? '<div class="notice" role="alert"><b>登録に失敗：</b>' + failedImports.map(function(v){return esc(v.year) + '年度（' + esc(v.reason) + '）';}).join('・') + '</div>' : '') +
        (importRecords.length ? '<details class="notice" id="licensedHistory"><summary>この資格の取込み履歴（本人専用）</summary>' +
          importRecords.map(function(r){
            var label = r.status === 'done' ? '出題可能 ' + esc(r.questions) + '問' :
              r.status === 'failed' ? '登録失敗' : r.status === 'running' ? '解析中' : '登録待ち';
            var events = Array.isArray(r.events) ? r.events.slice(-6) : [];
            return '<div style="padding:7px 0;border-top:1px solid #ddd"><b>' + esc(r.year || '年度不明') +
              '年度 ' + esc(r.section || '') + '：' + label + '</b>' +
              (events.length ? '<ul>' + events.map(function(e){
                var time = Number.isFinite(e.at) ? new Date(e.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '日時不明';
                return '<li>' + esc(time) + '　' + esc(importStates[e.status] || e.status) +
                  (e.reason ? '（' + esc(e.reason) + '）' : '') + '</li>';
              }).join('') + '</ul>' : '<div>以前の取込みは最終状態のみ保存されています。</div>') +
              '</div>';
          }).join('')+'</details>' : '') +
        '<h3>PDFを追加で取り込む</h3>' +
        '<div class="notice"><b>利用許諾の確認</b><div>過去問を自動取得・他の利用者へ共有配布しません。添付するファイルについて、権利者から必要な許諾を得ている場合だけ本人用に保存・解析できます。</div></div>' +
        (officialLink ? '<div class="row"><a class="ov-a" target="_blank" rel="noopener" href="' + esc(officialLink) + '">公式過去問ページ・利用条件を確認する ›</a></div>' : '') +
        '<details class="notice" id="licensedInstructions" ' + (!personal.length && !importing.length ? 'open' : '') + '><summary>取り込み方法（年度選択は不要）</summary>' +
        '<div>① 添付するすべてのPDFの利用条件を確認し、下のチェックを入れる。許諾確認は自動で記録されます。</div>' +
        '<div>② 「iPhone内のPDFを探す」から、' + esc(uploadHint) + 'を選ぶ。選択後、自動で取込み・登録を開始します。</div>' +
        '<div>③ 登録・正答照合が完了した年度から「公式過去問を解く」で進む。登録状況は自動で更新します。</div>' +
        '<div>受信だけでは登録完了ではありません。完了・解析中・正答確認待ち・失敗を画面で区別します。</div>' +
        '<div><b>1回に最大' + esc(maxBatch) + 'ファイル</b>。異なる年度のPDFをまとめて添付できます。年度はファイル名とPDF原本で照合し、正答未確認の問題は採点を保留します。</div></details>' +
        '<label style="display:flex;align-items:flex-start;gap:8px;margin:12px 0"><input type="checkbox" id="licensedAck" ' + (licensedConsentSessionId === state.sessionId ? 'checked disabled ' : '') + 'style="margin-top:7px"><span>今回添付するすべての' + esc(isHtmlAnswer ? '問題PDF' : '問題・正答PDF') + 'について、このシステムへ送信し、本人用に保存・解析するために必要な権利者の許諾を取得・確認しました。</span></label>' +
        '<div class="row"><label class="file-picker" id="licensedLocalPick"><span id="licensedLocalPickText">iPhone内のPDFを探す</span><input id="licensedLocalUpload" type="file" accept=".pdf,application/pdf" aria-label="iPhone内のPDFを探す" multiple /></label></div>' +
        '<div class="import-action-status" role="status" id="licensedFileStatus">PDFを選ぶと自動で取り込みます。進行状況と完了はこの画面に表示します。</div>' +
        '<div class="notice">従来どおり下のチャット欄（＋）からもPDFを送信できます。すでにエンジンに登録済みの年度は再送不要です。</div>' +
        '<div class="notice" role="status" id="licensedProgress">' + (licensedConsentSessionId === state.sessionId ? '確認済みです。「iPhone内のPDFを探す」から選ぶと、自動で取込み・登録します。' : '許諾確認にチェックを入れてからPDFを送信してください。') + '</div>' +
        '<div id="licensedHelp" role="status">' + (data.refreshMessage ? '<div class="notice">' + esc(data.refreshMessage) + '</div>' : '') + '</div>' +
        '<div class="notice" id="licensedAutoStatus" role="status">登録状況は自動で更新します。</div>' + endBar();
      var practice = document.getElementById('licensedStart');
      if (practice) practice.onclick = async function(){
        this.disabled = true;
        try {
          var field = data.fieldName || studyField || '';
          if (field) {
            var selection = await callTool('chooseItem', {sessionId:state.sessionId, fieldName:field, mode:'practice'});
            if (!selection || selection.error || selection.status !== 'item') throw new Error('PRACTICE_SELECTION_FAILED');
          }
          var next = await callTool('nextQuestion', {sessionId:state.sessionId, ...(field ? {question:field} : {})});
          if (!next || next.error || !['question','waiting','finished','sourceUnavailable','remediation'].includes(next.status)) throw new Error('LICENSED_PRACTICE_UNAVAILABLE');
          if (next.status === 'sourceUnavailable') render({...data, refreshMessage:'登録済み問題の出題準備中です。取り込み状況を確認してください。'});
          else render(next);
        } catch(e) {
          this.disabled = false;
          document.getElementById('licensedHelp').textContent = '過去問を開けませんでした。出題できる年度があるか確認してください。';
        }
      };
      var ack = document.getElementById('licensedAck');
      var progressBox = document.getElementById('licensedProgress');
      ack.onchange = async function(){
        if (!this.checked) return;
        this.disabled = true;
        progressBox.textContent = '許諾を確認しています。';
        try {
          var r = await callTool('confirmUploadRights', {sessionId: state.sessionId, year: 0, confirmed: true});
          if (!r || r.error || r.status !== 'uploadPermissionConfirmed' || !r.allYears) throw new Error('RIGHTS_CONFIRM_FAILED');
          licensedConsentSessionId = state.sessionId;
          progressBox.textContent = '確認済みです。「iPhone内のPDFを探す」から選ぶと、自動で取込み・登録します。';
        } catch(e) {
          ack.disabled = false;
          ack.checked = false;
          progressBox.textContent = '許諾確認を記録できませんでした。チェックを入れ直してください。';
          progressBox.setAttribute('role','alert');
        }
      };
      // ChatGPTのfileParamsをAIに選ばせる経路が拒否・失敗した場合も、利用者が
      // 自分で許可したファイルを同じ学習枠から選択できる。プラットフォームの安全判定は回避しない。
      var localPdfInput = document.getElementById('licensedLocalUpload');
      var localPickButton = document.getElementById('licensedLocalPick');
      var selectingPdf = false;
      function selectedPdfStatus(message, error){
        var node = document.getElementById('licensedFileStatus');
        if (!node) return;
        node.textContent = message;
        node.setAttribute('role', error ? 'alert' : 'status');
        node.classList.toggle('busy', selectingPdf && !error);
      }
      async function registerSelectedPdfs(selected){
        if (selectingPdf || locked || !state.sessionId) return;
        var sid = state.sessionId;
        // UIのチェックに加え、実際の送信APIでもサーバー側の権利確認を必須にする。
        if (licensedConsentSessionId !== sid) {
          selectedPdfStatus('先に利用許諾の確認にチェックを入れてください。', true);
          return;
        }
        var plan;
        try {
          plan = planLicensedUpload(selected, isHtmlAnswer, maxBatch);
        } catch(e) {
          selectedPdfStatus(String(e.message || '選択したPDFを確認できませんでした。'), true);
          return;
        }
        var host = window.openai || {};
        if (typeof host.getFileDownloadUrl !== 'function' ||
            typeof host.uploadFile !== 'function') {
          selectedPdfStatus('このChatGPT環境ではPDFを学習枠から送信できません。チャット欄（＋）で添付するか、対応するChatGPTアプリで再度お試しください。', true);
          return;
        }
        selectingPdf = true;
        if (localPdfInput) localPdfInput.disabled = true;
        if (localPickButton) localPickButton.setAttribute('aria-busy','true');
        var pickerText = document.getElementById('licensedLocalPickText');
        if (pickerText) pickerText.textContent = 'PDFを送信中…';
        selectedPdfStatus('PDFを送信中です。続けて登録・正答照合を行い、完了した年度を自動で表示します。', false);
        try {
          var refs = new Map();
          for (var i=0; i<plan.length; i++) {
            var group = plan[i];
            var groupFiles = [group.question, ...(group.answer ? [group.answer] : [])];
            for (var j=0; j<groupFiles.length; j++) {
              var file = groupFiles[j];
              if (refs.has(file)) continue;
              var up = await host.uploadFile(file);
              var fileId = up && (up.fileId || up.file_id);
              if (typeof fileId !== 'string' || !fileId) throw new Error('FILE_NOT_AUTHORIZED');
              var link = await host.getFileDownloadUrl({ fileId:fileId });
              var downloadUrl = link && link.downloadUrl;
              if (typeof downloadUrl !== 'string') throw new Error('FILE_URL_UNAVAILABLE');
              var parsed = new URL(downloadUrl);
              if (parsed.protocol !== 'https:') throw new Error('FILE_URL_UNAVAILABLE');
              refs.set(file, { file_id:fileId, file_name:String(file.name || file.fileName || file.file_name || ''),
                mime_type:'application/pdf', download_url:downloadUrl });
            }
          }
          if (locked || state.sessionId !== sid) throw new Error('SESSION_CHANGED');
          if (pickerText) pickerText.textContent = 'PDFを登録中…';
          selectedPdfStatus('PDFを登録・正答照合しています。完了した年度を自動で表示します。', false);
          // UI専用ツールはoutputTemplateを持たず、新しいチャット枠を作らない。
          var sent = await callTool('attachPdfBatchFromPicker', { sessionId:sid,
            questionPdfs:plan.map(function(p){return refs.get(p.question);}),
            ...(isHtmlAnswer ? {} : {answerPdfs:plan.map(function(p){return refs.get(p.answer);})}) });
          if (!sent || sent.error || sent.status !== 'attachedBatch' || sent.requested !== plan.length)
            throw new Error('IMPORT_NOT_ACCEPTED');
          if (Number(sent.failed) === plan.length) {
            var failed = Array.isArray(sent.results) ? sent.results.map(function(r){
              return (r.year || r.fileName || '選択ファイル') + '：' + (r.reason || r.code || '登録に失敗');
            }).join(' ／ ') : '登録できませんでした。';
            selectedPdfStatus('登録に失敗しました。' + failed + '。PDFの再添付は不要です。原因を確認してから再試行してください。', true);
            return;
          }
          render({...sent,sessionId:sid});
        } catch(e) {
          var code = String(e && (e.code || e.message) || '');
          selectedPdfStatus(code === 'SESSION_CHANGED'
            ? '学習セッションが変わりました。現在の学習画面で操作してください。'
            : 'ファイル送信が完了していません。ChatGPTによるファイルアクセス・送信許可が拒否された場合は、この画面からは送信できません。登録済み学習データは維持しています。', true);
        } finally {
          selectingPdf = false;
          if (localPdfInput && localPdfInput.isConnected) {
            localPdfInput.disabled = false;
            localPdfInput.value = '';
          }
          if (localPickButton && localPickButton.isConnected) localPickButton.setAttribute('aria-busy','false');
          if (pickerText && pickerText.isConnected) pickerText.textContent = 'iPhone内のPDFを探す';
          var fileStatus = document.getElementById('licensedFileStatus');
          if (fileStatus) fileStatus.classList.remove('busy');
        }
      }
      if (localPickButton) localPickButton.onclick = function(event){
        if (locked || selectingPdf) { event.preventDefault(); return; }
        if (licensedConsentSessionId !== state.sessionId) {
          event.preventDefault();
          selectedPdfStatus('先に利用許諾の確認にチェックを入れてください。', true);
        }
      };
      if (localPdfInput) localPdfInput.onchange = function(){
        var files = Array.from(this.files || []);
        if (!files.length) return;
        registerSelectedPdfs(files);
      };
      var licensedGeneration = licensedPollGeneration;
      var lastStatusKey = JSON.stringify([personal, readyDetails, pending, importing, failedImports, importRecords]);
      var licensedPollInFlight = false;
      var licensedNextDelay = 10000;
      async function updateLicensedStatus(){
        if (locked || licensedGeneration !== licensedPollGeneration || licensedPollInFlight) return;
        if (selectingPdf) { setTimeout(updateLicensedStatus, 1000); return; }
        licensedPollInFlight = true;
        try {
          var latest = await callTool('getOfficialLibrary', {sessionId: state.sessionId});
          if (locked || licensedGeneration !== licensedPollGeneration) return;
          if (!latest || latest.error || latest.status !== 'officialLibrary' || !latest.permissionedUpload)
            throw new Error('LIBRARY_REFRESH_FAILED');
          if (latest.uploadPermissionConfirmed) licensedConsentSessionId = state.sessionId;
          var check = document.getElementById('licensedAck');
          if (check && licensedConsentSessionId === state.sessionId) {
            check.checked = true; check.disabled = true;
            var progress = document.getElementById('licensedProgress');
            if (progress) progress.textContent = '確認済みです。「iPhone内のPDFを探す」から選ぶと、自動で取込み・登録します。';
          }
          var uploaded = Array.isArray(latest.personalUploadedYears) ? latest.personalUploadedYears : [];
          var staged = Array.isArray(latest.pendingOfficialAnswerYears) ? latest.pendingOfficialAnswerYears : [];
          var running = Array.isArray(latest.importingYears) ? latest.importingYears : [];
          var errors = Array.isArray(latest.failedYears) ? latest.failedYears : [];
          licensedNextDelay = running.length ? 8000 : staged.length ? 20000 : uploaded.length || errors.length ? 30000 : 15000;
          var statusKey = JSON.stringify([uploaded, latest.readyYearDetails, staged, running, errors, latest.importHistory]);
          if (!selectingPdf && statusKey !== lastStatusKey) { render({...data, ...latest, status:'sourceUnavailable'}); return; }
          var notice = document.getElementById('licensedAutoStatus');
          if (notice) notice.textContent = running.length ? 'PDFを解析しています。登録状況を自動更新しています。'
            : staged.length ? '公式正答の確認待ちです。確認できた年度から出題できます。'
            : uploaded.length ? '登録済みの年度があります。「公式過去問を解く」から進めます。'
            : 'まだ登録済み問題はありません。PDFの送信後に自動確認します。';
        } catch(err) {
          var notice = document.getElementById('licensedAutoStatus');
          if (notice) notice.textContent = '登録状況を取得できません。接続が戻れば自動で再確認します。';
        }
        licensedPollInFlight = false;
        if (!locked && licensedGeneration === licensedPollGeneration)
          setTimeout(updateLicensedStatus, licensedNextDelay);
      }
      setTimeout(updateLicensedStatus, 2500);
      bindEnd(); return;
    }
    if (data.status === 'sourceUnavailable') {
      var name = data.fieldName || '今の分野';
      var official = safeUrl(data.officialUrl);
      var library = data.sharedLibrary || null;
      var missing = library && Array.isArray(library.missing) ? library.missing : [];
      var ref = data.urlCatalog || null;
      var canAttach = !!data.sourceAttachmentSupported && (missing.length > 0 || !!ref);
      var isCustoms = data.qualificationName === '通関士';
      app.innerHTML = '<h2>公式過去問の利用・登録</h2>' +
        libraryHtml(library) +
        '<div class="notice" role="status">' + esc(data.notice || '利用できる公式問題を確認してください。') + '</div>' +
        (official ? '<div class="row"><a class="ov-a" target="_blank" rel="noopener" href="' + esc(official) + '">公式過去問掲載ページを開く ›</a></div>' : '') +
        (isCustoms ? '<div class="row"><button id="sourceCustoms2025" type="button">2025年度・通関士の公式PDFを取得して登録する</button></div>' +
          '<div class="notice" id="customsImportStatus" role="status">通関業法・関税法等・通関実務・別冊と公式正答を、税関の公開原本から取得します。過去のチャット添付をやり直す必要はありません。登録後、問題の解析・正答検証が必要です。</div>' : '') +
        '<div class="choices">' +
                    (canAttach ? '<button id="sourceAttach"><b>1</b><span>公式問題・正答PDFを登録する</span></button>' : '') +
          '<button id="sourceAiCheck"><b>' + (canAttach ? '2' : '1') + '</b><span>AI作成確認問題を解く（3問）</span></button></div>' +
          '<div class="row"><button id="sourceRefresh" class="quiet">過去問をもう一度確認する</button></div>' + endBar();
      if (isCustoms) document.getElementById('sourceCustoms2025').onclick = async function(){
        var button = this, status = document.getElementById('customsImportStatus');
        button.disabled = true;
        button.textContent = '公式PDFを取得しています…';
        status.textContent = '税関の公式問題・別冊・正答を取得し、原本を照合しています。登録できた年度のみ出題可能になります。';
        try {
          var result = await callTool('importOfficialCustoms2025', {sessionId:state.sessionId});
          if (!result || result.error || result.status !== 'attachedBatch') throw new Error(result?.error || 'IMPORT_FAILED');
          var errors = Array.isArray(result.results) ? result.results.filter(function(x){return x.status === 'failed';}) : [];
          status.textContent = '問題の解析開始：'+Number(result.queued||0)+'科目／別冊保存：'+Number(result.supplementStored||0)+'件／既存：'+Number(result.existing||0)+'件／失敗：'+Number(result.failed||0)+'件。' +
            (errors.length ? ' 未登録：'+errors.map(function(e){return (e.fileName||e.year||'PDF')+'：'+(e.reason||e.code||'確認できません');}).join(' ／ ') : '') +
            ' 受付だけでは出題可能になりません。出題可能になったらこの画面を自動更新します。';
          button.textContent = result.failed ? '失敗した公式PDFの取得を再試行する' : '公式PDFの登録状況を再確認する';
          // ChatGPTの追加メッセージを発生させず、同じ学習枠で公式過去問の準備完了を監視する。
          // 新しい操作・別セッション・枠の切替があれば直ちに監視を停止する。
          var receiptSession = state.sessionId;
          var generation = ++customsPollGeneration;
          async function checkCustomsReady(attempt){
            if (locked || generation !== customsPollGeneration || !status.isConnected || state.sessionId !== receiptSession) return;
            try {
              var next = await callTool('nextQuestion', {sessionId:receiptSession});
              if (locked || generation !== customsPollGeneration || !status.isConnected || state.sessionId !== receiptSession) return;
              if (next && !next.error && next.status === 'question' &&
                  /^q098:2025:/.test(String(next.question && next.question.questionId || ''))) {
                render(next); return;
              }
              if (next && next.error) throw new Error('STATUS_UNAVAILABLE');
              status.textContent = '登録・正答照合の状況を自動確認しています（'+(attempt+1)+'回目）。' +
                (next?.status === 'waiting' ? '公式問題を解析中です。' :
                 next?.status === 'sourceUnavailable' ? '検証済みの問題がまだありません。' :
                 '出題可能になるまで確認します。') +
                ' PDFの再添付は不要です。';
            } catch(err) {
              if (locked || generation !== customsPollGeneration || !status.isConnected) return;
              status.textContent = '登録状況の通信確認に失敗しました。学習履歴を保持し、自動で再確認します。';
            }
            if (attempt < 39 && !locked && generation === customsPollGeneration && status.isConnected)
              setTimeout(function(){checkCustomsReady(attempt+1);}, 6500);
            else if (status.isConnected && generation === customsPollGeneration)
              status.textContent = '登録状態の自動確認が続けられませんでした。「過去問をもう一度確認する」から現在の状態を再取得できます。';
          }
          checkCustomsReady(0);
        } catch(e) {
          status.textContent = '税関の公式PDFを登録できませんでした（'+String(e.message||'通信エラー')+'）。学習記録は変更していません。';
          status.setAttribute('role','alert');
          button.textContent = '公式PDFの取得を再試行する';
        } finally {button.disabled=false;}
      };
      document.getElementById('sourceRefresh').onclick = async function(){
        this.disabled = true;
        try {
          var latest = await callTool('getOfficialLibrary', { sessionId: state.sessionId });
          if (!latest || latest.error || latest.status !== 'officialLibrary') throw new Error('SHARED_LOOKUP_FAILED');
          // 共有年次一覧が変わらなくても、読み取れるパケットが復旧した可能性がある。
          // 保存状況を確認したら必ず同じセッションの現在問を再取得する。
          var next = await callTool('nextQuestion', { sessionId: state.sessionId });
          if (next && !next.error && next.status !== 'sourceUnavailable') { render(next); return; }
          render({ ...data, sharedLibrary: latest.sharedLibrary,
            notice: 'まだ利用できる公式問題を確認できません。公式PDFの登録、またはAI確認問題を選んでください。' });
        } catch(e) {
          this.disabled = false;
          app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">保存状況を確認できませんでした。もう一度押してください。</div>');
        }
      };
      if (canAttach) document.getElementById('sourceAttach').onclick = function(){
        // チャット添付をAIに転送させる経路は、AIが確認質問を返すと添付参照を失う。
        // 公式PDFは学習画面のファイル選択から直接、既存の登録APIへ送信する。
        this.disabled = true;
        app.insertAdjacentHTML('beforeend', '<section class="notice" id="sourceUploadPanel" role="region" aria-label="公式PDF登録">' +
          '<b>公式PDFを選んで登録</b>' +
          '<p>問題PDFと公式正答PDFをまとめて選んでください。1回に最大10ファイルです。PDFを選ぶと登録を開始します。会話での「はい」は不要です。</p>' +
          '<div class="row"><label class="file-picker"><span>iPhone内のPDFを探す</span><input id="sourceLocalUpload" type="file" accept=".pdf,application/pdf" multiple aria-label="iPhone内のPDFを探す"></label></div>' +
          '<div id="sourceUploadStatus" class="import-action-status" role="status">PDFの選択待ちです。</div>' +
          '<p>登録・公式正答との照合が完了した問題だけ出題できます。資料の受領だけでは出題可能になりません。</p>' +
          '</section>');
        var input = document.getElementById('sourceLocalUpload');
        var status = document.getElementById('sourceUploadStatus');
        var running = false;
        input.onchange = async function(){
          if (running) return;
          var selected = Array.from(input.files || []);
          if (!selected.length) return;
          if (selected.length > 10 || selected.some(function(f){return !/\\.pdf$/i.test(String(f.name || '')) || (f.type && f.type !== 'application/pdf');})){
            status.textContent = 'PDFのみ、最大10ファイルを選んでください。';
            status.setAttribute('role','alert'); return;
          }
          var host = window.openai || {};
          if (typeof host.uploadFile !== 'function' || typeof host.getFileDownloadUrl !== 'function') {
            status.textContent = 'この環境では学習画面からPDFを送信できません。対応するChatGPTアプリで開いてください。';
            status.setAttribute('role','alert'); return;
          }
          running = true; input.disabled = true;
          status.textContent = 'PDFを送信しています。登録が完了するまで出題可能とは表示しません。';
          try {
            var refs = [];
            for (var f of selected) {
              var uploaded = await host.uploadFile(f);
              var fileId = uploaded && (uploaded.fileId || uploaded.file_id);
              if (typeof fileId !== 'string' || !fileId) throw new Error('FILE_UPLOAD_FAILED');
              var link = await host.getFileDownloadUrl({fileId:fileId});
              var downloadUrl = link && link.downloadUrl;
              if (typeof downloadUrl !== 'string' || new URL(downloadUrl).protocol !== 'https:') throw new Error('FILE_URL_UNAVAILABLE');
              refs.push({file_id:fileId,file_name:String(f.name),mime_type:'application/pdf',download_url:downloadUrl});
            }
            var answerMatch = function(f){return /正答|正解|解答|seikai|answer|correct|配点/i.test(f.file_name);};
            var answerPdfs = refs.filter(answerMatch);
            var questionPdfs = refs.filter(function(f){return !answerMatch(f);});
            if (!questionPdfs.length) throw new Error('QUESTION_PDF_REQUIRED');
            status.textContent = '登録・正答照合を開始しています。完了した年度から利用できます。';
            var result = await callTool('attachPdfBatchFromPicker',{sessionId:state.sessionId,questionPdfs:questionPdfs,answerPdfs:answerPdfs});
            if (!result || result.error || result.status !== 'attachedBatch') throw new Error(result?.error || 'REGISTER_FAILED');
            var errors = Array.isArray(result.results) ? result.results.filter(function(x){return x.status === 'failed';}) : [];
            var partial = Number(result.queued || 0) + Number(result.existing || 0);
            status.textContent = '受付：'+result.requested+'件／解析開始：'+Number(result.queued||0)+'件／既存：'+Number(result.existing||0)+'件／要確認：'+Number(result.pendingOfficialAnswer||0)+'件／失敗：'+Number(result.failed||0)+'件。' +
              (errors.length ? ' 未登録の理由：'+errors.map(function(x){return (x.fileName||x.year||'PDF')+'：'+(x.reason||x.code||'確認できません');}).join(' ／ ') : '') +
              (partial ? ' 公式正答との検証が完了するまで出題しません。' : ' 再添付を要求せず、失敗理由を確認してください。');
            var refresh = document.getElementById('sourceRefresh');
            if (refresh && partial) {
              // 状況だけを更新。次問へ勝手に進めたり、新しい学習枠を生成しない。
              refresh.textContent = '登録状況を確認する';
            }
          } catch(e) {
            status.textContent = 'エンジンへ登録できませんでした（'+String(e.message||'通信エラー')+'）。チャットでの受領と登録は別です。';
            status.setAttribute('role','alert');
          } finally {running=false;input.disabled=false;input.value='';}
        };
      };
      document.getElementById('sourceAiCheck').onclick = async function(){
        this.disabled = true;
        try {
          var chosen = await callTool('chooseItem', { sessionId: state.sessionId, fieldName: name, mode: 'check' });
          if (!chosen || chosen.error || chosen.status !== 'item') throw new Error('ITEM_NOT_RECORDED');
          if (preparedLessons[name]) {
            render({status:'confirmation_pending',sessionId:state.sessionId,fieldName:name,
              position:1,total:3,journey:chosen.journey});
          } else {
            app.innerHTML = journeyBar(chosen.journey && chosen.journey.fieldIndex, chosen.journey && chosen.journey.fieldTotal, 'check1', name) +
              localBar('この分野のAI作成確認問題', 1, 3) +
              '<div class="notice">AIが作成する問題です。公式過去問ではありません。</div>' + endBar();
            bindEnd();
            ask(name + 'を確認問題から始めます。');
          }
        } catch(e) {
          var retry = document.getElementById('sourceAiCheck');
          if (retry) retry.disabled = false;
          app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">確認問題を始められませんでした。もう一度押してください。</div>');
        }
      };
      bindEnd(); return;
    }
    if (data.status === 'reviewEmpty') {
      app.innerHTML = '<div class="notice">' + esc(data.notice || '間違えた問題はまだありません。') + '</div>' +
        '<div class="row"><button id="reviewNext">次の公式過去問へ</button></div>' + endBar();
      document.getElementById('reviewNext').onclick = function(){ nextBelow(function(){ return callTool('nextQuestion', { sessionId: state.sessionId }).then(render); }); };
      bindEnd(); return;
    }
    if (data.status === 'waiting' || data.status === 'finished') {
      // 待つ間・解き終えたときも、次にできることをボタンで出す（番号の選択肢の文は出さない）
      var waiting = data.status === 'waiting';
      var wh = '<div class="stem">' + esc(data.notice || (data.status === 'finished' ? '取り込んだ過去問をすべて解きました。' : '問題を準備しています。')) + '</div>';
      if (data.attachNotice) wh += '<div class="notice">' + esc(data.attachNotice) + '</div>';
      if (!waiting) wh += '<div class="notice">登録済みの実践問題が終了しました。別の対応年度を追加する場合は「過去問の追加・登録状況」で確認してください。後日の復習だけなら、今すぐの追加は必須ではありません。</div>';
      wh += '<div class="row">' + (waiting ? '<button id="wProg">取り込みの進み具合を確認する</button><button id="wExp">今の分野の解説を読む</button><button id="wChk">今の分野の確認問題を解く</button>' : '<button id="wRev">総復習（間違えた問題）</button>') + '</div>' + endBar();
      app.innerHTML = wh;
      var wb = function(idn, fn){ var el = document.getElementById(idn); if (el) el.onclick = fn; };
      wb('wProg', async function(){ render(await callTool('nextQuestion', { sessionId: state.sessionId })); });
      wb('wRev', async function(){ render(await callTool('nextQuestion', { sessionId: state.sessionId, question: '総復習' })); });
      wb('wExp', function(){ ask((studyField || '今の分野') + 'の解説をお願いします。'); });
      wb('wChk', function(){ ask((studyField || '今の分野') + 'の確認問題（AIが作った問題）を出してください。'); });
      bindEnd();
      return;
    }
    if (!data.question) {
      // 予期しない状態を「問題を準備中」「総復習」扱いにしない。
      // 利用者が学習画面を再取得できるよう、次の問題を勝手に進めず回復経路を残す。
      var hasSession = !!(data.sessionId || state.sessionId);
      var msg = data.status === 'needPlan'
        ? '試験概要・免除・学習状況の画面をまだ表示できていません。'
        : '学習画面の表示内容を取得できませんでした。';
      app.innerHTML = '<div class="notice" role="alert">' + esc(msg) + '</div>' +
        (hasSession ? '<div class="row"><button id="loadCurrentStudy">現在の学習画面を再取得する</button></div>' : '') +
        (hasSession ? endBar() : '<div class="notice">「宅建」など、学習する資格名を送って開始してください。</div>');
      var load = document.getElementById('loadCurrentStudy');
      if (load) load.onclick = function(){ nextBelow(function(){ return callTool('nextQuestion', { sessionId: state.sessionId }).then(function(v){
        if (!v || v.error || (!v.question && !v.onboarding && !v.notice && !['waiting','finished','sourceUnavailable','restoreIdle','remediation'].includes(v.status))) throw new Error('STUDY_VIEW_UNAVAILABLE');
        render(v);
      }); }); };
      bindEnd(); return;
    }
    if (data.fieldChanged && !data.explicitQuestion && !data.repeated && data.question.kind === 'new' && !data.itemAsked && (studyLid || state.sessionId)) {
      app.innerHTML = '<div class="notice"><b>' + esc(data.fieldNotice || '分野が変わります') + '</b></div>';
      var moved = Object.assign({}, data, { itemAsked: true });
      itemMenu(data.question.fieldName || '', studyLid || state.sessionId, function(){ studyField = data.question.fieldName || studyField; render(moved); });
      return;
    }
    var q = data.question; state.question = q; state.answered = false;
    var h = '';
    var p = q.progress;
    if (p && Number.isInteger(p.position) && Number.isInteger(p.total) && p.total > 0) {
      h += journeyBar(p.fieldIndex, p.fieldTotal, 'practice' + Math.min(3, p.fieldQuestion || 1), q.fieldName);
      if (p.fieldQuestion) h += localBar('この分野の実践問題', Math.min(3, p.fieldQuestion), 3);
      h += '<div class="notice">全分野の実践問題：解答済み ' + esc(p.done) + ' / ' + esc(p.total) + '問' + (p.review ? '（復習中）' : '') + '</div>';
      // 取込は回答を遮らない。登録済み問題が残り少ないときだけ控えめに案内する。
      if (!p.review && Number.isInteger(p.done) && p.total - p.done <= 3 && p.total > 3) {
        h += '<div class="notice">登録済みの実践問題が残り少なくなりました。今の問題を解き終えた後、「過去問の追加・登録状況」で利用できる年度を確認できます。追加は任意です。</div>';
      }
    }
    h += '<h2>' + esc((q.year ? q.year + '年度 ' : '') + (q.section === '午前の部' || q.section === '午後の部' ? q.section + ' ' : '') + '問' + q.questionNumber) + '</h2>';
    if (!data.restored) h += sourceManagerBar();
    if (data.fieldNotice) h += '<div class="notice"><b>' + esc(data.fieldNotice) + '</b></div>';
    if (q.fieldName) h += '<div class="field">' + esc(q.fieldName) + '</div>';
    if (q.kind === 'reinforce') h += '<div class="notice"><b>補強確認：</b>この分野を続けて間違えたので、次の問題へ進む前に、同じ分野の過去問でもう一度確かめます。</div>';
    if (q.stem) h += '<div class="stem">' + stemHtml(q.stem) + '</div>';
    (q.figureUrls || []).forEach(function(u, i){ if (safeUrl(u)) h += figureHtml(u, i); });
    if (/^land_surveyor:/.test(String(q.questionId || ''))) {
      h += '<div class="row"><button id="descriptiveMenuStart">記述式（午前11・午後21/22）を開く</button></div>';
    }
    h += '<div class="choices">' + (q.choices || []).map(function(c, i){ var n = i + 1; return '<label class="opt" data-n="' + n + '"><input type="radio" name="ans" value="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';
    h += '<div class="row"><label><input type="checkbox" id="guess"> 勘で選んだ</label><button type="button" id="dk">分からない</button><button type="button" id="skip">スキップ</button></div><div class="row" id="decrow" style="display:none"><button type="button" id="decide">解答する</button></div><div id="answerProgress" class="notice" role="status" aria-live="polite" style="display:none"></div>';
    if (safeUrl(q.questionPdfUrl) && !String(q.questionPdfUrl).includes('/v1/private-source/')) h += '<div class="notice">原本：<a href="' + esc(safeUrl(q.questionPdfUrl)) + '" target="_blank" rel="noopener">公式の問題PDF</a></div>';
    (q.notices || []).forEach(function(t){ h += '<div class="notice">' + esc(t) + '</div>'; });
    app.innerHTML = h;
    // 再開直後の未回答問では、その場から学習を終了できるようにする。
    if (data.restored) app.insertAdjacentHTML('beforeend', endBar());
    bindFigures();
    scrollUp();
    bindEnd();
    var descButton = document.getElementById('descriptiveMenuStart');
    if (descButton) descButton.onclick = function(){ showDescriptiveMenu(q.year); };
    // iPhone の再描画・タップイベントで一時変数が失われても、checked の実値から採点する。
    app.querySelectorAll('input[name=ans]').forEach(function(r){ r.onchange = function(){
      var row = document.getElementById('decrow');
      if (row) row.style.display = 'flex';
    }; });
    var existingChoice = app.querySelector('input[name=ans]:checked');
    if (existingChoice) document.getElementById('decrow').style.display = 'flex';
    document.getElementById('decide').onclick = function(){
      var selected = app.querySelector('input[name=ans]:checked');
      if (selected) answer(selected.value);
      else {
        var status = document.getElementById('answerProgress');
        if (status) { status.style.display = 'block'; status.textContent = '解答番号を選んでください。'; }
      }
    };
    document.getElementById('skip').onclick = function(){ answer('スキップ'); };
    document.getElementById('dk').onclick = function(){ answer('分からない'); };
  }
  function showDescriptiveMenu(year){
    year = Number(year) || 2025;
    app.innerHTML = '<h2>土地家屋調査士｜記述式問題</h2>' +
      '<div class="notice">記述式は自動採点しません。午前・午後の択一式の成績にも加えません。</div>' +
      '<label for="descriptiveYear">年度</label><select id="descriptiveYear">' +
      [2025,2024,2023,2022].map(function(y){return '<option value="' + y + '"' + (year === y ? ' selected' : '') + '>' + y + '年度</option>';}).join('') + '</select>' +
      '<div class="choices"><button data-desc="11">午前の部・問11（記述式）</button>' +
      '<button data-desc="21">午後の部・問21（土地）</button>' +
      '<button data-desc="22">午後の部・問22（建物）</button></div>' +
      '<div id="descriptiveError" class="notice" aria-live="polite"></div>' + endBar();
    app.querySelectorAll('button[data-desc]').forEach(function(button){
      button.onclick = async function(){
        var number = Number(button.getAttribute('data-desc'));
        var y = Number(document.getElementById('descriptiveYear').value);
        button.disabled = true;
        var error = document.getElementById('descriptiveError');
        error.textContent = '公式原本から問題を読み込んでいます…';
        try {
          var d = await callTool('openDescriptiveQuestion', {
            sessionId: state.sessionId, year: y,
            section: number === 11 ? '午前の部' : '午後の部', number: number
          });
          if (!d || d.error || d.status !== 'descriptiveQuestion') throw new Error('DESCRIPTIVE_SOURCE_UNAVAILABLE');
          render(d);
        } catch(e) {
          button.disabled = false;
          error.textContent = '公式原本を検証して表示できませんでした。同じボタンで再試行できます。';
        }
      };
    });
    bindEnd(); scrollUp();
  }

  // 古いメッセージの画面を押して最新の問題を動かさない。
  // storageイベントが利用可能な画面同士では、最新操作画面の出現と同時に旧ボタンを隠す。
  var descriptiveScreen = null;
  function descriptiveStorageKey(sid){ return 'qlp_current_descriptive_' + String(sid || ''); }
  function obsoleteDescriptive(){
    descriptiveScreen = null;
    lockOld();
  }
  function descriptiveIsNewer(other, current){
    return other && current && other.sessionId === current.sessionId &&
      (Number(other.shownAt) > Number(current.shownAt) ||
       (Number(other.shownAt) === Number(current.shownAt) &&
        (other.questionId !== current.questionId || other.role === 'actions' && current.role !== 'actions')));
  }
  function publishDescriptive(q, role){
    var item = { sessionId: state.sessionId, questionId: q.questionId,
      shownAt: Number(q.shownAt) || 0, role: role };
    descriptiveScreen = item;
    try {
      var key = descriptiveStorageKey(state.sessionId);
      var prior = JSON.parse(localStorage.getItem(key) || 'null');
      if (descriptiveIsNewer(prior, item)){ obsoleteDescriptive(); return false; }
      localStorage.setItem(key, JSON.stringify(item));
    } catch(e){}
    return true;
  }
  try { window.addEventListener('storage', function(event){
    if (!descriptiveScreen || event.key !== descriptiveStorageKey(descriptiveScreen.sessionId) || !event.newValue) return;
    try {
      var newer = JSON.parse(event.newValue);
      if (descriptiveIsNewer(newer, descriptiveScreen)) obsoleteDescriptive();
    } catch(e){}
  }); } catch(e){}
  async function requireCurrentDescriptive(q){
    try {
      var live = await callTool('verifyCurrentDescriptive', {
        sessionId: state.sessionId, questionId: q.questionId, shownAt: Number(q.shownAt) || 0
      });
      if (live && live.status === 'descriptiveCurrentVerified' &&
          live.questionId === q.questionId && Number(live.shownAt) === Number(q.shownAt)) return true;
    } catch(e){}
    obsoleteDescriptive();
    return false;
  }
  async function goDescriptiveNext(q){
    if (!await requireCurrentDescriptive(q)) return;
    var n = q.number === 11 ? 21 : q.number === 21 ? 22 : 11;
    var y = Number(q.year) || 2025;
    try {
      var v = await callTool('openDescriptiveQuestion', {
        sessionId: state.sessionId, year: y, section: n === 11 ? '午前の部' : '午後の部', number: n
      });
      if (!v || v.error || v.status !== 'descriptiveQuestion') throw new Error('DESCRIPTIVE_NEXT_FAILED');
      render(v);
    } catch(e){ app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">次の記述式を開けませんでした。もう一度操作してください。</div>'); }
  }
  function bindDescriptiveNavigation(q){
    var next = document.getElementById('nextDescriptive');
    if (next) next.onclick = function(){ goDescriptiveNext(q); };
    var back = document.getElementById('backDescriptive');
    if (back) back.onclick = async function(){
      if (await requireCurrentDescriptive(q)) showDescriptiveMenu(q.year);
    };
    var mcq = document.getElementById('returnMcq');
    if (mcq) mcq.onclick = async function(){
      if (!await requireCurrentDescriptive(q)) return;
      nextBelow(function(){ return callTool('nextQuestion', { sessionId: state.sessionId, question: '択一式に戻る' }).then(render); });
    };
  }
  function descriptiveMenuButtons(){
    return '<div class="row"><button id="nextDescriptive">次の記述式へ</button>' +
      '<button id="backDescriptive">年度・問題を選び直す</button>' +
      '<button id="returnMcq">択一式に戻る</button></div>';
  }
  // 解説の「下」に表示する。原本本文・表・図のデータをここでは受け取らない。
  function showDescriptiveActions(d){
    var q = d.question || {};
    state.question = null; state.answered = false;
    var withExplanation = typeof d.explanationMarkdown === 'string' && !!d.explanationMarkdown.trim();
    app.innerHTML = '<h2>' + (withExplanation ? 'AI参考解答・解説' : '解説後の操作') + '｜' + esc(q.year) + '年度 ' + esc(q.section) +
      ' 問' + esc(q.number) + '</h2>' +
      (withExplanation ? '<div class="notice">AIによる参考解説です。公式模範解答としての採点は行いません。</div>' +
        '<section class="descriptive-explanation" aria-label="AI参考解説">' + explanationHtml(d.explanationMarkdown) + '</section>' : '') +
      '<div class="descriptive-actions"><div class="notice">' +
      (withExplanation ? '解説はここまでです。続ける操作を選んでください。' : '現在の問題の操作パネルです。') + '</div>' +
      descriptiveMenuButtons() + endBar() + '</div>';
    if (!publishDescriptive(q, 'actions')) return;
    scrollUp(); bindEnd(); bindDescriptiveNavigation(q);
  }
  function showDescriptiveQuestion(d){
    var q = d.question || {};
    state.question = null; state.answered = false;
    var label = String(q.year || '') + '年度 ' + (q.section || '') + ' 問' + String(q.number || '');
    var already = d.status === 'descriptiveReveal';
    if (already){
      // 解説の前に問題や図をもう一度表示しない。AIは保存済み原本を別経路から取得できる。
      app.innerHTML = '<h2>' + esc(label) + '｜解説へ</h2>' +
        '<div class="notice" role="status">元の問題を繰り返さず、AI参考解説をこの下の会話に表示します。操作パネルはAIが取得できた場合にのみ表示されます。表示されない場合は解説末尾の番号選択肢を利用してください。</div>' +
        '<div class="notice">【操作パネルが下に出ない場合】解説の末尾で番号を返信して進むか、ここまで上に戻って下のボタンを押してください。</div>' +
        '<div class="row"><button id="fallbackDescriptiveActions">解説後の操作パネルを開く（上に戻った場合）</button></div>';
      if (!publishDescriptive(q, 'reveal')) return;
      scrollUp();
      document.getElementById('fallbackDescriptiveActions').onclick = async function(){
        this.disabled = true;
        try {
          if (!await requireCurrentDescriptive(q)) return;
          var response;
          try { response = await callTool('getDescriptiveActions', { sessionId: state.sessionId, questionId: q.questionId }); } catch (_) { /* older app connector: use nextQuestion */ }
          if (!response || response.status !== 'descriptiveActions') {
            response = await callTool('nextQuestion', { sessionId: state.sessionId, question: '記述式解説後の操作メニュー:' + q.questionId });
          }
          if (!response || response.status !== 'descriptiveActions') throw new Error('ACTIONS_UNAVAILABLE');
          render(response);
        } catch(e){
          var old = document.getElementById('fallbackDescriptiveActions'); if(old) old.disabled = false;
          app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">操作パネルを取得できませんでした。会話で「今の問題の操作メニューを表示」と入力してください。</div>');
        }
      };
      return;
    }
    var blocks = (q.layout || []).map(descriptiveBlockHtml).join('');
    var h = '<h2>' + esc(label) + '</h2>' +
      '<div class="notice">記述式・採点なし。択一式の正答率には加えません。</div>' +
      '<details class="descriptive-source" id="descriptiveSource" open>' +
      '<summary>問題文・表・図</summary>' +
      (blocks || '<div class="notice" role="alert">問題・表・図の照合が必要です。出題を停止してください。</div>') + '</details>';
    if (safeUrl(q.sourceUrl) && !String(q.sourceUrl).includes('/v1/private-source/')) h += '<div class="notice">原本：<a href="' + esc(safeUrl(q.sourceUrl)) + '" target="_blank" rel="noopener">' + (String(q.sourceUrl).includes('izuki.net/') ? '過去問保存版PDFを開く' : '公式の問題PDFを開く') + '</a></div>';
    h += '<div class="notice">公式模範解答は確認できていません。AIの参考解答は自動採点しません。</div>';
    if (blocks) h += '<div class="row"><button id="showDescriptiveSolution">解答・解説を表示（AI参考解答）</button></div>';
    h += '<div class="notice">解説を表示した後は、解説の下にある最新の操作パネルを使用してください。見当たらない場合は上に戻る必要があります。</div>';
    h += descriptiveMenuButtons() + endBar();
    app.innerHTML = h;
    if (!publishDescriptive(q, 'question')) return;
    scrollUp(); bindFigures(); bindEnd(); bindDescriptiveNavigation(q);
    var answer = document.getElementById('showDescriptiveSolution');
    if (answer) answer.onclick = async function(){
      answer.disabled = true;
      try {
        if (!await requireCurrentDescriptive(q)) return;
        var response = await callTool('revealDescriptiveAnswer', { sessionId: state.sessionId, questionId: q.questionId });
        if (!response || response.error || response.status !== 'descriptiveReveal' ||
            response.question?.questionId !== q.questionId) throw new Error('DESCRIPTIVE_REVEAL_NOT_CONFIRMED');
        render(response);
        var isLand = q.number === 11 || q.number === 21;
        await ask(label + 'の参考解答・解説を表示してください。原本の資料で検証し、公式模範解答とは区別してください。自動採点はしないでください。',
          isLand ? label + 'のAI参考解答・解説をお願いします。土地の座標計算は三角関数と複素数の両方で示し、結果を照合してください（自動採点なし）。' :
            label + 'の建物のAI参考解答・解説をお願いします。不要な三角関数・複素数の座標計算を加えないでください（自動採点なし）。');
      } catch(e){
        var err = document.getElementById('descriptiveRevealError');
        if (!err) app.insertAdjacentHTML('beforeend','<div class="notice" id="descriptiveRevealError" role="alert"></div>');
        document.getElementById('descriptiveRevealError').textContent = '参考解説を依頼できませんでした。もう一度「参考解答を表示」と送ってください。';
        if (answer.isConnected) answer.disabled = false;
      }
    };
  }
  // 正答はツールの結果にもチャットにも含めず、登録済み問題IDと利用者回答だけをエンジンに渡す。
  function showConfirmationQuestion(d){
    var j = d.journey || {};
    app.innerHTML = journeyBar(j.fieldIndex, j.fieldTotal, 'check' + d.position, d.fieldName) +
      localBar('この分野の確認問題', d.position, 3) +
      '<h2>' + esc(d.fieldName) + '｜確認問題・第' + esc(d.position) + '問</h2>' +
      '<div class="notice">理解度を確かめる練習問題です（公式過去問ではありません）。</div>' +
      '<div class="stem">' + esc(d.question) + '</div><div class="choices">' +
      (d.choices || []).map(function(c,i){ return '<label class="opt"><input type="radio" name="confirmationAnswer" value="' + (i+1) + '"><b>' + (i+1) + '</b><span>' + esc(c) + '</span></label>'; }).join('') +
      '</div><div class="row"><button id="submitConfirmation" disabled>解答する</button></div>' + endBar();
    scrollUp(); bindEnd();
    app.querySelectorAll('input[name=confirmationAnswer]').forEach(function(x){ x.onchange = function(){ document.getElementById('submitConfirmation').disabled = false; }; });
    document.getElementById('submitConfirmation').onclick = async function(){
      var picked = app.querySelector('input[name=confirmationAnswer]:checked'); if (!picked) return;
      this.disabled = true;
      try {
        var out = await callTool('answerConfirmationQuestion', { sessionId: state.sessionId, challengeId: d.challengeId, selected: picked.value });
        if (!out || out.error || out.status !== 'confirmation_result') throw new Error('CONFIRMATION_RESULT_MISSING');
        render(out);
      } catch (e) { this.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">採点できませんでした。このボタンで再試行してください。</div>'); }
    };
  }
  function showConfirmationResult(d){
    var j = d.journey || {};
    app.innerHTML = journeyBar(j.fieldIndex, j.fieldTotal, 'check' + d.position, d.fieldName) +
      '<h2>確認問題 ' + esc(d.position) + ' / 3問の結果</h2>' + (d.restored ? '<div class="result ok">3問の回答を完了しています</div>' : '<div class="result ' + (d.correct ? 'ok' : 'ng') + '">' + (d.correct ? '正解' : '不正解') + '</div>') +
      (d.restored ? '<div class="stem">3問中 ' + esc(d.correctCount) + '問正解。次の学習を選べます。</div>' : '<div class="stem">正答：' + esc(d.correctAnswer) + '　現在 ' + esc(d.correctCount) + ' / 3問正解</div>' +
        '<section class="stem confirmation-summary" aria-label="採点後の簡易解説"><b>■簡易解説</b>' +
        (d.explanation ? '<p>' + esc(d.explanation).replace(/\\n/g,'<br>') + '</p>' :
          '<p>正答は「' + esc(d.correctChoice || ('選択肢 ' + d.correctAnswer)) + '」です。' +
          'この問題には理由の保存がありません。次の問題からは解説も登録します。</p>') + '</section>') +
      (d.complete ? '<h2>次の学習を選択</h2><div class="choices"><button id="confirmationPractice"><b>1</b><span>同じ分野の公式過去問を解く</span></button>' +
        (d.nextFieldName ? '<button id="confirmationNextField"><b>2</b><span>次の分野の学習へ</span></button>' : '') +
        '<button id="confirmationReview"><b>' + (d.nextFieldName ? 3 : 2) + '</b><span>今回の分野を詳しく復習</span></button><button id="confirmationWrong"><b>' + (d.nextFieldName ? 4 : 3) + '</b><span>間違えた問題を総復習</span></button></div>' + endBar() :
        '<div class="row"><button id="confirmationNext">次の確認問題へ（残り ' + esc(3-d.position) + '問）</button></div>' + endBar());
    scrollUp(); bindEnd();
    if (!d.complete) document.getElementById('confirmationNext').onclick = function(){
      this.disabled = true;
      // UIを先に同じ学習枠の待機画面へ遷移させる。モデルが返らなくても再依頼できる。
      var nextPosition = Number(d.position) + 1;
      render({ status: 'confirmation_pending', sessionId: state.sessionId,
        fieldName: d.fieldName, position: nextPosition, total: 3,
        journey: d.journey, notice: '第' + nextPosition + '問を登録します。同じ枠に表示します。' });
      if (!preparedLessons[d.fieldName])
        ask(d.fieldName + 'の確認問題の次の1問を作成し、registerConfirmationQuestionに本文・選択肢・固定した正答を登録してください。画面に第' + nextPosition + '問/全3問が出るまで待ってください。',
          d.fieldName + 'の確認問題・第' + nextPosition + '問を作成して学習画面に登録する');
    };
    else {
      var openPractice = async function(b, target){
        b.disabled = true;
        try {
          var chosen = await callTool('chooseItem', { sessionId: state.sessionId, fieldName: target, mode: 'practice' });
          if (!chosen || chosen.error || chosen.status !== 'item') throw new Error('ITEM_UNAVAILABLE');
          var next = await callTool('nextQuestion', { sessionId: state.sessionId, question: target });
          if (!next || next.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(next.status)) throw new Error('NEXT_UNAVAILABLE');
          render(next);
        } catch (e) { b.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">実践問題へ進めませんでした。このボタンで再試行してください。</div>'); }
      };
      document.getElementById('confirmationPractice').onclick = function(){ openPractice(this, d.fieldName); };
      if (d.nextFieldName) document.getElementById('confirmationNextField').onclick = function(){
        app.innerHTML = '<div class="notice">次は「' + esc(d.nextFieldName) + '」です。学習方法を選んでください。</div>';
        itemMenu(d.nextFieldName, state.sessionId, async function(){
          var next = await callTool('nextQuestion', {sessionId:state.sessionId});
          if (!next || next.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(next.status)) throw new Error('NEXT_FIELD_UNAVAILABLE');
          render(next);
        });
      };
      document.getElementById('confirmationReview').onclick = function(){ ask(d.fieldName + 'を詳しく復習します。解説を表示してください。', '今回の分野を詳しく復習'); };
      document.getElementById('confirmationWrong').onclick = async function(){
        this.disabled = true;
        try { var r = await callTool('nextQuestion', { sessionId: state.sessionId, question: '総復習（間違えた問題）' });
          if (r?.status === 'reviewEmpty') { this.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc(r.notice) + '</div>'); return; }
          if (!r || r.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(r.status)) throw new Error('REVIEW_UNAVAILABLE'); render(r);
        } catch (e) { this.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">総復習を開始できませんでした。このボタンで再試行してください。</div>'); }
      };
    }
  }
  function showRemediationQuestion(d){
    if (d.sessionId) state.sessionId = d.sessionId;
    var h = '<h2>AI作成確認問題</h2><div class="notice">理解度を確かめる練習問題です（公式過去問ではありません）。</div>' +
      '<div class="stem">' + esc(d.question || '') + '</div><div class="choices" id="remediationChoices">' +
      (d.choices || []).map(function(c,i){
        var n = String(i+1);
        return '<label class="opt"><input type="radio" name="remediationAnswer" value="'+n+'"><b>'+n+'</b><span>'+esc(c)+'</span></label>';
      }).join('') + '</div>' +
      '<div class="row"><button id="submitRemediation" disabled>解答する</button></div>' + endBar();
    app.innerHTML=h; scrollUp(); bindEnd();
    app.querySelectorAll('input[name=remediationAnswer]').forEach(function(el){ el.onchange=function(){
      var b = document.getElementById('submitRemediation'); if(b)b.disabled=false;
    };});
    document.getElementById('submitRemediation').onclick=async function(){
      var choice=app.querySelector('input[name=remediationAnswer]:checked');
      if(!choice)return;
      this.disabled=true;
      try {
        var out=await callTool('completeRemediation',{
          sessionId:state.sessionId,challengeId:d.challengeId,selected:choice.value
        });
        if(!out||out.error||!['remediation_retry','remediation_complete'].includes(out.status))throw new Error('REMEDIATION_RESULT_MISSING');
        render(out);
      }catch(e){
        var b=document.getElementById('submitRemediation');if(b)b.disabled=false;
        app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">答え合わせできませんでした。同じ解答ボタンで再試行してください。</div>');
      }
    };
  }
  // 学習の終了：終了ログと引継ぎデータの全文を、そのまま出す（コピーできる）
  function showEnd(d){
    app.innerHTML = '<h2>学習を終了しました</h2><div class="stem">' + esc(d.log || '') + '</div><div class="notice">別の年度の公式過去問を追加するなら、次回の学習開始時に「過去問の追加・登録状況」から確認できます。登録は任意です。現在の解答・復習記録は引継ぎIDに保持されています。</div><h2>引継ぎデータ</h2><div class="notice">次のチャットで貼り付けるか、引継ぎIDを伝えると再開できます。</div><textarea id="ho" readonly rows="10" style="width:100%;box-sizing:border-box;font:13px/1.5 monospace;background:var(--btn);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px"></textarea><div class="row"><button id="cp">引継ぎデータをコピー</button></div>';
    var ta = document.getElementById('ho'); ta.value = d.handoff;
    document.getElementById('cp').onclick = function(){
      var b = document.getElementById('cp');
      var done = function(){ b.textContent = 'コピーしました'; };
      try { navigator.clipboard.writeText(d.handoff).then(done, function(){ ta.select(); document.execCommand('copy'); done(); }); }
      catch (e) { ta.select(); try { document.execCommand('copy'); } catch (e2) {} done(); }
    };
  }
  // 番号で選ぶ確認は、押せるボタンで出す（押したら結果の1行に縮め、選んだ内容をチャットに送る）
  // 簡易の Markdown 表示（見出し・太字・箇条書き・表）。解説の本文を、ボタンと同じ枠に出すために使う
  function md(src){
    // モデルが旧指示に従ってSVGコードを返しても、タグを利用者の画面に大量表示しない。
    var source = String(src == null ? '' : src).replace(/<svg\\b[\\s\\S]*?<\\/svg\\s*>/gi, '\\n※図解の表示形式が対応していないため、図は省略しました。以下の表と説明をご覧ください。\\n');
    var lines = source.split('\\n'), out = [], i = 0, list = null;
    var inl = function(t){ return esc(t).replace(/\\*\\*(.+?)\\*\\*/g, '<b>$1</b>').replace(/\\x60(.+?)\\x60/g, '<code>$1</code>').replace(/\\[([^\\]]+)\\]\\((https:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|[^"=>])(https:\\/\\/[^\\s<)"]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>'); };
    var closeList = function(){ if (list) { out.push('</' + list + '>'); list = null; } };
    var cells = function(r){ return r.trim().replace(/^\\|/, '').replace(/\\|$/, '').split('|').map(function(c){ return c.trim(); }); };
    while (i < lines.length) {
      var l = lines[i];
      if (/^\\s*\\|/.test(l) && i + 1 < lines.length && /^\\s*\\|?\\s*:?-{2,}/.test(lines[i + 1])) {
        closeList();
        var head = cells(l), rows = []; i += 2;
        while (i < lines.length && /^\\s*\\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="md-t"><table><thead><tr>' + head.map(function(c){ return '<th>' + inl(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + inl(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      var hd = /^#{1,4}\\s+(.*)$/.exec(l);
      if (hd) { closeList(); out.push('<h3>' + inl(hd[1]) + '</h3>'); i++; continue; }
      var li = /^\\s*(?:[-*・]|\\d+[.)．])\\s+(.*)$/.exec(l);
      if (li) { var kind = /^\\s*\\d/.test(l) ? 'ol' : 'ul'; if (list !== kind) { closeList(); list = kind; out.push('<' + kind + '>'); } out.push('<li>' + inl(li[1]) + '</li>'); i++; continue; }
      closeList();
      if (l.trim()) out.push('<p>' + inl(l) + '</p>');
      i++;
    }
    closeList();
    return out.join('');
  }
  // 行政書士6分野の事前点検済み入門教材を、AIを待たず同一枠に即時表示する。
  // 生成型AIは任意の追加解説。事前準備の教材をAI生成文や公式過去問と偽らない。
  function preparedGuideHtml(field){
    var lesson = preparedLessons[field];
    if (!lesson) return '';
    var stage = Number(onboardProfile && onboardProfile.stage) || 1;
    var lead = stage >= 3
      ? '学習済みの方は重要語を確認した後、具体例と混同しやすい点を重点的に読んでください。'
      : '初学者の方は太字の用語を自分の言葉で説明できるか確かめながら読みましょう。';
    return '<section class="descriptive-explanation" aria-label="すぐ読める基礎解説">' +
      '<div class="notice"><b>基礎解説（学習システム内蔵）</b>：待ち時間なしで表示する導入教材です。AIの個別解説とは区別しています。</div>' +
      '<p>' + esc(lead) + '</p>' +
      lesson.intro.map(function(t){return '<p>' + esc(t) + '</p>';}).join('') +
      '<h3>具体例</h3><p>' + esc(lesson.example) + '</p>' +
      '<h3>間違えやすい点</h3><p>' + esc(lesson.pitfall) + '</p>' +
      '</section>';
  }
  var preparedConfirmationBusy = false;
  async function registerPreparedConfirmation(field, position, sid){
    var lesson = preparedLessons[field], n = Number(position);
    var question = lesson && lesson.questions && lesson.questions[n-1];
    if (!question || preparedConfirmationBusy || locked || !sid) return false;
    preparedConfirmationBusy = true;
    try {
      var data = await callTool('registerConfirmationQuestion', {
        sessionId: sid, question: question.question, choices: question.choices,
        correctAnswer: question.correctAnswer, explanation: question.explanation, prepared:true
      });
      if (!data || data.error || data.status !== 'confirmation_question') throw new Error('PREPARED_CONFIRMATION_FAILED');
      if (state.sessionId === sid && !locked) render(data);
      return true;
    } catch (error) {
      var notice = document.getElementById('preparedCheckStatus');
      if (notice) notice.textContent = '確認問題の保存に失敗しました。学習状態は保持されています。同じボタンで再試行できます。';
      return false;
    } finally { preparedConfirmationBusy = false; }
  }
  // AI側のツール接続が不安定でも「解説待ち」の正規学習画面は消さない。
  // 再要求は新しい出題・採点を行わず、同じセッションの学習内容だけを読み直す。
  var lessonPollGeneration = 0;
  var confirmationPollGeneration = 0;
  // チャットにはユーザーが理解できる短い依頼だけを送り、登録先は照会番号で判定する。
  function lessonRequestMessage(field, ref){
    return field + 'の基礎解説を作成して学習画面に登録してください。' + (ref ? '照会番号：' + ref + '。' : '');
  }
  // 解説から実践問題への共通経路。出題と採点は常にエンジンが制御する。
  // 登録済みの公式過去問がなければ、従来の sourceUnavailable 画面で取り込み方法を案内する。
  async function openPracticeAfterLesson(field, sid, button, notify){
    if (!sid || !field || locked) return;
    button.disabled = true;
    var previous = button.textContent;
    button.textContent = '実践問題を確認しています…';
    try {
      var chosen = await callTool('chooseItem', { sessionId:sid, fieldName:field, mode:'practice' });
      if (!chosen || chosen.error || chosen.status !== 'item' || chosen.mode !== 'practice')
        throw new Error('LESSON_PRACTICE_MODE_FAILED');
      var next = await callTool('nextQuestion', { sessionId:sid, question:field });
      if (!next || next.error || !['question','waiting','finished','remediation','sourceUnavailable','fieldExhausted','questionUnavailable'].includes(next.status))
        throw new Error('LESSON_PRACTICE_QUESTION_FAILED');
      render(next);
    } catch(e) {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = previous;
      }
      notify('実践問題へ切り替えられませんでした。学習状態を保持しています。同じボタンで再試行してください。');
    }
  }
  function showPendingLesson(data){
    var field = data.fieldName || '今の分野', sid = data.sessionId || state.sessionId;
    var lessonRef = data.lessonRef || '';
    var quickGuide = preparedGuideHtml(field);
    var hasPrepared = !!quickGuide;
    if (sid) state.sessionId = sid;
    saveIds();
    var j = data.journey || {};
    var header = journeyBar(j.fieldIndex, j.fieldTotal, 'explain', field);
    app.innerHTML = header + '<h2>' + esc(field) + '｜基礎解説</h2>' +
      (hasPrepared ? quickGuide + '<div class="row"><button id="quickGuideCheck" type="button"><span class="btn-line">確認問題へ（3問）</span></button><button id="quickGuidePractice" type="button">公式過去問へ進む</button></div>' :
        '<div class="notice" role="status">' + esc(data.notice || 'AIの基礎解説の登録を待っています。') + '</div>') +
      '<div id="lessonConnection" class="notice" role="status">' +
        (hasPrepared ? '必要な場合だけ、理解度に合わせたAIの詳しい解説を追加できます。AIの回答を待たなくても確認問題へ進めます。'
                     : '解説が表示されない場合は、登録状況を確認するかAIへ再依頼できます。') + '</div>' +
      '<div class="row">' + (hasPrepared ? '' : '<button id="refreshLesson" type="button">解説の状態を確認</button>') +
      '<button id="resumeLesson" type="button">' + (hasPrepared ? 'AI詳細解説を追加' : 'AI解説を再依頼') + '</button></div>' +
      (hasPrepared ? '' : '<div class="row"><button id="lessonSkip" type="button">確認問題から始める</button><button id="lessonPracticeDirect" type="button">公式過去問へ進む</button></div>') +
      '<details id="manualLesson" hidden><summary>AIの解説がチャット側に表示された場合</summary>' +
      '<p class="notice">チャットに出た解説文をコピーして貼り付けると、この学習枠に保存して学習を続けられます。</p>' +
      '<textarea id="manualLessonBody" rows="7" maxlength="16000" aria-label="チャットからコピーした基礎解説全文" style="box-sizing:border-box;width:100%;font:inherit;border:1px solid var(--line);border-radius:8px;padding:10px"></textarea>' +
      '<div class="row"><button id="publishManualLesson" type="button">この解説を学習枠に登録する</button></div></details>' + endBar();
    function lessonNotice(message){
      var slot = document.getElementById('lessonConnection');
      if (slot) slot.textContent = message;
    }
    var refreshing = false;
    async function readPublishedLesson(){
      var expectedGeneration = lessonPollGeneration;
      if (refreshing || !state.sessionId || locked) return false;
      refreshing = true;
      var b = document.getElementById('refreshLesson');
      if (b) { b.disabled = true; b.textContent = '確認しています…'; }
      try {
        var result = await callTool('getStudySnapshot', { sessionId: state.sessionId });
        // 自動照会中に利用者が確認・実践問題へ進んだ場合、古い解説で新画面を上書きしない。
        if (expectedGeneration !== lessonPollGeneration || locked || state.sessionId !== sid) return false;
        if (result && result.status === 'menu' && result.menu && result.menu.kind === 'lesson' &&
            result.menu.fieldName === field && result.menu.body) {
          render(result);
          return true;
        }
        if (result && result.status === 'lesson_pending') {
          if (result.lessonRef && result.lessonRef !== lessonRef) { render(result); return false; }
          lessonNotice('解説はまだ登録されていません。AI解説を再依頼できます。');
        }
        else
          lessonNotice('学習状態が更新されています。「学習画面を復元」で最新状態を確認してください。');
      } catch(e){
        lessonNotice('学習状態の確認に失敗しました。通信回復後に同じボタンで再試行してください。');
      } finally {
        refreshing = false;
        if (b && b.isConnected) { b.disabled = false; b.textContent = '解説の登録状況を確認'; }
      }
      return false;
    }
    var refreshLessonButton = document.getElementById('refreshLesson');
    if (refreshLessonButton) refreshLessonButton.onclick = readPublishedLesson;
    var lessonPractice = document.getElementById('quickGuidePractice') || document.getElementById('lessonPracticeDirect');
    if (lessonPractice) lessonPractice.onclick = function(){
      ++lessonPollGeneration;
      openPracticeAfterLesson(field, sid, this, lessonNotice);
    };
    var quickCheck = document.getElementById('quickGuideCheck');
    if (quickCheck) quickCheck.onclick = async function(){
      ++lessonPollGeneration;
      var button = this;
      button.disabled = true;
      try {
        var chosen = await callTool('chooseItem', { sessionId: sid, fieldName: field, mode:'check' });
        if (!chosen || chosen.error || chosen.status !== 'item' || chosen.mode !== 'check')
          throw new Error('PREPARED_LESSON_CHECK_START_FAILED');
        render({status:'confirmation_pending',sessionId:sid,fieldName:field,position:1,total:3,
          journey:chosen.journey,notice:'基礎解説を確認しました。確認問題を学習枠内に登録します。'});
      } catch(e){
        button.disabled = false;
        lessonNotice('確認問題へ切り替えられませんでした。このボタンから再試行できます。');
      }
    };
    // モデルが登録ツールを呼ばず、本文だけをチャットに出してしまった場合の無料・確実な復旧経路。
    // ボタンによる明示操作で同じエンジン登録を実行し、セッションの状態を確認してから表示する。
    document.getElementById('publishManualLesson').onclick = async function(){
      if (locked) return;
      var body = document.getElementById('manualLessonBody').value.trim();
      if (body.length < 50) {
        lessonNotice('解説全文を貼り付けてください（50文字以上）。短い開始メッセージだけでは登録できません。');
        return;
      }
      var button = this;
      button.disabled = true;
      try {
        var args = { kind:'lesson', body:body, fieldName:field, sessionId:sid };
        if (lessonRef) args.lessonRef = lessonRef;
        var result = await callTool('showMenu', args);
        if (result?.status === 'menu' && result.menu?.kind === 'lesson' && result.menu.body) {
          render(result);
          return;
        }
        lessonNotice('登録できませんでした。学習内容は維持しています。「解説の登録状況を確認」を押してください。');
      } catch(e) {
        lessonNotice('解説の登録ができませんでした。通信が回復したら再試行してください。');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    };
    // 解説の登録が済んだら、元の学習枠だけを更新する（新しいMCP表示枠を生成しない）。
    // 読取専用・回数上限付き。古いセッションや別画面への遷移後は停止する。
    var lessonPollId = ++lessonPollGeneration;
    var lessonPollDelays = hasPrepared ? [1500, 3500, 4500] : [2500, 5500, 10000, 16000];
    function pollLesson(index){
      if (lessonPollId !== lessonPollGeneration) return;
      if (index >= lessonPollDelays.length) {
        var fallback = document.getElementById('manualLesson');
        if (fallback) fallback.hidden = false;
        lessonNotice('AI解説の登録をまだ確認できません。再依頼するか、チャットに表示された解説を下の方法で登録できます。');
        return;
      }
      setTimeout(async function(){
        if (lessonPollId !== lessonPollGeneration || locked || state.sessionId !== sid ||
            !document.getElementById(hasPrepared ? 'resumeLesson' : 'refreshLesson')) return;
        var done = await readPublishedLesson();
        if (!done && lessonPollId === lessonPollGeneration) pollLesson(index + 1);
      }, lessonPollDelays[index]);
    }
    // 内蔵教材は即時表示済み。追加AIの依頼前に30秒以上の無意味な自動照合を開始しない。
    if (!hasPrepared) pollLesson(0);
    var requesting = false;
    document.getElementById('resumeLesson').onclick = async function(){
      if (requesting || locked) return;
      requesting = true;
      var button = this;
      button.disabled = true;
      button.textContent = 'AI解説を依頼しています…';
      try {
        var response = await ask(lessonRequestMessage(field, lessonRef));
        if (!response || response.isError)
          lessonNotice('ChatGPTへの依頼を送れませんでした。接続が戻ってから再依頼できます。');
        else {
          if (hasPrepared) pollLesson(0);
          lessonNotice('AIの追加解説を依頼しました。内蔵の基礎解説で学習を続けられます。');
          setTimeout(function(){
            if (!locked && button.isConnected && Date.now() - lastLocalInteractionAt > 1600)
              readPublishedLesson();
          }, 3500);
        }
      } finally {
        requesting = false;
        if (button.isConnected) { button.disabled = false; button.textContent = hasPrepared ? 'AI詳細解説を追加' : 'AI解説を再依頼'; }
      }
    };
    var lessonSkip = document.getElementById('lessonSkip');
    if (lessonSkip) lessonSkip.onclick = async function(){
      var b = this;
      b.disabled = true;
      try {
        var chosen = await callTool('chooseItem', { sessionId: sid, fieldName: field, mode: 'check' });
        if (!chosen || chosen.error || chosen.status !== 'item' || chosen.mode !== 'check')
          throw new Error('LESSON_SKIP_FAILED');
        render({ status: 'confirmation_pending', sessionId: sid, position: 1, total: 3, fieldName: field,
          notice: '確認問題に切り替えました。同じ枠に第1問を表示します。' });
      } catch(e){
        b.disabled = false;
        lessonNotice('進め方を変更できませんでした。学習状態を保持しています。再試行してください。');
      }
    };
    bindEnd(); scrollUp();
  }
  function showMenu(m){
    if (m.sessionId) state.sessionId = m.sessionId;
    if (m.studyId) currentStudyId = m.studyId;
    if (m.learnerId) studyLid = m.learnerId;
    saveIds();
    // 任意のAI補足が登録されたときも、先に読んでいた内蔵教材を消さず同じ枠に続けて表示する。
    var preparedBase = m.kind === 'lesson' && m.fieldName && preparedLessons[m.fieldName]
      ? preparedGuideHtml(m.fieldName) : '';
    var body = preparedBase + (m.body ? (preparedBase ? '<h2>AIによる詳しい補足解説</h2>' : '') +
      '<div class="md">' + md(m.body) + '</div>' : '');
    // 解説済みのときは「解説を見る」を再表示しない（旧サーバーからの回答にも対応）。
    var entries = (m.choices || []).map(function(c,i){ return { choice:c, action:m.actions ? m.actions[i] : null }; })
      .filter(function(x){ return !(m.kind === 'next' && m.body && (x.action === 'explain' || (!m.actions && x.choice === '解説を見る'))); });
    var j = m.journey || {};
    var h = journeyBar(j.fieldIndex, j.fieldTotal, j.stage, j.fieldName) + body + '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + entries.map(function(e, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(e.choice) + '</span></button>'; }).join('') +
      (m.kind === 'lesson' ? '<button id="lessonMenuPractice" type="button"><b>' + (entries.length + 1) + '</b><span>公式過去問へ進む</span></button>' : '') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    // 同じ分野の3問終了は追加登録に適した区切り。強制的な登録画面遷移は行わない。
    if (m.kind === 'next') {
      h += '<div class="notice">この区切りで新しい年度の過去問を追加することもできます。登録済みの問題が十分あれば、追加せず次へ進んで構いません。</div>' +
        sourceManagerBar();
    }
    if (['next', 'review', 'check'].indexOf(m.kind) >= 0 && !(m.kind === 'next' && m.actions)) h += '<div class="row" style="margin-top:14px"><button id="endMenu">学習を終了する</button></div>';
    app.innerHTML = h;
    scrollUp();
    bindSourceManager();
    var endAction = async function(em){
      em.disabled = true;
      var ids = loadIds(), lid = currentStudyId || ids.studyId || studyLid || ids.lid || state.sessionId || ids.sid;
      if (lid) {
        try {
          var r = await callTool('endStudy', { studyId: lid, sessionId: ids.sid || lid, area: ids.field || undefined, item: ids.field || undefined, purpose: ids.field ? ids.field + 'の要点をつかみ、過去問で得点できるか確かめる' : undefined });
          if (r && !r.error && typeof r.handoff === 'string' && typeof r.log === 'string' && typeof r.display === 'string') {
            showEnd(r);
            scrollUp(true);
            return;
          }
        } catch (e) {}
      }
      // 終了に失敗した場合、現在の学習を終了成功と表示しない。
      em.disabled = false;
      app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">終了データを取得できませんでした。同じ「今日はここまで」を押して再試行してください。学習状態は次へ進めません。</div>');
    };
    var lessonMenuPractice = document.getElementById('lessonMenuPractice');
    if (lessonMenuPractice) lessonMenuPractice.onclick = function(){
      var menuField = m.fieldName || loadIds().field || '';
      var button = this;
      openPracticeAfterLesson(menuField, state.sessionId, button, function(message){
        if (button.isConnected) {
          var node = document.getElementById('lessonPracticeError');
          if (!node) {
            app.insertAdjacentHTML('beforeend', '<div class="notice" id="lessonPracticeError" role="alert"></div>');
            node = document.getElementById('lessonPracticeError');
          }
          node.textContent = message;
        }
      });
    };
    var em = document.getElementById('endMenu');
    if (em) em.onclick = function(){ endAction(em); };
    app.querySelectorAll('.choices button[data-n]').forEach(function(b){ b.onclick = function(){
      var n = b.getAttribute('data-n'), entry = entries[Number(n) - 1], c = entry.choice;
      var action = (m.kind === 'next' || m.kind === 'lesson') ? (entry.action || (m.kind === 'next' && n === '1' ? 'next' : null)) : null;
      if (action === 'end') { endAction(b); return; }
      if (m.kind === 'lesson' && action === 'check') {
        var lessonField = m.fieldName || loadIds().field || '今の分野';
        var checkRequested = false;
        var request = async function(){
          if (checkRequested || locked) return;
          checkRequested = true;
          var retry = document.getElementById('lessonCheckRetry');
          if (retry) { retry.disabled = true; retry.textContent = '確認問題を開いています…'; }
          try {
            // 解説を確認した利用者が明示的に押してから確認問題の状態を作る。
            var chosen = await callTool('chooseItem', { sessionId: state.sessionId, fieldName: lessonField, mode: 'check' });
            if (!chosen || chosen.error || chosen.status !== 'item' || chosen.mode !== 'check')
              throw new Error('CONFIRMATION_START_FAILED');
            render({status:'confirmation_pending',sessionId:state.sessionId,fieldName:lessonField,
              position:1,total:3,journey:m.journey,notice:'確認問題の第1問を同じ学習枠に表示します。'});
            if (!preparedLessons[lessonField]) await ask(lessonField + 'の確認問題・第1問へ進む');
          } catch (e) {
            app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">確認問題の開始に失敗しました。学習状態を保持したまま再試行できます。</div>');
          } finally {
            checkRequested = false;
            if (retry && retry.isConnected) {
              retry.disabled = false;
              retry.textContent = '第1問が表示されない場合は再試行';
            }
          }
        };
        // 基礎解説をこの枠から消し、次の学習画面が来るまで短い案内だけ表示する。
        // 古い解説や選択ボタンを残したまま別のチャット回答が下に積み上がるのを防ぐ。
        app.innerHTML = '<h2>この分野の確認問題へ</h2><div class="notice" role="status">全3問の第1問を準備しています。問題は同じ学習枠に表示されます。</div>' +
          '<div class="row"><button id="lessonCheckRetry">第1問が表示されない場合は再試行</button></div>';
        scrollUp(true);
        document.getElementById('lessonCheckRetry').onclick = request;
        request();
        return;
      }
      if (action === 'explain') {
        if (m.body) { scrollUp(true); return; }
        loadExplanation((state.question && state.question.questionId) || null, true).catch(function(){
          app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">解説を取得できませんでした。学習状態は保持しています。</div>');
        }); return;
      }
      if (state.sessionId && ((m.kind === 'next' && (action === 'next' || action === 'review' || action === 'continueField')) || (m.kind === 'review' && n === '2'))) {
        var sameRequest = function(){ return callTool('nextQuestion', { sessionId: state.sessionId,
          ...(action === 'review' ? { question: '総復習（間違えた問題）' } : action === 'continueField' ? { question: 'この分野の未出題の実践問題を続ける' } : {}) }).then(function(r){
            if (r?.status === 'reviewEmpty' || r?.status === 'fieldExhausted') { showMenu({ ...m, notice: r.notice }); return; }
            if (!r || r.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(r.status)) throw new Error('NEXT_UNAVAILABLE');
            render(r);
          }); };
        nextBelow(sameRequest);
        return;
      }
      // 解説の本文は、ボタンを押したあとも枠に残す（選んだ内容だけ1行にする）
      app.innerHTML = body + '<div class="notice">' + esc(m.prompt) + '</div><div class="result ok">' + esc(n + '：' + c) + '</div>';
      scrollUp();
      ask(n + '：' + c, c);
    }; });
  }
  // 学習の始めの確認（免除・学習状況）を順にボタンで聞き、答えをまとめてチャットに送る
  var onboardOv = null, studyLearner = null, onboardSteps = null, studyLid = null, studyField = null, onboardProfile = {};
  // 概要の強弱：大事な項目（日時・試験時間・方式・合格基準）は大きく太く、そこまで必要でない項目（手数料・申込・発表など）は小さく控えめに
  var OV_MAJOR = /^(試験日|試験日時|試験日及び時間|試験時間|試験の方法|試験方法|出題形式|合格基準|合格基準点|実施方式|試験方式)/;
  var OV_MINOR = /^(受験手数料|受験申込|実施公告|試験の基準|合格後|試験地|試験場所|合格発表|登録|試験の一部|法令基準日|出題基準日|対象年度|実施|資格名|受験資格|試験科目|試験の対象|試験科目・出題範囲)/;
  // 色は項目の種類ごとに分ける（日時＝青、合格基準＝緑、費用＝橙、補足＝紫）
  function ovTone(k){ return /日|時間|期間|申込|発表/.test(k) ? 'tone-date' : /合格基準|配点|点/.test(k) ? 'tone-score' : /手数料|料/.test(k) ? 'tone-fee' : /基準日|対象年度|実施|資格名|試験地|受験資格/.test(k) ? 'tone-note' : ''; }
  // 「PDFを解析できる年度」と「全ユーザーが使える形で保存済みの年度」は別。
  function libraryHtml(lib){
    if (!lib || !Array.isArray(lib.supportedYears)) return '';
    var saved = Array.isArray(lib.stored) ? lib.stored : [];
    var missing = Array.isArray(lib.missing) ? lib.missing : [];
    var sections = lib.sectionsByYear || {};
    var years = lib.supportedYears;
    var readyYears = Array.from(new Set(saved.map(function(v){ return v.year; }))).sort(function(a,b){return a-b;});
    // 「対応可能」と「共有保存確認済み」は区別し、全ユーザー共通のキャッシュを表示する。
    var range = readyYears.length
      ? (readyYears[0] === readyYears[readyYears.length-1] ? readyYears[0] + '年度' :
        readyYears[0] + '〜' + readyYears[readyYears.length-1] + '年度')
      : '';
    var row = years.map(function(year){
      var yearSections = Array.isArray(sections[year]) ? sections[year] : [];
      // 旧APIとの互換：データに存在する区分のみを表示。午前・午後を勝手に補完しない。
      if (!yearSections.length) yearSections = Array.from(new Set(saved.concat(missing).filter(function(v){ return v.year === year; }).map(function(v){return v.section;})));
      var detail = yearSections.map(function(section){
        var hit = saved.find(function(v){return v.year === year && v.section === section;});
        var sectionLabel = section === '年度共通' ? '本試験' : section === '午前の部' ? '午前' : section === '午後の部' ? '午後' : section;
        return esc(sectionLabel) + '：' + (hit ? '<b>利用可能（' + esc(Number(hit.questions) + Number(hit.writtenQuestions || 0)) + '問）</b>' + (hit.writtenQuestions ? '<small>（択一' + esc(hit.questions) + '問・記述' + esc(hit.writtenQuestions) + '問）</small>' : '') : '未確認');
      }).join(' ／ ');
      return '<li><b>' + esc(year) + '年度</b>' + (detail ? '　' + detail : '　登録状況未確認') + '</li>';
    }).join('');
    return '<div class="notice"><b>公式過去問の利用状況</b>' +
      (range ? '<div><b>利用可能年度：' + esc(range) + '</b></div>' :
        '<div>現在、利用できる公式過去問の年度を確認できませんでした。</div>') +
      '<ul class="ov-l">' + row + '</ul>' +
      (missing.length ? '<div>利用できない年度・回は、必要に応じて問題PDFと正答PDFを登録してください。</div>' : '') +
      '</div>';
  }
  function ovHtml(){
    if (!onboardOv) return '';
    var rows = '', list = null, note = '';
    (onboardOv.lines || []).forEach(function(l){
      l = String(l);
      if (l.charAt(0) === '※') { note = l; return; }
      var m = l.match(/^[\\u3000 ]+\\d+\\.\\s*(.*)$/);
      if (m) { if (list) list.push(m[1]); return; }
      var i = l.indexOf('：');
      if (i < 0) { rows += '<div class="ov-r full"><span class="ov-v">' + esc(l) + '</span></div>'; return; }
      var k = l.slice(0, i), v = l.slice(i + 1);
      if (!v) { list = []; rows += '<div class="ov-r"><span class="ov-k">' + esc(k) + '</span>@@LIST@@</div>'; return; }
      rows += '<div class="ov-r ' + (OV_MAJOR.test(k) ? 'major' : OV_MINOR.test(k) ? 'minor' : '') + ' ' + ovTone(k) + '"><span class="ov-k">' + esc(k) + '</span><span class="ov-v">' + esc(v) + '</span></div>';
    });
    if (list) rows = rows.replace('@@LIST@@', '<ol class="ov-l">' + list.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>');
    var link = safeUrl(onboardOv.source) ? '<a class="ov-a" href="' + esc(safeUrl(onboardOv.source)) + '" target="_blank" rel="noopener">公式ページを開く ›</a>' : '';
    return '<div class="ov"><div class="ov-h">' + esc(onboardOv.title || '') + '</div><div class="ov-b">' + rows + (note ? '<div class="ov-n">' + esc(note) + '</div>' : '') + libraryHtml(onboardOv.sharedLibrary) + link + '</div></div>';
  }
  // 変更途中の計画はこの画面だけに保持。再承認前にサーバーへ確定保存しない。
  var planDraft = null;
  function draftPlan(){
    if (!planDraft) planDraft = {
      orderedFields: (onboardOv && onboardOv.fields || []).slice(),
      methodChoice: 'balanced', methodDistribution: null,
      reviewPreset: 'ai', reviewIntervalsMinutes: null, reviewLabel: '標準（1→3→7→14→30日）',
    };
    return planDraft;
  }
  function planRevised(reason){
    planPanel([reason || '変更後の学習計画を再表示しました。開始する前にもう一度確認してください。']);
  }
  // 学習段階の最終ボタンを押した直後、同じタップから遅れて届く互換 click が
  // 新しく描画された学習計画の別ボタン（特に「4 今は学習しない」）を押さないようにする。
  // 画面内で新たに pointer/touch/mouse down したボタンの click のみ操作として受け付ける。
  // detail=0 はキーボード・支援技術による正当なクリックとして受け付ける。
  function guardNewPlanActions(){
    ['startStudy', 'revise', 'diag', 'notNow'].forEach(function(id){
      var b = document.getElementById(id);
      if (!b) return;
      var pressed = false;
      function arm(){ pressed = true; }
      function disarm(){ pressed = false; }
      b.addEventListener('pointerdown', arm);
      b.addEventListener('touchstart', arm, { passive: true });
      b.addEventListener('mousedown', arm);
      b.addEventListener('pointercancel', disarm);
      b.addEventListener('touchcancel', disarm);
      b.addEventListener('click', function(e){
        if (e.detail > 0 && !pressed) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        pressed = false;
      }, true);
    });
  }
  // 学習計画（エンジンが出す）。ボタンを押すと、エンジンが学習の開始を記録し、最初の問題を出す。ChatGPTに次の呼び出しを任せない
  function planPanel(got){
    var ov = onboardOv || {}, d = draftPlan();
    var order = d.orderedFields.length ? d.orderedFields : (ov.fields || []);
    var dr = (ov.diagResult || []).length ?
      '<div class="stem"><b>初期診断の結果（暫定評価）</b></div><ul class="ov-l">' +
      ov.diagResult.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';
    var changes = (got || []).filter(Boolean).join('／');
    var stageArrival = (got || []).some(function(t){ return /^学習状況：/.test(t); });
    app.innerHTML = '<h2>学習計画</h2>' + libraryHtml(ov.sharedLibrary) +
      (stageArrival ? '<div class="stage-arrived" role="status">✓ 選択を受け付けました。画面は「学習計画」に切り替わりました。次の操作は計画の確認後に行ってください。</div>' : '') +
      (changes ? '<div class="notice">' + esc(changes) + '</div>' : '') +
      (onboardProfile.exemption === 'confirmed' && ov.exemptionExcludeFields && ov.exemptionExcludeFields.length
        ? '<div class="notice">午前の部の免除を適用する学習計画として、午前の分野を除いています。</div>' : '') + dr +
      '<div class="stem"><b>学習する分野の順</b><ol class="ov-l">' +
      order.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="stem"><b>学習方法：</b>' + esc({explain:'解説重視',check:'確認問題重視',practice:'公式過去問重視',balanced:'バランス型'}[d.methodChoice] || d.methodChoice) +
      (d.methodDistribution ? '（解説・確認・実践 ' + d.methodDistribution.join('：') + '%）' : '') + '</div>' +
      '<div class="stem"><b>復習：</b>' + esc(d.reviewLabel || '標準（1→3→7→14→30日）') + '</div>' +
      (d.otherNote ? '<div class="stem"><b>その他の希望：</b>' + esc(d.otherNote) + '</div>' : '') +
      '<div class="notice">変更した内容は開始承認まで確定しません。確認してから開始してください。</div>' +
      '<div class="choices"><button id="startStudy"><b>1</b><span>この学習計画で始める</span></button>' +
      '<button id="revise"><b>2</b><span>学習計画を見直す</span></button>' +
      '<button id="diag"' + (ov.overviewOnly && !(ov.sharedLibrary && ov.sharedLibrary.totalQuestions) ? ' disabled' : '') + '><b>3</b><span>' + (ov.overviewOnly && !(ov.sharedLibrary && ov.sharedLibrary.totalQuestions) ? '初期診断（利用可能な過去問なし）' : '初期診断で苦手分野を調べる') + '</span></button>' +
      '<button id="notNow"><b>4</b><span>今は学習しない</span></button></div>';
    scrollUp();
    guardNewPlanActions();
    document.getElementById('startStudy').onclick = function(){ startStudyNow(ov.name, studyLearner); };
    document.getElementById('revise').onclick = planEditMenu;
    document.getElementById('notNow').onclick = function(){
      // 番号4が学習段階の番号4と同じでも、二度押しだけで終了させない。
      app.innerHTML = '<h2>今は学習しない</h2><div class="stem">学習計画の確認画面から離れますか？ 学習はまだ開始していません。</div>' +
        '<div class="choices"><button id="backToPlan"><b>1</b><span>学習計画に戻る</span></button><button id="confirmNotNow"><b>2</b><span>今は学習しない（終了を確認）</span></button></div>';
      scrollUp();
      document.getElementById('backToPlan').onclick = function(){ planPanel([]); };
      document.getElementById('confirmNotNow').onclick = function(){
        app.innerHTML = '<div class="notice">学習は開始していません。次回、学習計画を確認してから開始できます。</div>';
      };
    };
    document.getElementById('diag').onclick = async function(){
      this.disabled = true;
      try {
        var r = await callTool('diagStep', { sessionId: studyLearner, action: 'preview' });
        if (!r || !r.diag) throw new Error('NO_DIAG');
        diagPreview(r.diag);
      } catch(e){
        var b = document.getElementById('diag'); if(b)b.disabled = false;
        app.insertAdjacentHTML('beforeend','<div class="notice">公式過去問で診断できません。取り込み後に再試行してください。</div>');
      }
    };
  }
  function planEditMenu(){
    var options = ['分野・優先順位','学習方法・配分','復習頻度・タイミング','その他','変更をやめて計画へ戻る'];
    app.innerHTML = '<h2>学習計画を見直す</h2><div class="choices">' + options.map(function(t,i){
      return '<button data-edit="' + (i+1) + '"><b>' + (i+1) + '</b><span>' + esc(t) + '</span></button>';
    }).join('') + '</div>';
    scrollUp();
    app.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick = function(){
      var n = Number(b.getAttribute('data-edit'));
      if (n===1) planEditFields();
      else if(n===2) planEditMethods();
      else if(n===3) planEditReview();
      else if(n===4) planEditOther();
      else planPanel([]);
    }; });
  }
  function planEditFields(){
    var fields = (onboardOv && onboardOv.fields || []).slice();
    if(!fields.length){ app.innerHTML='<div class="notice">公式の分野を確認できないため変更できません。</div><button id="backPlan">戻る</button>'; document.getElementById('backPlan').onclick=planEditMenu; return; }
    app.innerHTML = '<h2>分野・優先順位</h2><div class="notice">優先する分野を選ぶか、公式の分野名を全て順番に指定してください。</div>' +
      '<div class="choices">' + fields.map(function(f,i){return '<button data-field="' + i + '"><b>' + (i+1) + '</b><span>' + esc(f) + 'を優先する</span></button>';}).join('') +
      '<button id="fieldDiag"><b>' + (fields.length+1) + '</b><span>診断問題で苦手分野を確認</span></button>' +
      '<button id="fieldCustom"><b>' + (fields.length+2) + '</b><span>分野順を自由指定</span></button>' +
      '<button id="fieldBack"><b>' + (fields.length+3) + '</b><span>戻る</span></button></div><div id="fieldInput"></div>';
    scrollUp();
    app.querySelectorAll('[data-field]').forEach(function(b){ b.onclick=function(){
      var top=fields[Number(b.getAttribute('data-field'))];
      draftPlan().orderedFields=[top].concat(fields.filter(function(x){return x!==top;}));
      planRevised('優先分野：'+top);
    };});
    document.getElementById('fieldBack').onclick=planEditMenu;
    document.getElementById('fieldDiag').onclick=async function(){
      this.disabled=true;
      try {var r=await callTool('diagStep',{sessionId:studyLearner,action:'preview'});if(!r?.diag)throw Error();diagPreview(r.diag);}
      catch(e){this.disabled=false;app.insertAdjacentHTML('beforeend','<div class="notice">診断問題を取得できませんでした。</div>');}
    };
    document.getElementById('fieldCustom').onclick=function(){
      document.getElementById('fieldInput').innerHTML='<div class="notice">分野名を「、」区切りで全て入力してください。公式分野以外や重複がある場合は変更しません。</div><textarea id="fieldOrder" rows="3"></textarea><button id="fieldConfirm">この順番を確認する</button>';
      document.getElementById('fieldOrder').value=draftPlan().orderedFields.join('、');
      document.getElementById('fieldConfirm').onclick=function(){
        var entered=document.getElementById('fieldOrder').value.split(/[、,\\n]/).map(function(x){return x.trim();}).filter(Boolean);
        if(entered.length!==fields.length||new Set(entered).size!==fields.length||entered.some(function(x){return fields.indexOf(x)<0;})){
          app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">登録済みの全分野を重複なく指定してください。変更していません。</div>');return;
        }
        draftPlan().orderedFields=entered;planRevised('指定した分野順を反映しました。');
      };
    };
  }
  function planEditMethods(){
    var opts = [['explain','解説重視',[60,20,20]],['check','確認問題重視',[20,60,20]],
      ['practice','公式過去問重視',[10,10,80]],['balanced','バランス型',[34,33,33]]];
    app.innerHTML='<h2>学習方法・配分</h2><div class="choices">'+opts.map(function(x,i){
      return '<button data-method="'+x[0]+'"><b>'+(i+1)+'</b><span>'+esc(x[1])+'</span></button>';
    }).join('')+'<button id="methodCustom"><b>5</b><span>割合を自由指定</span></button><button id="methodBack"><b>6</b><span>戻る</span></button></div><div id="methodInput"></div>';
    scrollUp();
    app.querySelectorAll('[data-method]').forEach(function(b){b.onclick=function(){
      var x=opts.find(function(t){return t[0]===b.getAttribute('data-method');});
      draftPlan().methodChoice=x[0]; draftPlan().methodDistribution=x[2];planRevised(x[1]);
    };});
    document.getElementById('methodBack').onclick=planEditMenu;
    document.getElementById('methodCustom').onclick=function(){
      document.getElementById('methodInput').innerHTML='<div class="notice">解説・確認問題・公式過去問の順に百分率を入力してください。合計100%のみ受け付けます。</div>'+
        '<input id="mExp" inputmode="numeric" placeholder="解説%" style="width:28%"><input id="mCheck" inputmode="numeric" placeholder="確認%" style="width:28%">'+
        '<input id="mPractice" inputmode="numeric" placeholder="実践%" style="width:28%"><button id="mSave">内容を確認する</button>';
      document.getElementById('mSave').onclick=function(){
        var v=['mExp','mCheck','mPractice'].map(function(id){return Number(document.getElementById(id).value.trim());});
        if(v.some(function(n){return !Number.isInteger(n)||n<0||n>100;})||v.reduce(function(a,b){return a+b;},0)!==100){
          app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">0～100の整数で、合計100%にしてください。変更していません。</div>');return;
        }
        draftPlan().methodChoice='balanced';draftPlan().methodDistribution=v;planRevised('学習方法の配分を変更しました。');
      };
    };
  }
  function planEditReview(){
    var options=[['focus','集中型（当日・翌日・3日後・7日後）',[0,1440,4320,10080]],
      ['ai','標準型（1日→3日→7日→14日→30日）',[1440,4320,10080,20160,43200]],
      ['slow','ゆっくり型（3日後・7日後・14日後）',[4320,10080,20160]],
      ['ai','AI調整型（正誤と復習期限に応じて間隔を延長）',[1440,4320,10080,20160,43200]]];
    app.innerHTML='<h2>復習頻度・タイミング</h2><div class="choices">'+options.map(function(x,i){
      return '<button data-r="'+i+'"><b>'+(i+1)+'</b><span>'+esc(x[1])+'</span></button>';
    }).join('')+'<button id="rCustom"><b>5</b><span>自由指定</span></button><button id="rBack"><b>6</b><span>戻る</span></button></div><div id="rInput"></div>';
    scrollUp();
    app.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(){
      var x=options[Number(b.getAttribute('data-r'))];
      draftPlan().reviewPreset=x[0];draftPlan().reviewIntervalsMinutes=x[2];draftPlan().reviewLabel=x[1];
      planRevised(x[1]);
    };});
    document.getElementById('rBack').onclick=planEditMenu;
    document.getElementById('rCustom').onclick=reviewCustomInput;
  }
  function reviewCustomInput(){
    app.innerHTML='<h2>復習間隔を自由指定</h2><div class="notice">ここで設定できるのは復習予定の記録と、次回学習画面を開いた際の期限判定です。チャットを閉じた状態で指定時刻に自動通知・自動出題する機能は提供していません。</div>'+
      '<div class="stem">例：3分後、1時間後、1日後</div><textarea id="reviewText" rows="3" style="width:100%" placeholder="3分後、1時間後、"></textarea>'+
      '<div class="choices"><button id="reviewCheck"><b>1</b><span>この間隔を確認する</span></button><button id="reviewBack"><b>2</b><span>戻る</span></button></div>';
    document.getElementById('reviewBack').onclick=planEditReview;
    document.getElementById('reviewCheck').onclick=function(){
      var raw=document.getElementById('reviewText').value.normalize('NFKC').replace(/三/g,'3').replace(/一/g,'1').replace(/二/g,'2').replace(/五/g,'5').replace(/十/g,'10');
      if(/通知|自動出題|リマインド|メール|知らせ|プッシュ|アラーム/.test(raw)){
        reviewReject('チャットを閉じた状態の自動通知・自動出題には対応していません。予定記録としての変更は選択後に行ってください。');return;
      }
      var tokens=raw.split(/[、,，\\n]+/).map(function(x){return x.trim();}).filter(Boolean);
      var vals=tokens.map(function(x){var m=/^(\\d+)\\s*(分|時間|日)(後)?$/.exec(x);return m?Number(m[1])*(m[2]==='日'?1440:m[2]==='時間'?60:1):NaN;});
      if(!vals.length||vals.length>8||vals.some(function(x,i){return !Number.isInteger(x)||x<1||x>525600||(i>0&&x<=vals[i-1]);})){
        reviewReject('間隔は「3分後、1時間後」のように、正の値を昇順・重複なしで入力してください。');return;
      }
      app.innerHTML='<h2>復習予定の確認</h2><div class="stem">'+esc(tokens.join(' → '))+'</div>'+
        '<div class="notice">予定を記録します。自動通知・自動出題はしません。確定済みの復習履歴は削除しません。</div>'+
        '<div class="choices"><button id="rAgree"><b>1</b><span>この予定を計画案に反映</span></button><button id="rRetry"><b>2</b><span>入力し直す</span></button><button id="rGoBack"><b>3</b><span>戻る</span></button></div>';
      document.getElementById('rAgree').onclick=function(){var d=draftPlan();d.reviewPreset='custom';d.reviewIntervalsMinutes=vals;d.reviewLabel=tokens.join(' → ')+'（自動通知なし）';planRevised('復習予定を変更しました。');};
      document.getElementById('rRetry').onclick=reviewCustomInput;
      document.getElementById('rGoBack').onclick=planEditReview;
    };
  }
  function reviewReject(why){
    app.innerHTML='<h2>この復習設定は受け付けられません</h2><div class="notice" role="alert">'+esc(why)+'</div>'+
      '<div class="choices"><button id="rRecord"><b>1</b><span>予定の記録として設定し直す</span></button>'+
      '<button id="rRetry"><b>2</b><span>別の間隔を入力</span></button><button id="rBack"><b>3</b><span>復習メニューへ戻る</span></button></div>';
    document.getElementById('rRecord').onclick=reviewCustomInput;
    document.getElementById('rRetry').onclick=reviewCustomInput;
    document.getElementById('rBack').onclick=planEditReview;
  }
  function planEditOther(){
    app.innerHTML = '<h2>その他の希望</h2><div class="notice">その他の学習希望を記録できます。採点規則の変更や、チャットを閉じている間の自動通知など、未対応の機能は設定できません。</div>' +
      '<textarea id="otherText" maxlength="300" rows="3" style="width:100%;box-sizing:border-box"></textarea>' +
      '<div class="choices"><button id="otherOk"><b>1</b><span>希望を確認する</span></button><button id="otherBack"><b>2</b><span>戻る</span></button></div>';
    document.getElementById('otherText').value=draftPlan().otherNote || '';
    document.getElementById('otherBack').onclick=planEditMenu;
    document.getElementById('otherOk').onclick=function(){
      var text=document.getElementById('otherText').value.trim();
      if(text.length>300 || /自動通知|自動出題|無断|省略して採点|正答を変更|免除を無視/.test(text)){
        app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">その希望は現在の機能では受け付けられません。未対応の機能を実装済みとして扱うことはできません。</div>');
        return;
      }
      draftPlan().otherNote=text;
      planRevised(text ? 'その他の学習上の希望を計画案に追加しました。' : 'その他の希望は設定しません。');
    };
  }
  // 診断問題は明示承認後にだけ出す。戻るを押した場合は出題も履歴変更もしない。
  function diagPreview(d){
    var h = '<h2>初期診断の確認</h2><div class="notice">公式過去問で分野ごとの理解度を調べます。結果は少数問による暫定評価です。</div>' +
      '<div class="stem">全' + esc(d.total) + '問</div><ol class="ov-l">' +
      (d.fields || []).map(function(f){ return '<li>' + esc(f.name) + '：' + esc(f.count) + '問</li>'; }).join('') + '</ol>' +
      '<div class="choices"><button id="dGo"><b>1</b><span>この問題数で診断を開始する</span></button><button id="dBack"><b>2</b><span>計画に戻る</span></button></div>';
    app.innerHTML = h; scrollUp();
    document.getElementById('dBack').onclick = function(){ planPanel([]); };
    document.getElementById('dGo').onclick = async function(){
      this.disabled = true;
      try {
        var r = await callTool('diagStep', { sessionId: studyLearner, action: 'start' });
        if (!r || !r.diag || !r.question) throw new Error('DIAG_UNAVAILABLE');
        diagIntro(r.diag, r.question);
      } catch(e) {
        this.disabled = false;
        app.insertAdjacentHTML('beforeend','<div class="notice">初期診断の問題を取得できませんでした。同じ開始ボタンで再試行してください。</div>');
      }
    };
  }
  function diagResultScreen(data){
    var rows = (data.diagResult || []).map(function(r){
      var rate = r.wrongRate == null ? '未診断' : Math.round(r.wrongRate * 100) + '%';
      var certainty = r.confidenceCount ? '迷い・勘 ' + r.uncertaintyCount + '/' + r.confidenceCount : '確信度：未確認';
      return '<li>' + esc(r.name) + '：' + esc(r.answered) + '問中' + esc(r.correct) + '問正解／誤答率' + esc(rate) + '（' + esc(certainty) + '）</li>';
    }).join('');
    app.innerHTML = '<h2>初期診断の結果（暫定評価）</h2>' +
      (data.grade ? '<div class="result">' + esc(data.grade.label) + '：' + (data.grade.skipped ? '未回答' : data.grade.correct ? '正解' : '不正解') + '</div>' : '') +
      '<div class="notice">' + esc(data.note || '') + '</div><ul class="ov-l">' + rows + '</ul>' +
      '<div class="stem">学習する分野の順：' + esc((data.order || []).join(' → ')) + '</div>' +
      '<div class="stem">順位の根拠：' + esc((data.rankingReasons || []).map(function(r){return r.fields.join('・') + '：' + r.reason;}).join('／')) + '</div>' +
      '<div class="choices"><button id="dApply"><b>1</b><span>この結果で計画を作る</span></button><button id="dMore"><b>2</b><span>追加診断</span></button><button id="dManual"><b>3</b><span>分野順を自分で指定</span></button><button id="dEdit"><b>4</b><span>計画の見直しへ戻る</span></button></div>';
    scrollUp();
    document.getElementById('dApply').onclick = async function(){
      this.disabled = true;
      try { var r = await callTool('diagStep', { sessionId: studyLearner, action: 'apply' });
        if (!r || !r.planReady) throw new Error('PLAN_APPLY_FAILED'); render(r);
      } catch(e){ this.disabled = false; app.insertAdjacentHTML('beforeend','<div class="notice">診断結果を計画へ反映できませんでした。もう一度押してください。</div>'); }
    };
    document.getElementById('dMore').onclick = async function(){
      this.disabled = true;
      try { var r = await callTool('diagStep', { sessionId: studyLearner, action: 'preview' }); if (!r || !r.diag) throw new Error('NO_MORE_DIAG'); diagPreview(r.diag); }
      catch(e){ this.disabled = false; app.insertAdjacentHTML('beforeend','<div class="notice">追加診断に利用できる別の公式過去問がありません。</div>'); }
    };
    document.getElementById('dManual').onclick = function(){ planEditFields(); };
    document.getElementById('dEdit').onclick = function(){ planEditMenu(); };
  }
  // 初期診断：どの分野から何問出すかを先に見せ、過去問をこの画面で続けて出す（出題・採点・結果はエンジン。AIに頼らない）
  var diagSid = null;
  function diagIntro(d, q){
    diagSid = studyLearner;
    var intro = '<h2>初期診断</h2><div class="stem">次の' + d.fields.length + '分野から、<b>全' + d.total + '問</b>の過去問を出します。</div>' +
      '<ol class="ov-l">' + d.fields.map(function(f){ return '<li>' + esc(f.name) + '（' + f.count + '問）</li>'; }).join('') + '</ol>' +
      '<div class="notice">答えの正誤から苦手な分野を調べ（暫定評価）、学習する分野の順を決め直します。</div>';
    diagQuestion(q, intro);
  }
  function diagQuestion(q, head){
    if (!q) return;
    var h = (head || '') + '<h2>' + esc(q.label) + '</h2><div class="field">' + esc(q.fieldName) + '　' + esc((q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber) + '</div>';
    (q.notices || []).forEach(function(n){ h += '<div class="notice">' + esc(n) + '</div>'; });
    h += '<div class="stem">' + stemHtml(q.stem) + '</div>';
    (q.figureUrls || []).forEach(function(u, i){ if (safeUrl(u)) h += figureHtml(u, i); });
    h += '<div class="choices">' + (q.choices || []).map(function(c, i){ var n = i + 1; return '<label class="opt" data-n="' + n + '"><input type="radio" name="ans" value="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';
    h += '<div class="stem"><b>回答の確信度（任意）</b><label><input type="radio" name="confidence" value="sure"> 確信あり</label> <label><input type="radio" name="confidence" value="unsure"> 迷った</label> <label><input type="radio" name="confidence" value="guess"> 勘</label></div><div class="row"><button id="dSkip">未回答で次へ</button></div>';
    h += '<div class="row" id="decrow" style="display:none"><button id="decide">解答する</button></div>';
    app.innerHTML = h;
    bindFigures();
    scrollUp();
    var chosen = null, sent = false;
    app.querySelectorAll('input[name=ans]').forEach(function(r){ r.onchange = function(){ chosen = r.value; document.getElementById('decrow').style.display = 'flex'; }; });
    document.getElementById('decide').onclick = async function(){
      if (!chosen || sent) return;
      sent = true;
      app.querySelectorAll('button,input').forEach(function(b){ b.disabled = true; });
      try {
        var certainty = app.querySelector('input[name=confidence]:checked');
        var r = full(await callTool('diagStep', { sessionId: diagSid, action: 'answer', questionId: q.questionId, value: String(chosen), confidence: certainty ? certainty.value : undefined }));
        var g = r && r.grade;
        if (!g) throw new Error('grade');
        var line = '<div class="result ' + (g.skipped ? '' : g.correct ? 'ok' : 'ng') + '">' + esc(g.label) + '：' + (g.skipped ? '未回答（正誤集計には含めません）' : (g.correct ? '正解' : '不正解') + '（あなたの答え ' + esc(g.selected) + '／正答は ' + esc(g.correctAnswerLabel || g.correctAnswer) + '）') + '</div>';
        if (r.status === 'diagResult') { render(r); return; }
        if (r.planReady) { studyLearner = r.learnerId || studyLearner; render(r); app.insertAdjacentHTML('afterbegin', line); return; }
        diagQuestion(r.question, line);
      } catch (e) {
        sent = false; app.querySelectorAll('button,input').forEach(function(b){ b.disabled = false; });
        app.insertAdjacentHTML('beforeend', '<div class="notice">採点できませんでした。もう一度押してください。</div>');
      }
    };
    document.getElementById('dSkip').onclick = function(){
      chosen = 'スキップ';
      document.getElementById('decrow').style.display = 'flex';
      document.getElementById('decide').click();
    };
  }
  async function startStudyNow(name, learner){
    app.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
    try {
      var draft = draftPlan();
      var saved = await callTool('saveStudyPlan', {
        sessionId: learner, orderedFields: draft.orderedFields,
        methodChoice: draft.methodChoice, methodDistribution: draft.methodDistribution || undefined,
        reviewPreset: draft.reviewPreset, reviewIntervalsMinutes: draft.reviewIntervalsMinutes || undefined,
        otherNote: draft.otherNote || undefined,
      });
      if (!saved || saved.status !== 'planSaved' || saved.error) throw new Error('PLAN_SAVE_FAILED');
      var r = await callTool('startStudy', { qualificationName: name, learnerId: learner });
      if (!r || r.error) { app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc((r && r.hint) || '学習を始められませんでした。もう一度押してください。') + '</div>'); app.querySelectorAll('button').forEach(function(b){ b.disabled = false; }); return; }
      itemStart(r, learner);
    } catch (e) {
      app.insertAdjacentHTML('beforeend', '<div class="notice">学習を始められませんでした。もう一度押してください。</div>');
      app.querySelectorAll('button').forEach(function(b){ b.disabled = false; });
    }
  }
  // 学習開始（U09）と項目開始（U07）：開始時刻・今回の位置・目的・理由・全体の進捗を見せ、この分野の進め方をボタンで選んでもらう
  function itemStart(r, learner){
    var ov = onboardOv || {};
    var fields = ov.fields || [];
    var field = fields[0] || '';
    studyLid = r.learnerId || learner; currentStudyId = r.studyId || currentStudyId; studyField = field || null; saveIds();
    var reason = (ov.diagResult || []).length ? '初期診断の結果（暫定評価）で、誤答の多い分野から始めます。' : '公式の出題分野の順と出題数から、最初の分野にしました。';
    var h = '<div class="notice" style="white-space:pre-wrap">' + esc(r.display || '') + '</div>';
    if (field) {
      h += '<div class="stem">📍今回の位置：' + esc(field) + '<br>🎯今回の目的：' + esc(field) + 'の要点をつかみ、過去問で得点できるか確かめる<br>🧭始める理由：' + esc(reason) + '</div>';
      if (!r.resumed && fields.length) h += '<div class="stem"><b>【全体の進捗】</b></div><ul class="ov-l"><li>学習中：' + esc(field) + '</li>' + (fields.length > 1 ? '<li>未着手：' + esc(fields.slice(1).join('、')) + '</li>' : '') + '</ul>';
    }
    app.innerHTML = h;
    itemMenu(field, learner, async function(){
      var next = await callTool('nextQuestion', { sessionId: learner });
      if (!next || next.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(next.status)) throw new Error('FIRST_NEXT_UNAVAILABLE');
      render(next);
    });
  }
  // 項目開始A（U07）：この分野の進め方をボタンで選ぶ。「以後も同じ」にしたら、次の分野からは聞かずにその進め方で進む
  var itemAlways = null;
  function itemMenu(field, learner, proceed){
    var go = async function(mode){
      var chosen = null;
      try {
        if (field) chosen = await callTool('chooseItem', { sessionId: learner, fieldName: field, mode: mode });
        if (field && (!chosen || chosen.error || chosen.status !== 'item')) throw new Error('ITEM_UNAVAILABLE');
      } catch (e) {
        app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">進め方を保存できませんでした。もう一度選んでください。</div>');
        app.querySelectorAll('#itemModes button').forEach(function(x){ x.disabled = false; });
        return;
      }
      if (mode === 'practice') { nextBelow(proceed, field ? field + 'を実践問題から始めます。' : '実践問題から始めます。'); return; }
      // AI/ホストの接続が切れても、先に同じ枠へ復元可能な操作ボタンを出す。
      // 解説確定前に確認問題を自動開始しない。
      var j = chosen?.journey || {};
      if (mode === 'explain') {
        render({ status:'lesson_pending', sessionId: chosen?.sessionId || learner, fieldName:field,
          lessonRef: chosen?.lessonRef, journey:j,
          notice:preparedLessons[field] ? '基礎解説を表示しました。AIの追加解説は任意です。' : 'AIの基礎解説を準備しています。' });
        if (!preparedLessons[field]) ask(lessonRequestMessage(field, chosen?.lessonRef)).then(function(reply){
          if (!reply || reply.isError) {
            var node = document.getElementById('lessonConnection');
            if (node) node.textContent = 'AI解説の依頼に失敗しました。画面のボタンから再試行できます。';
          }
        });
        return;
      }
      if (preparedLessons[field]) {
        render({status:'confirmation_pending',sessionId:chosen?.sessionId || learner,
          fieldName:field,position:1,total:3,journey:j,notice:'第1問をエンジンから直接表示します。'});
        return;
      }
      app.innerHTML = journeyBar(j.fieldIndex, j.fieldTotal, 'check1', field) +
        localBar('この分野の確認問題', 1, 3) +
        '<div class="notice"><b>' + esc(field) + '：確認問題から</b>進めます。確認問題は全3問です。</div>' +
        '<div class="row"><button id="retryCheckStart" type="button">確認問題の第1問を表示する</button></div>';
      scrollUp(true);
      document.getElementById('retryCheckStart').onclick = function(){
        this.disabled = true;
        ask(field + 'の確認問題・第1問へ進む').then(function(reply){
          var btn = document.getElementById('retryCheckStart');
          if (btn && btn.isConnected) btn.disabled = false;
        });
      };
      ask(field + 'を確認問題から始めます。');
    };
    if (itemAlways) { go(itemAlways); return; }
    var modes = [['explain', '解説あり（解説→確認問題→実践問題）'], ['check', '確認問題から（解説なし）'], ['practice', '実践問題から（解説も確認問題もなし）']];
    app.insertAdjacentHTML('beforeend', '<h2>📍' + esc(field || '最初の分野') + '</h2><div class="stem"><b>■この項目はどう進めますか？</b></div><div class="choices" id="itemModes">' + modes.map(function(m, i){ return '<button data-mode="' + m[0] + '"><b>' + (i + 1) + '</b><span>' + esc(m[1]) + '</span></button>'; }).join('') + '</div><div class="row"><label><input type="checkbox" id="itemKeep"> 以後も同じ進め方にする</label></div>');
    scrollUp();
    app.querySelectorAll('#itemModes button').forEach(function(b){ b.onclick = function(){
      app.querySelectorAll('#itemModes button').forEach(function(x){ x.disabled = true; });
      var mode = b.getAttribute('data-mode');
      var keep = document.getElementById('itemKeep');
      if (keep && keep.checked) itemAlways = mode;
      go(mode);
    }; });
  }
  function onboard(steps, got){
    var m = steps[got.length];
    if (!m) {
      // 免除と学習段階の答えをエンジンに残す（免除が適用確定なら、その問は出さない。学習段階は解説の深さと引継ぎに使う）
      function showPlan(){
        if (onboardProfile.exemption === 'confirmed' && onboardOv && Array.isArray(onboardOv.exemptionExcludeFields)) {
          var excluded = onboardOv.exemptionExcludeFields;
          onboardOv.fields = (onboardOv.fields || []).filter(function(f){ return excluded.indexOf(f) < 0; });
          planDraft = null;
        }
        planPanel(got);
      }
      if (!studyLearner) { showPlan(); return; }
      app.innerHTML = '<div class="notice" role="status">学習条件を保存しています…</div>';
      callTool('saveProfile', { sessionId: studyLearner, exemption: onboardProfile.exemption || undefined, stage: onboardProfile.stage || undefined })
        .then(function(result){
          if (!result || result.error) throw new Error('PROFILE_SAVE_FAILED');
          showPlan();
        }).catch(function(){
          app.innerHTML = '<div class="notice" role="alert">学習条件の保存に失敗しました。条件を変えずに再試行してください。</div><div class="row"><button id="retryProfile">再試行</button></div>';
          document.getElementById('retryProfile').onclick = function(){ onboard(steps, got); };
        });
      return;
    }
    var h = ovHtml() + '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + m.choices.map(function(c, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    app.innerHTML = h;
    scrollUp();
    var decided = false;
    app.querySelectorAll('.choices button').forEach(function(b){ b.onclick = function(){
      if (decided) return;
      decided = true;
      var n = Number(b.getAttribute('data-n')), c = m.choices[n - 1];
      if (m.kind === 'exempt') onboardProfile.exemption = ['confirmed', 'no', 'pending'][n - 1];
      else onboardProfile.stage = n;
      var completed = got.concat([(m.kind === 'exempt' ? '免除：' : '学習状況：') + c]);
      if (m.kind === 'status' && completed.length === steps.length) {
        // ボタンの反応を指の位置に明示し、旧画面の残存タップを受け付けない。
        app.querySelectorAll('.choices button').forEach(function(x){ x.disabled = true; });
        b.classList.add('chosen');
        b.insertAdjacentHTML('afterend', '<div id="stageAck" class="stage-ack" role="status">✓ 「' + esc(c) + '」を選択しました。学習計画へ進みます。もう一度押す必要はありません。</div>');
        setTimeout(function(){ if (!locked) onboard(steps, completed); }, 750);
      } else {
        onboard(steps, completed);
      }
    }; });
  }
  async function answer(v){
    var progress = document.getElementById('answerProgress');
    function showProgress(message, isError){
      if (!progress || !progress.isConnected) return;
      progress.style.display = 'block';
      progress.setAttribute('role', isError ? 'alert' : 'status');
      progress.textContent = message;
    }
    if (state.answered) { showProgress('採点処理中です。結果を確認しています。', false); return; }
    if (!state.question || !state.sessionId || !state.question.questionId) {
      showProgress('問題の情報を確認できません。学習画面の再表示が必要です。', true);
      return;
    }
    var qid = state.question.questionId;
    var sid = state.sessionId;
    var guess = document.getElementById('guess');
    var confidence = guess && guess.checked ? 'guess' : 'sure';
    state.answered = true;
    // 押下直後に見える位置で進行を示し、通信を待つ間の二重採点を防ぐ。
    showProgress(v === 'スキップ' ? 'スキップ処理中です…' : '解答を受け付けました。公式正答と照合しています…', false);
    var submitButton = document.getElementById('decide');
    if (submitButton) submitButton.textContent = '採点中…';
    app.querySelectorAll('button,input').forEach(function(b){ b.disabled = true; });
    var picked = app.querySelector('.choices .opt[data-n="' + v + '"]');
    if (picked) picked.classList.add('picked');
    try {
      var r = await callTool('submitAnswer', { sessionId:sid, questionId:qid, value:String(v), confidence:confidence });
      if (r && (r.error === 'DAILY_LIMIT' || r.error === 'ACCESS_CODE_REQUIRED')) {
        throw new Error(r.error);
      }
      if (!r || r.error || !r.grade) throw new Error('ANSWER_RESULT_MISSING');
      if (r.grade.questionId && r.grade.questionId !== qid) throw new Error('ANSWER_QUESTION_MISMATCH');
      state.next = r.next || null;
      showGrade(r.grade);
      // 採点と簡易表示だけを行う。AIの詳細解説は利用者がボタンを選んだときに限る。
      return;
    } catch (e) {
      // APIの応答が途切れても、採点がサーバーへ保存された可能性がある。
      // 同じ解答を自動再送せず、読取専用で正誤と現在問を照合する。
      showProgress('通信状態を確認しています。回答は再送しません…', false);
      try {
        var saved = await callTool('getStudySnapshot', {sessionId:sid});
        if (saved && !saved.error && saved.status === 'restoredGrade' &&
            saved.grade && saved.grade.questionId === qid) {
          render(saved);
          return;
        }
        if (v === 'スキップ' && saved && !saved.error &&
            (saved.status === 'question' && saved.question?.questionId !== qid ||
             ['waiting','finished','remediation','sourceUnavailable'].includes(saved.status))) {
          render(saved);
          return;
        }
        // 別問や不明な状態へ飛ばさず、この問の回答を保持する。
      } catch (readError) {}
      state.answered = false;
      app.querySelectorAll('button,input').forEach(function(b){ b.disabled = false; });
      if (submitButton && submitButton.isConnected) submitButton.textContent = '解答する';
      var message = e && e.message === 'DAILY_LIMIT' ? '本日の利用上限に達しました。回答は保持されています。' :
        e && e.message === 'ACCESS_CODE_REQUIRED' ? '利用コードが必要です。回答は保持されています。' :
        '採点結果を取得できませんでした。選択した回答を保持しています。同じボタンで再確認できます。';
      showProgress(message, true);
      if (progress && progress.isConnected) progress.scrollIntoView({block:'nearest',behavior:'auto'});
    }
  }
  // 解説はAIが学習履歴に応じて作る。公式正答だけはエンジンで検証し、AIの作り話を防ぐ。
  // 解説は公式の一時照合番号からモデルが専用ツールで取得する。
  // ui/message に巨大なJSONや画像を添付するとiPhoneで本文に露出するため禁止。
  async function requestAdaptiveExplanation(ctx){
    var q=ctx.question, g=ctx.grade;
    if (!q || !g || q.questionId !== g.questionId) throw new Error('EXPLANATION_BINDING_MISMATCH');
    if (!/^E-[A-Za-z0-9_-]{16}$/.test(String(ctx.explanationRef || '')))
      throw new Error('EXPLANATION_REFERENCE_MISSING');
    if (!bridgeReady) await ready;
    var label=(q.year ? q.year+'年度 ' : '')+'問'+q.questionNumber;
    var visible=label+'の各選択肢の判断根拠を、公式資料に基づいて解説してください。（照合番号：'+ctx.explanationRef+'）';
    // ChatGPTが表示するアクセス許可ダイアログの位置はホスト側の管理。
    // ダイアログが画面下部に出る前に、学習枠の最上部に目立つ案内を置く。
    var oldNotice=document.getElementById('aiPermissionNotice');
    if (oldNotice) oldNotice.remove();
    var banner=document.createElement('div');
    banner.id='aiPermissionNotice';
    banner.setAttribute('role','status');
    banner.style.cssText='position:sticky;top:0;z-index:50;padding:16px;margin:8px 0;border:2px solid #3b82f6;border-radius:12px;background:#eff6ff;color:#102c54;font-weight:700;line-height:1.6';
    banner.textContent='AI詳細解説を依頼しています。ChatGPTの画面下部に「アクセスを許可」などの確認が表示された場合は、許可を選んでください。解説は確認後に表示されます。';
    app.prepend(banner);
    banner.scrollIntoView({block:'start',behavior:'instant'});
    // 依頼だけで「解説完了」とせず、モデルがshowMenuへ保存するまで待機する。
    return await rpc('ui/message',{role:'user',content:[{type:'text',text:visible}]});
  }
  async function waitForPublishedExplanation(sessionId, questionId){
    // ui/message の ACK は ChatGPT が依頼を受け取った印であり、解説の保存完了ではない。
    // 通知を落とす iPhone でも保存済みの同一問だけを読取専用で取り戻す。
    var deadline = Date.now() + (window.__qlpTestExplanationWaitMs || 75000);
    while (Date.now() < deadline) {
      if (locked || state.sessionId !== sessionId || state.question?.questionId !== questionId) return;
      try {
        var saved = await callTool('getStudySnapshot', { sessionId:sessionId });
        if (saved && saved.status === 'menu' && saved.menu?.kind === 'next' &&
            saved.menu.body && saved.explanationQuestionId === questionId &&
            saved.sessionId === sessionId) {
          if (!locked && state.sessionId === sessionId && state.question?.questionId === questionId)
            render(saved);
          return;
        }
      } catch(e) { /* 一時的な読取失敗は上限時間内に再試行する */ }
      await new Promise(function(done){ setTimeout(done, 3000); });
    }
    if (!locked && state.sessionId === sessionId && state.question?.questionId === questionId)
      throw new Error('EXPLANATION_PUBLISH_TIMEOUT');
  }
  async function loadExplanation(questionId, requestAi){
    if (!state.sessionId) throw new Error('EXPLANATION_SESSION_MISSING');
    var args = { sessionId: state.sessionId };
    if (questionId) args.questionId = questionId;
    // 初回のツール登録・MCP接続・照合番号保存の時間差を、本人に押し直させずここで吸収する。
    // 同じ採点済み問の読取GETだけを最大3回再実行。採点や次問の進行には触れない。
    var ctx = null, lastError = null;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        ctx = await callTool('explainSpec', args);
        lastError = null;
      } catch (error) {
        lastError = error;
        ctx = null;
      }
      if (ctx && ctx.status === 'explanationContext' && !ctx.error) break;
      if (ctx && /^(?:EXPLANATION_BINDING_MISMATCH|EXPLANATION_SOURCE_MISMATCH)$/.test(String(ctx.error || '')))
        throw new Error('EXPLANATION_CONTEXT_STALE');
      if (attempt < 2) await new Promise(function(done){ setTimeout(done, attempt ? 240 : 90); });
    }
    if (!ctx || ctx.error || ctx.status !== 'explanationContext' ||
        ctx.sessionId !== state.sessionId || !ctx.question || !ctx.grade ||
        ctx.question.questionId !== ctx.grade.questionId ||
        (questionId && ctx.grade.questionId !== questionId))
      throw new Error('EXPLANATION_CONTEXT_UNAVAILABLE');
    if (requestAi) {
      try {
        await requestAdaptiveExplanation(ctx);
        await waitForPublishedExplanation(ctx.sessionId, ctx.question.questionId);
      } finally {
        var notice = document.getElementById('aiPermissionNotice');
        if (notice) notice.remove();
      }
    }
    else renderVerifiedExplanation(ctx);
  }
  function answerReferenceName(g){
    if (g && g.answerSourceType === 'secondary_web_answer') return '掲載サイトの解答表（非公式）';
    if (g && g.answerSourceType === 'archived_official_pdf_copy') return '法務省公表の正答PDF（掲載サイト転載）';
    return '公式の正答PDF';
  }
  function answerReferenceLink(g){
    var source = g && safeUrl(g.answerPdfUrl);
    if (!source) return '確認できませんでした';
    return '<a href="' + esc(source) + '" target="_blank" rel="noopener">' +
      esc(answerReferenceName(g)) + '</a>';
  }
  function answerStatusName(g){ return g && g.answerSourceType === 'secondary_web_answer'
    ? '掲載サイトの解答（非公式）' : '公式正答'; }
  function renderVerifiedExplanation(ctx){
    var q = ctx.question, g = ctx.grade;
    var label = (q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber;
    var ans = g.correctAnswerLabel || g.correctAnswer;
    var choices = Array.isArray(q.choices) ? q.choices : [];
    var table = choices.map(function(c,i){
      var n = i + 1, selected = String(g.selected) === String(n);
      var correct = (g.acceptedAnswers || [g.correctAnswer]).some(function(x){return String(x) === String(n);});
      return '<li><b>' + esc(n) + '</b>　' + esc(c) +
        (correct ? '　<b>【正答】</b>' : '') + (selected ? '　【あなたの回答】' : '') + '</li>';
    }).join('');
    var pdf = safeUrl(g.answerPdfUrl);
    var j = ctx.journey || {};
    app.innerHTML = journeyBar(j.fieldIndex, j.fieldTotal, j.stage, j.fieldName) + '<h2>' + esc(label) + 'の' + esc(answerStatusName(g)) + 'との照合</h2>' +
      '<div class="result ' + (g.correct ? 'ok' : 'ng') + '">' + (g.correct ? '✓ 正解' : '✕ 不正解') + '</div>' +
      '<div class="stem"><b>' + esc(answerStatusName(g)) + '：' + esc(ans) + '</b>　／　あなたの回答：' + esc(g.selected == null ? '分からない' : g.selected) + '</div>' +
      (table ? '<div class="stem"><b>各選択肢の原文と正答</b><ol class="ov-l">' + table + '</ol></div>' : '') +
      (pdf ? '<div class="notice">解答の根拠：' + answerReferenceLink(g) + '</div>' : '') +
      '<div class="notice">ここまでは' + esc(answerStatusName(g)) + 'との照合です。AIの詳しい解説は、この下の新しい学習画面に操作ボタンと一緒に表示します。</div>' +
      '<div class="row"><button id="explanationNext">次の問題へ</button></div>' + endBar();
    scrollUp(true); bindEnd();
    document.getElementById('explanationNext').onclick = async function(){
      this.disabled = true;
      try {
        var out = state.next || await callTool('nextQuestion', { sessionId: state.sessionId });
        if (!out || out.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(out.status)) throw new Error('NEXT_UNAVAILABLE');
        state.next = null; render(out);
      } catch(e) { var b = document.getElementById('explanationNext'); if(b) b.disabled = false; }
    };

  }
  function officialAnswerSummary(q, g){
    if (!q || !g || g.skipped) return '';
    var choices = Array.isArray(q.choices) ? q.choices : [];
    var accepted = g.acceptedAnswers || [g.correctAnswer];
    var items = choices.map(function(c, i){
      var n = i + 1;
      var correct = accepted.some(function(a){ return String(a) === String(n); });
      var selected = String(g.selected) === String(n);
      return '<li><b>' + esc(n) + '</b>　' + esc(c) +
        (correct ? '　<b>【正答】</b>' : '') +
        (selected ? '　【あなたの回答】' : '') + '</li>';
    }).join('');
    return '<section class="stem official-answer-summary" aria-label="採点後の簡易解説">' +
      '<b>■' + esc(answerStatusName(g)) + '・簡易解説（採点と同時に表示）</b>' +
      '<p>正答は ' + esc(g.correctAnswerLabel || g.correctAnswer) + ' です。' +
      (g.dontKnow ? '正答を確認して復習しましょう。' : g.correct ? '正しく選べています。' : 'あなたの回答と公式正答を比較しましょう。') + '</p>' +
      (items ? '<b>各選択肢と正答の位置</b><ol class="ov-l">' + items + '</ol>' : '') +
      '<p>ここまでは' + (g.answerSourceType === 'secondary_web_answer' ? '掲載サイトの解答表（非公式）' : '保存済みの公式正答') + 'との照合です。選択肢ごとの判断根拠や必要な計算過程は「AIの詳しい解説を追加」で確認できます。</p></section>';
  }
  function gradeBanner(g, label){
    var correct = !!g.correct;
    return '<div class="result result-grade ' + (correct ? 'ok' : 'ng') + '" role="status">' +
      '<span class="grade-word">' + (correct ? '✓ 正解！' : '✕ 不正解') + '</span>' +
      '<span class="grade-detail">' + (label ? esc(label) + ' ／ ' : '') + 'あなたの答え：' + esc(g.selected) + '　正答：' + esc(g.correctAnswerLabel || g.correctAnswer) + '</span></div>';
  }
  function showGrade(g){
    if (!g) return;
    var q = state.question || {};
    var h = '';
    if (g.skipped) h = '<div class="result">スキップしました。</div>';
    else {
      (g.acceptedAnswers || [g.correctAnswer]).forEach(function(n){ var c = app.querySelector('.choices .opt[data-n="' + n + '"]'); if (c) c.classList.add('correct'); });
      h = gradeBanner(g, '');
      if (safeUrl(g.answerPdfUrl)) h += '<div class="notice">解答の根拠：' + answerReferenceLink(g) + '</div>';
    }
    // 同じ分野で3問続けて間違えたら、確認問題で基本を確かめるかを聞く（マスタープロンプトどおり。AIはこの採点を見ないので画面から頼む）
    if (g.checkSuggested) h += '<div class="notice"><b>同じ分野で3問続けて間違えました。</b>確認問題（AIが作った短い問題）で基本を確かめますか？</div><div class="row"><button id="check">確認問題で基本を確かめる</button></div>';
    var label = (q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber;
    // 強制補強中は「次の問題へ」ボタンを一切出さない。
    if (g.checkSuggested) {
      app.innerHTML = h + officialAnswerSummary(q, g) + '<div class="row"><button id="checkExp">AIの詳しい解説を追加</button></div>' + endBar();
      var mandatory = document.getElementById('check');
      mandatory.onclick = function(){
        this.disabled = true;
        ask((q.fieldName || 'この分野') + 'で3問連続不正解でした。次の公式過去問は出さず、AI作成の確認問題を1問ずつ出してください。確認問題をregisterRemediationQuestionへ先に登録し、利用者の回答を画面側で採点してください。正解時だけ同じ分野の公式実践問題へ戻してください。', (q.fieldName || 'この分野') + 'の確認問題で基本を確かめる');
      };
      document.getElementById('checkExp').onclick = function(){
        var b = document.getElementById('checkExp');
        b.disabled = true;
        b.textContent = 'AI解説を追加しています…';
        loadExplanation(q.questionId, true).catch(function(){
          if (b.isConnected) { b.disabled = false; b.textContent = 'AI解説の追加を再試行'; }
          if (!document.getElementById('explanationError')) app.insertAdjacentHTML('beforeend', '<div class="notice" id="explanationError" role="alert">AI解説の依頼に失敗しました。公式正答・簡易解説はそのまま表示しています。</div>');
        });
      };
      bindEnd();
      return;
    }
    // 次の問題は、AIが呼び出す新しい枠で「この下」に出す（上に固定した枠の中身を入れ替えない）。inPlace のときだけ、この枠の中で進む（下に出ないときの逃げ道）
    var nextInPlace = async function(){
      var n = state.next || await callTool('nextQuestion', { sessionId: state.sessionId });
      if (!n || n.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(n.status)) throw new Error('NEXT_UNAVAILABLE');
      if (state.next === n) state.next = null;
      render(n);
      window.scrollTo(0, 0);
    };
    var nextBtn = function(inPlace){
      document.getElementById('next').onclick = inPlace ? nextInPlace : function(){ nextBelow(nextInPlace); };
    };
    if (g.skipped) { nextBelow(nextInPlace); return; }
    // 「分からない」：採点に数えず、正答を見せて復習に回す（解説も頼める）
    if (g.dontKnow) {
      (g.acceptedAnswers || [g.correctAnswer]).forEach(function(n){ var ck = app.querySelector('.choices .opt[data-n="' + n + '"]'); if (ck) ck.classList.add('correct'); });
      var dpdf = answerReferenceLink(g);
      app.innerHTML = '<div class="result">' + esc(label) + '：分からない（採点には数えません）</div>' +
        officialAnswerSummary(q, g) + '<div class="stem">解答の根拠：' + dpdf + '<br>この問題は復習に登録しました。</div>' +
        '<div class="row"><button id="dkExp">AIの詳しい解説を追加</button><button id="next">次の問題へ</button></div>' +
        sourceManagerBar();
      nextBtn(); bindSourceManager();
      document.getElementById('dkExp').onclick = async function(){
        this.disabled = true;
        try { await loadExplanation(q.questionId, true); }
        catch(e){ this.disabled = false; app.insertAdjacentHTML('beforeend','<div class="notice" role="alert">解説を取得できませんでした。同じ問題で再試行してください。</div>'); }
      };
      return;
    }
    // 採点後は正誤・公式正答・全選択肢の簡易解説を即時表示。AIは詳しい判断根拠だけを下部の新しい枠に追加。
    var pdf = answerReferenceLink(g);
    var fieldChange = state.next?.status === 'question' && state.next.question?.kind === 'new' &&
      q.fieldName && state.next.question.fieldName && q.fieldName !== state.next.question.fieldName;
    var progress = q.progress || {};
    app.innerHTML = journeyBar(progress.fieldIndex, progress.fieldTotal, 'practice' + Math.min(3, progress.fieldQuestion || 1), q.fieldName) +
      gradeBanner(g, label) +
      '<div class="stem"><b>■採点</b><br>' + (g.correct ? '正解です。' : '不正解です。') + '<br>正答：' + esc(g.correctAnswerLabel || g.correctAnswer) + '<br>解答の根拠：' + pdf + '</div>' +
      officialAnswerSummary(q, g) +
      (g.checkSuggested ? '<div class="notice"><b>補強の問題も続けて間違えました。</b>確認問題（AIが作った短い問題）で基本を確かめることもできます。</div>' : '') +
      (g.reinforceNext ? '<div class="notice"><b>この分野を続けて間違えたので、次は同じ分野の過去問で補強します。</b></div>' : '') +
      '<div class="stem"><b>■次の選択</b></div><div class="choices"><button id="next"><b>1</b><span>' + (fieldChange ? '次の分野の問題へ' : '次の問題へ') + '</span></button>' +
      '<button id="exp"><b>2</b><span>AIの詳しい解説を追加</span></button>' +
      (fieldChange ? '<button id="continueField"><b>3</b><span>この分野の実践問題を続ける</span></button><button id="review"><b>4</b><span>総復習（間違えた問題）</span></button>' : '') +
      '<button id="endStudy"><b>' + (fieldChange ? '5' : '3') + '</b><span>学習を終了する</span></button></div>' + sourceManagerBar();
    scrollUp();
    nextBtn(); bindEnd();
    var sendDisplay = async function(){
      var b = document.getElementById('retryDisplay'); if (!b || b.disabled) return;
      b.disabled = true;
      try { await loadExplanation(q.questionId, true); }
      catch(e){
        if (b.isConnected) b.disabled = false;
        var msg = document.getElementById('explanationError');
        if (!msg) app.insertAdjacentHTML('beforeend', '<div class="notice" id="explanationError" role="alert">同じ問題の解説を取得できませんでした。学習状態を保持したまま再表示できます。</div>');
      }
    };
    document.getElementById('exp').onclick = function(){
      var b = document.getElementById('exp');
      if (b) { b.disabled = true; b.querySelector('span').textContent = 'AI解説を追加しています…'; }
      loadExplanation(q.questionId, true).catch(function(){
        var retry = document.getElementById('exp');
        if (retry) { retry.disabled = false; retry.querySelector('span').textContent = 'AI解説の追加を再試行'; }
        var msg = document.getElementById('explanationError');
        if (!msg) app.insertAdjacentHTML('beforeend', '<div class="notice" id="explanationError" role="alert">AI解説の依頼に失敗しました。採点結果はそのまま保持しています。</div>');
      });
    };
    if (fieldChange) document.getElementById('review').onclick = function(){
      nextBelow(async function(){
        var r = await callTool('nextQuestion', { sessionId: state.sessionId, question: '総復習（間違えた問題）' });
        if (r?.status === 'reviewEmpty') { showGrade(g); app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc(r.notice) + '</div>'); return; }
        if (!r || r.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(r.status)) throw new Error('REVIEW_UNAVAILABLE');
        render(r);
      });
    };
    if (fieldChange) document.getElementById('continueField').onclick = async function(){
      this.disabled = true;
      try {
        var r = await callTool('nextQuestion', { sessionId: state.sessionId, question: 'この分野の未出題の実践問題を続ける' });
        if (r?.status === 'fieldExhausted') { this.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc(r.notice) + '</div>'); return; }
        if (!r || r.error || !['question','waiting','finished','remediation','sourceUnavailable'].includes(r.status)) throw new Error('NEXT_UNAVAILABLE');
        render(r);
      } catch (e) { this.disabled = false; app.insertAdjacentHTML('beforeend', '<div class="notice" role="alert">同じ分野の問題を取得できませんでした。もう一度押してください。</div>'); }
    };
    if (g.checkSuggested) document.getElementById('check').onclick = function(){
      waitMore('確認問題はこの下に出ます。答え合わせのあと、その下に進むためのボタンが出ます。');
      displayAction = '確認問題を見る';
      lastDisplayRequest = (q.fieldName || 'この分野') + 'を続けて間違えたので、基本を確かめる確認問題（AIが作った問題）をお願いします。';
      sendDisplay();
    };
  }
  // 画面の下の「今日はここまで」：終了時刻・学習時間・累計をエンジンが確定し、終了ログと引継ぎデータを出す（AIに任せない）
  function endBar(){ return sourceManagerBar() + '<div class="row" style="margin-top:14px"><button id="endStudy">学習を終了する</button></div>'; }
  function bindEnd(){
    bindSourceManager();
    var b = document.getElementById('endStudy'); if (!b) return;
    b.onclick = async function(){
      b.disabled = true;
      try {
        var ids = loadIds(); var lid = currentStudyId || ids.studyId || studyLid || ids.lid || state.sessionId || ids.sid;
        var r = await callTool('endStudy', { studyId: lid, sessionId: state.sessionId || lid, area: studyField || undefined, item: studyField || undefined, purpose: studyField ? studyField + 'の要点をつかみ、過去問で得点できるか確かめる' : undefined });
        if (!r || r.error || typeof r.handoff !== 'string' || typeof r.log !== 'string' || typeof r.display !== 'string') throw new Error('end');
        showEnd(r);
        scrollUp(true);
      } catch (e) {
        b.disabled = false;
        app.insertAdjacentHTML('beforeend', '<div class="notice">終了できませんでした。もう一度押してください。</div>');
      }
    };
  }
  // 学習データを会話に添付せず、保存済みの進行状態だけを学習エンジンから読む。
  // 画面を行き来したときにも、採点・nextQuestion・startStudyは自動実行しない。
  var restoring = false, wasHidden = false;
  // タップ中の読取再描画でボタンをDOMから外さない。ホスト通知による更新は通常どおり処理。
  var lastLocalInteractionAt = 0;
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', function(){ lastLocalInteractionAt = Date.now(); }, true);
    document.addEventListener('keydown', function(){ lastLocalInteractionAt = Date.now(); }, true);
  }
  // 通信通知が届かないiOSでも、最初の枠がサーバーの保存済み表示を取りに行く。
  // 重複通知とポーリングはrestoringで重複排除し、学習の出題・採点は実行しない。
  function studyViewPoll(){
    // 操作中や直後はUIに触らず、操作が止まった時だけ同期する。
    // フレーム間の更新通知はscheduleFirstFrameRefreshで別途即座に反映する。
    if (ownedSession && !locked && !sourceManagerOpen && !document.hidden && bridgeReady && !restoring &&
        Date.now() - lastLocalInteractionAt > 30000)
      restoreFromServer(false);
    setTimeout(studyViewPoll, 12000);
  }
  setTimeout(studyViewPoll, 4500);
  async function restoreFromServer(manual){
    if (restoring) return;
    if (!state.sessionId) {
      // 別資格の過去のsessionIdがlocalStorageに残っていても新しい資格へ流用しない。
      var currentInput = input() || {}, currentOutput = openaiOutput() || {};
      state.sessionId = currentInput.sessionId || currentOutput.sessionId ||
        (manual && !currentInput.qualificationId ? loadIds().sid : null);
    }
    if (!state.sessionId) { showRecovery('学習セッションの情報を取得できませんでした。新しい学習画面から再開してください。'); return; }
    restoring = true;
    var button = document.getElementById('reopenStudy') || document.getElementById('recoverStudy');
    if (button) { button.disabled = true; button.textContent = '復元しています…'; }
    var buttonGuard = setTimeout(function(){ if (restoring && button && button.isConnected) { button.disabled = false; button.textContent = '再度、学習画面を復元'; } }, 9000);
    try {
      var restored = await callTool('getStudySnapshot', { sessionId: state.sessionId });
      if (!restored || restored.error || !restored.status || restored.status === 'error') {
        var previous = loadIds(), backup = studyLid || previous.lid;
        if (!backup || backup === state.sessionId) throw new Error('RESTORE_UNAVAILABLE');
        restored = await callTool('getStudySnapshot', { sessionId: backup });
      }
      if (!restored || restored.error || !restored.status || restored.status === 'error') throw new Error('RESTORE_UNAVAILABLE');
      // 通常の背景更新では、意味のある現在画面を汎用的な待機表示で上書きしない。
      if (!manual && hasView && restored.status === 'restoreIdle') return;
      // 明示的な再開だけ所有枠を切り替える。自動復元は元の枠を奪わない。
      if (locked && !manual) return;
      if (manual && !claimFirstFrame(state.sessionId, true)) throw new Error('FRAME_CLAIM_FAILED');
      locked = false;
      app.classList.remove('is-old');
      app.style.opacity = '';
      if (manual) myAt = Math.max(Date.now(), myAt + 1);
      state.question = null; state.next = null; state.answered = false;
      render(restored);
    } catch (e) {
      if (button) { button.disabled = false; button.textContent = '学習画面を復元'; }
      var err = document.getElementById('restoreError');
      if (!err) { app.insertAdjacentHTML('beforeend', '<div id="restoreError" class="notice" role="alert"></div>'); err = document.getElementById('restoreError'); }
      err.textContent = '学習状態を復元できませんでした。同じボタンで再試行できます。';
    } finally { clearTimeout(buttonGuard); restoring = false; }
  }
  if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', function(){
    if (document.hidden) { wasHidden = true; return; }
    if (!wasHidden) return;
    wasHidden = false;
    if (!locked && state.sessionId) restoreFromServer(false);
  });
  if (typeof window.addEventListener === 'function') window.addEventListener('pageshow', function(e){
    if (e.persisted && !locked && state.sessionId) restoreFromServer(false);
  });
  window.addEventListener('message', function(e){
    if (e.source !== window.parent) return;
    var m = e.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && !m.method && pending[m.id]) { var p = pending[m.id]; clearTimeout(p.timer); delete pending[m.id]; if (m.error) p.rej(m.error); else p.res(m.result); return; }
    if (m.method === 'ui/notifications/tool-input' && m.params && m.params.arguments && m.params.arguments.sessionId) state.sessionId = state.sessionId || m.params.arguments.sessionId;
    if (m.method === 'ui/notifications/tool-result' && m.params) render(full(m.params));
  });
  // 画面の高さをアプリ側に伝える（iPhone のアプリで、枠だけ出て中身が出ないのを防ぐ）
  // 新しい場面は枠の上から見せる（枠の中で下にスクロールしたままだと、上の内容が見えない）
  // 新しい場面の先頭に印を付け、フォーカスとスクロールを同じ位置へ揃える。
  // ChatGPTホストのスクロール位置は直接制御できない。学習枠の高さを固定し、
  // 遷移時はその枠内だけを先頭に戻す（外側の会話を動かす scrollIntoView は避ける）。
  // 初回の過去問は学習画面が直接 nextQuestion を取得する。
  // 再試行も同じ要求を使い、まだ出題されていない問題へ redisplayQuestion を呼ばない。
  function nextBelow(fallback, say){
    app.innerHTML = '<div id="nextStatus" class="notice" role="status">公式過去問を取得しています…</div>' +
      '<div class="row"><button id="nextHere" disabled>取得中…</button></div>';
    scrollUp(true);
    var busy = false;
    async function requestSame(){
      if (locked || busy) return;
      busy = true;
      var btn = document.getElementById('nextHere');
      if (btn) { btn.disabled = true; btn.textContent = '取得中…'; }
      var status = document.getElementById('nextStatus');
      if (status) status.textContent = '公式過去問を取得しています…';
      try {
        if (typeof fallback !== 'function') throw new Error('MISSING_NEXT_REQUEST');
        await fallback();
      } catch (e) {
        var retry = document.getElementById('nextHere');
        if (retry) { retry.disabled = false; retry.textContent = '再試行'; }
        var note = document.getElementById('nextStatus');
        if (note) {
          note.setAttribute('role', 'alert');
          note.textContent = '公式過去問の取得に失敗しました。学習記録は変更していません。「再試行」で同じ問題の取得を試してください。';
        }
      } finally {
        busy = false;
      }
    }
    document.getElementById('nextHere').onclick = requestSame;
    requestSame();
  }
  var latestFocusTurn = 0;
  function scrollUp(noMark){
    if (!app || typeof app.querySelector !== 'function') return;
    // noMark は従来の画面で使われているが、最新の画面には常に目印を付ける。
    // 同じ画面内で再表示した場合は既存の目印を使い、二重に挿入しない。
    var latest = app.querySelector('.latest');
    if (!latest) {
      app.insertAdjacentHTML('afterbegin', '<div class="latest" tabindex="-1">▼ この学習枠の先頭です</div>');
      latest = app.querySelector('.latest');
    } else if (app.firstElementChild !== latest) {
      app.insertBefore(latest, app.firstChild);
    }
    var turn = ++latestFocusTurn;
    function align(){
      if (turn !== latestFocusTurn || locked || !latest.isConnected) return;
      try { latest.focus({ preventScroll: true }); } catch(e) { try { latest.focus(); } catch(x) {} }
      // 内部縦スクロールは持たない。画面先頭にある最新表示へ移動を依頼する。
      // ChatGPT本体の位置はホスト管理のため確実な制御はできない。
      try { window.scrollTo(0, 0); } catch(e) {}
      try { latest.scrollIntoView({behavior:'instant',block:'start',inline:'nearest'}); } catch(e) {}
    }
    align();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){
      if (turn !== latestFocusTurn) return;
      fit(); align();
    });
    setTimeout(function(){ if (turn === latestFocusTurn) { fit(); align(); } }, 160);
  }
  // 自動で全画面に移動しない。ChatGPT本体の縦スクロールを維持し、二重スクロールを避ける。
  var fullAsked = false;
  function syncDisplayMode(){
    var classes = document.documentElement && document.documentElement.classList;
    if (!classes) return;
    if (window.openai && window.openai.displayMode === 'fullscreen') classes.add('study-fullscreen');
    else classes.remove('study-fullscreen');
  }
  function goFull(){
    if (fullAsked) return; fullAsked = true;
    try {
      if (window.openai && window.openai.requestDisplayMode) {
        Promise.resolve(window.openai.requestDisplayMode({ mode: 'fullscreen' })).then(syncDisplayMode).catch(function(){});
        return;
      }
      if (bridgeReady) rpc('ui/request-display-mode', { mode: 'fullscreen' }).then(syncDisplayMode).catch(function(){});
    } catch (e) {}
  }
  // iPhoneではクリックで全画面に切り替えると二重のスクロール画面が生まれるため自動呼出ししない。
  // 内容の自然高さでホストに枠サイズを伝える。旧枠に置き換わった場合も縮む。
  function fit(){
    var h = Math.ceil(app.offsetHeight) + 2;
    try { if (window.openai && window.openai.notifyIntrinsicHeight) window.openai.notifyIntrinsicHeight(h); } catch (e) {}
    if (bridgeReady) notify('ui/notifications/size-changed', { width: window.innerWidth, height: h });
  }
  try { new ResizeObserver(fit).observe(app); } catch (e) {}
  fit();
  window.addEventListener('openai:set_globals', function(){
    syncDisplayMode();
    // iOSではMCPブリッジ初期化後に初回toolOutputが到着する場合がある。
    // bridgeReadyで遮断すると初回問題が描画されず、利用者の再要求で初めて表示される。
    if (window.openai && !hasView) render(openaiOutput());
  });
  function openaiOutput(){ var o = window.openai; return o ? ((o.toolResponseMetadata && o.toolResponseMetadata.qlp) || o.toolOutput) : null; }
  // MCP本体のバージョンとMCP Apps UIのバージョンは別。部分的なopenai.toolOutputがあっても初期化する。
  var ready = rpc('ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: {}, appInfo: { name: 'qlp-question', version: '${WIDGET_VERSION}' } }).then(function(){
    bridgeReady = true;
    notify('ui/notifications/initialized', {});
    fit();
    diag('bridge_ready');
    // 長い問題や解説はチャット側に自然な縦長の枠として表示する。
    // 同じセッションの画面が再生成された場合、現在の回答待ち・採点画面へ復元する。
    var stored = loadIds();
    if (!state.sessionId && input().sessionId) state.sessionId = input().sessionId;
    var initial = openaiOutput() || {};
    // ブリッジ初期化時に出力が既に届いていれば、初回描画を必ず試みる。
    if (!hasView && window.openai) render(initial);
    // 新規のneedPlanは初回用の正規画面であり、起動直後に復元で置き換えない。
    // iOSで初回画面を描画した直後に restoreIdle に切り替わる症状を防ぐ。
    var explicitSession = !!(state.sessionId || input().sessionId || initial.sessionId);
    if (explicitSession && !hasView) restoreFromServer(false);
    else if (explicitSession && hasView && !locked && !app.querySelector('button:not([disabled])')) restoreFromServer(false);
  });
  ready.catch(function(){
    if (window.openai) { render(openaiOutput()); diag('legacy_ready'); }
    if (!hasView) unavailable();
  });
  function showRecovery(message){
    app.innerHTML = '<h2>資格学習</h2><div class="notice" role="alert">' + esc(message) + '</div><div class="row"><button id="recoverStudy" type="button">学習画面を復元</button></div>';
    document.getElementById('recoverStudy').onclick = function(){ restoreFromServer(true); };
    fit();
  }
  function unavailable(){
    showRecovery('学習画面との接続が切れています。復元ボタンで同じ学習状態を読み直してください。');
  }
  if (window.openai) render(openaiOutput());
  setTimeout(function(){
    if (!hasView && !restoring) {
      // toolOutputがホストから届かなかった場合にも復元を試みる。
      // 別資格の古いIDを無条件に流用しない。
      if (state.sessionId && bridgeReady) { restoreFromServer(false); return; }
      unavailable();
      // 古い資格のIDを使って自動復元しない。表示できない場合は利用者操作だけで復旧する。
    }
  }, 10000);
})();
</script></body></html>`;
}
