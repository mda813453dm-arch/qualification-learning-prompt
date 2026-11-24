// v210: exact v206 year/focus transformations and immutable v209 restore/display base.
// Historical v205–v209 modules are unchanged and served at their original URIs.
import { widgetHtml as previousHtml, WIDGET_VERSION as PREVIOUS_VERSION, PREPARED_LESSONS, WIDGET_MIME } from './widget-v209.js';
export const WIDGET_URI = 'ui://qlp/question-v210.html';
export const WIDGET_VERSION = '2026-11-24.210';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml(){
  const before = previousHtml();
  let html = before.replaceAll(PREVIOUS_VERSION, WIDGET_VERSION);
  if (html === before) throw new Error('V210_VERSION_MARKER_MISSING');
  // HTMLを置き換える置換はこのヘルパーに寄せる。アンカーがちょうど1回だけ現れること。
  // 置換する文字列に正規表現の `$` を含むため、置換文字列の `$` 展開を避ける関数形で置き換える。
  function replaceOnce(anchor, target, code) {
    if (html.split(anchor).length !== 2) throw new Error(code);
    html = html.replace(anchor, function(){ return target; });
  }
  // （A）年度の読み取り：2025への既定値付けをやめ、判定結果を返す。
  replaceOnce(String.raw`  function descriptiveTopicYear(topic){
    var t = String(topic || '').normalize('NFKC');
    var m = t.match(/(^|[^0-9])(20(?:0[7-9]|1\d|2[0-5]))(?=$|[^0-9])/);
    return m ? Number(m[2]) : 2025;
  }
`, String.raw`  // 記述式の対応年度は2007〜2025年度（エンジンの原本表と同じ範囲）。
  // 対応可否の最終判断はエンジン（openDescriptiveQuestion の 422）が行い、
  // 画面はその hint をそのまま出す。画面は年度を別年度へ置き換えない（Issue #5）。
  function descriptiveSupportedYear(year){
    return Number.isInteger(year) && year >= 2007 && year <= 2025;
  }
  // 希望に書かれた年度を読み取る。戻り値は {year, issue}。
  // issue は null（対応年度・年度なし）/ 'unsupported'（明示した未対応年度）/
  // 'unreadable'（解釈不能：2桁・3桁の年度、昭和表記、元号の数値が読めない入力）/
  // 'ambiguous'（矛盾する：複数の年度）のいずれか。
  // 判定の優先順位は 矛盾する ＞ 解釈不能 ＞ 未対応。
  // 年度を書いていない場合は {year:null, issue:null} を返し、2025へ既定値付けしない。
  // 平成18年度（2006年）は読める年度として未対応、26年度と昭和表記は解釈不能とする（Issue #5 r2）。
  function descriptiveTopicYearInfo(topic){
    // Building age is not part of an exam-year request.
    var t = String(topic || '').normalize('NFKC').replace(/築\s*\d+\s*年(?!度)/g, ' ');
    var years = [];
    var unreadable = false;
    function addYear(y) { if (years.indexOf(y) === -1) years.push(y); }
    var rest = t.replace(/(令和|平成|(?<![A-Za-z])[RH])\s*(元|\d+)(?:\s*年度?)?/g, function(_, era, value){
      var n = value === '元' ? 1 : Number(value);
      if (era === '令和' || era === 'R') {
        if (n >= 1 && n <= 999) addYear(2018 + n); else unreadable = true;
      } else {
        if (n >= 1 && n <= 31) addYear(1988 + n); else unreadable = true;
      }
      return ' ';
    });
    // Read every complete four-digit western year, not just 19xx/20xx.
    rest = rest.replace(/(?<!\d)(\d{4})(?!\d)(?:\s*年度?)?/g, function(_, digits){
      addYear(Number(digits));
      return ' ';
    });
    // Explicit but malformed years cannot be substituted by the default.
    if (/昭和|令和|平成|(?<![A-Za-z])[RH]\s*年度?|(?:元|\d+)\s*年度|\b\d+\s*年(?!度)/.test(rest)) unreadable = true;
    if (years.length > 1) return { year: null, issue: 'ambiguous' };
    if (unreadable) return { year: null, issue: 'unreadable' };
    if (years.length === 1 && !descriptiveSupportedYear(years[0])) return { year: years[0], issue: 'unsupported' };
    return { year: years.length === 1 ? years[0] : null, issue: null };
  }
  // 年度の判定結果に対応する案内文を返す。判定に問題がない場合は '' を返す。
  // 未対応は「未対応です」、解釈不能は西暦4桁での再指定、矛盾する年度は一つだけ指定するよう案内する。
  function descriptiveYearIssueNotice(info){
    if (!info || !info.issue) return '';
    if (info.issue === 'unsupported') return '指定年度は未対応です。' + info.year + '年度の記述式は検証済みの原本がないため出題できません。別年度の問題は取得しません。対応する年度を明示的に選んでください。';
    if (info.issue === 'unreadable') return '年度が読み取れませんでした。年度を西暦4桁で指定してください。（例：2025年度）';
    return '年度を一つだけ指定してください。';
  }
  function descriptiveTopicYear(topic){
    var info = descriptiveTopicYearInfo(topic);
    return info.issue ? null : info.year;
  }
`, 'V210_TOPIC_YEAR_ANCHOR_MISSING');
  // （B）メニュー冒頭：希望の年度判定を行い、案内文を作る。既定値 2025 は年度省略時の選択肢として残す。
  replaceOnce(String.raw`  function showDescriptiveMenu(year, onlyQuestion, requestedTopic){
    year = Number(year) || 2025;
`, String.raw`  function showDescriptiveMenu(year, onlyQuestion, requestedTopic){
    // 希望に書かれた年度の判定（Issue #5）。明示された年度を別年度へ置き換えない。
    // 未対応年度は「未対応です」、解釈不能な年度は西暦4桁での再指定、
    // 矛盾する年度は「年度を一つだけ指定してください」と案内し、
    // 対応する年度を利用者が明示的に選んだ場合だけ問題を開く。
    var topicInfo = requestedTopic ? descriptiveTopicYearInfo(requestedTopic) : { year: null, issue: null };
    var unsupportedYear = topicInfo.issue === 'unsupported' ? topicInfo.year : null;
    var needsYearChoice = topicInfo.issue === 'ambiguous' || topicInfo.issue === 'unreadable';
    var menuNotice = descriptiveYearIssueNotice(topicInfo);
    year = Number(year) || 2025;
`, 'V210_MENU_HEAD_ANCHOR_MISSING');
  // （C）年度セレクト：未対応年度は「（未対応）」付きで選択表示し、解釈不能・矛盾する年度は未選択の案内を表示する。
  // 2025年度の選択肢は残すが、未対応・解釈不能・矛盾のときは selected にしない。
  replaceOnce(String.raw`      Array.from({length:19},function(_,i){return 2025-i;}).map(function(y){return '<option value="' + y + '"' + (year === y ? ' selected' : '') + '>' + y + '年度</option>';}).join('') + '</select>' +
`, String.raw`      (unsupportedYear !== null ? '<option value="' + unsupportedYear + '" selected>' + unsupportedYear + '年度（未対応）</option>' : '') +
      (needsYearChoice ? '<option value="" selected>年度を選んでください</option>' : '') +
      Array.from({length:19},function(_,i){return 2025-i;}).map(function(y){return '<option value="' + y + '"' + (year === y && unsupportedYear === null && !needsYearChoice ? ' selected' : '') + '>' + y + '年度</option>';}).join('') + '</select>' +
`, 'V210_MENU_SELECT_ANCHOR_MISSING');
  // （D）案内文の表示：希望の表示の直下と、エラー表示欄の初期値に menuNotice を出す。
  replaceOnce(String.raw`      (requestedTopic ? '<div class="stage-arrived" role="status">✓ 入力した希望「' + esc(requestedTopic) + '」を保持しました。関連する記述式の年度・問題を選んでください。対象問題が一致するかは公式原本で確認します。</div>' : '') +
`, String.raw`      (requestedTopic ? '<div class="stage-arrived" role="status">✓ 入力した希望「' + esc(requestedTopic) + '」を保持しました。関連する記述式の年度・問題を選んでください。対象問題が一致するかは公式原本で確認します。</div>' : '') +
      (menuNotice ? '<div class="notice" role="alert">' + esc(menuNotice) + '</div>' : '') +
`, 'V210_MENU_NOTICE_ANCHOR_MISSING');
  replaceOnce(String.raw`      '<div id="descriptiveError" class="notice" aria-live="polite"></div>' + endBar();
`, String.raw`      '<div id="descriptiveError" class="notice" aria-live="polite">' + esc(menuNotice) + '</div>' + endBar();
`, 'V210_MENU_ERROR_ANCHOR_MISSING');
  // （E）問題を開く操作：対応する年度が選ばれていない場合は出題リクエストを送らない。
  // エンジンが 422 で拒否した場合は、その hint をそのまま出す。
  replaceOnce(String.raw`      button.onclick = async function(){
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
`, String.raw`      button.onclick = async function(){
        var number = Number(button.getAttribute('data-desc'));
        var y = Number(document.getElementById('descriptiveYear').value);
        var error = document.getElementById('descriptiveError');
        // 対応する年度が選ばれていない場合は出題リクエストを送らない（Issue #5）。
        // 未対応年度・解釈不能な年度・矛盾する年度のまま問題を開く操作は、ここで止める。
        if (!descriptiveSupportedYear(y)) {
          var openInfo = requestedTopic ? descriptiveTopicYearInfo(requestedTopic) : { year: null, issue: null };
          error.textContent = descriptiveYearIssueNotice(openInfo) || '年度を一つだけ指定してください。';
          return;
        }
        button.disabled = true;
        error.textContent = '公式原本から問題を読み込んでいます…';
        try {
          var d = await callTool('openDescriptiveQuestion', {
            sessionId: state.sessionId, year: y,
            section: number === 11 ? '午前の部' : '午後の部', number: number
          });
          if (!d || d.error || d.status !== 'descriptiveQuestion') {
            var err = new Error('DESCRIPTIVE_SOURCE_UNAVAILABLE');
            err.hint = d && d.hint ? String(d.hint) : null;
            throw err;
          }
          render(d);
        } catch(e) {
          button.disabled = false;
          // エンジンが 422 で拒否した場合は、その hint をそのまま出す。
          error.textContent = (e && e.hint) || '公式原本を検証して表示できませんでした。同じボタンで再試行できます。';
        }
      };
`, 'V210_MENU_OPEN_ANCHOR_MISSING');
  // （F）初回の拒否判定：年度の拒否判定は saveStudyPlan／startStudy より前に行う（Issue #5 r2）。
  // 未対応・解釈不能・矛盾する年度では、対応する年度を利用者が明示的に選ぶまで
  // 計画保存・学習開始・出題・PDF取得を行わない。拒否時は分野の選択画面へ戻し、希望を保持したまま案内を出す。
  replaceOnce(String.raw`      var draft = draftPlan();
      var requestedDescriptive = draft.startMode ? draft.startMode === 'descriptive' : isDescriptiveStartWish(draft.otherNote);
      // An unmatched topic for descriptive study stays an explicit preference.
      // The learner must choose the official year and question; it must never
      // be changed silently into an unrelated multiple-choice question.
      var saved = await callTool('saveStudyPlan', {
`, String.raw`      var draft = draftPlan();
      var requestedDescriptive = draft.startMode ? draft.startMode === 'descriptive' : isDescriptiveStartWish(draft.otherNote);
      // An unmatched topic for descriptive study stays an explicit preference.
      // The learner must choose the official year and question; it must never
      // be changed silently into an unrelated multiple-choice question.
      // 記述式の年度の拒否判定（Issue #5 r2）。初回の saveStudyPlan／startStudy より前に行う。
      // 未対応・解釈不能・矛盾する年度では、対応する年度を利用者が明示的に選ぶまで
      // 計画保存・学習開始・出題・PDF取得を行わない。拒否時は分野の選択画面へ戻し、
      // 希望を保持したまま案内を出す。
      if (choice?.mode === 'topic' && requestedDescriptive) {
        var startYearNotice = descriptiveYearIssueNotice(descriptiveTopicYearInfo(choice.topic));
        if (startYearNotice) {
          startScopeSelectionForPlan(name, learner, startYearNotice, choice.topic);
          return;
        }
      }
      var saved = await callTool('saveStudyPlan', {
`, 'V210_FIRST_START_GUARD_ANCHOR_MISSING');
  // （G）再開の拒否判定：年度の拒否判定は startStudy より前に行う（Issue #5 r2）。
  // 未対応・解釈不能・矛盾する年度では、対応する年度を利用者が明示的に選ぶまで
  // 計画保存・学習開始・出題・PDF取得を行わない。拒否時は分野の選択画面へ戻し、希望を保持したまま案内を出す。
  replaceOnce(String.raw`      async function resumeWithScope(chosen){
        if (isResuming) return;
        if (chosen.mode === 'review' && wrong === 0) {
          openScope('間違えた問題はまだありません。別の分野またはおまかせを選んでください。');
          return;
        }
        isResuming = true;
`, String.raw`      async function resumeWithScope(chosen){
        if (isResuming) return;
        if (chosen.mode === 'review' && wrong === 0) {
          openScope('間違えた問題はまだありません。別の分野またはおまかせを選んでください。');
          return;
        }
        // 記述式の年度の拒否判定（Issue #5 r2）。再開の startStudy より前に行う。
        // 未対応・解釈不能・矛盾する年度では、対応する年度を利用者が明示的に選ぶまで
        // 計画保存・学習開始・出題・PDF取得を行わない。拒否時は分野の選択画面へ戻し、
        // 希望を保持したまま案内を出す。
        if (chosen.mode === 'topic' && data.startMode === 'descriptive') {
          var resumeYearNotice = descriptiveYearIssueNotice(descriptiveTopicYearInfo(chosen.topic));
          if (resumeYearNotice) {
            openScope(resumeYearNotice, chosen.topic);
            return;
          }
        }
        isResuming = true;
`, 'V210_RESUME_GUARD_ANCHOR_MISSING');
  // Keep the normal placement/scroll behavior, but deferred alignment must not take
  // the keyboard away from a live editable. A new view still focuses its marker.
  replaceOnce(String.raw`      try { latest.focus({ preventScroll: true }); } catch(e) { try { latest.focus(); } catch(x) {} }
`, String.raw`      var active = document.activeElement;
      var editing = active && app.contains(active) &&
        (active.isContentEditable || active.matches('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="email"], input[type="tel"], input[type="url"], input[type="password"]'));
      if (!editing) {
        try { latest.focus({ preventScroll: true }); } catch(e) { try { latest.focus(); } catch(x) {} }
      }
`, 'V210_EDITABLE_FOCUS_ANCHOR_MISSING');
  return html;
}
