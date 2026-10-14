export const OFFICIAL_PAST_QUESTION_RETENTION = Object.freeze({
  retentionYears: 10,
  policy: "latest_published_year",
  missingLatestYearBehavior: "keep_previous_window_and_mark_pending",
  futureYearBehavior: "never_guess_url"
});

export function calculateRetentionWindow(latestPublishedYear, retentionYears = 10) {
  if (!Number.isInteger(latestPublishedYear) || latestPublishedYear < 1900) throw new TypeError("invalid latest year");
  if (!Number.isInteger(retentionYears) || retentionYears < 1) throw new TypeError("invalid retention years");
  return Object.freeze({ latestYear: latestPublishedYear, oldestYear: latestPublishedYear - retentionYears + 1, retentionYears });
}

export function classifyPastQuestionRows(rows, { latestPublishedYear = null, retentionYears = 10 } = {}) {
  const publishedYears = rows.filter(r => r.url && Number.isInteger(r.year)).map(r => r.year);
  const latest = latestPublishedYear ?? (publishedYears.length ? Math.max(...publishedYears) : null);
  if (latest === null) return { status: "no_published_year", active: [], archived: rows, window: null };
  const window = calculateRetentionWindow(latest, retentionYears);
  const active=[], archived=[];
  for (const row of rows) {
    const inWindow=Number.isInteger(row.year)&&row.year>=window.oldestYear&&row.year<=window.latestYear;
    (row.url&&inWindow?active:archived).push(row);
  }
  return { status: "ready", active, archived, window };
}
