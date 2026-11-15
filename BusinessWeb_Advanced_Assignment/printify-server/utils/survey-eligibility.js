/**
 * Khảo sát TAM theo tháng (C23, sửa lại):
 *  - Mọi khách hàng đang hoạt động đều tham gia được, bất cứ lúc nào.
 *  - Mỗi phiếu gắn với kỳ "YYYY-MM". Đã làm trong tháng này -> giao diện báo "đã làm",
 *    nhưng khách vẫn được làm phiếu mới nếu muốn (hệ thống ghi nhận cả lịch sử).
 */
function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function periodOf(r) {
  return r.period || currentPeriod(new Date(r.submittedAt));
}

async function getSurveyEligibility(db, userId, now = new Date()) {
  const period = currentPeriod(now);
  const list = await db.collection('surveyResponses')
    .find({ userId }, { projection: { _id: 1, period: 1, submittedAt: 1, answers: 1 } })
    .toArray();
  const history = list
    .map((r) => ({
      _id: r._id,
      period: periodOf(r),
      submittedAt: new Date(r.submittedAt).toISOString(),
      avg: r.answers?.length ? Math.round((r.answers.reduce((s, a) => s + a.score, 0) / r.answers.length) * 100) / 100 : null,
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const respondedThisPeriod = history.some((h) => h.period === period);
  return {
    eligible: true,
    period,
    hasResponded: respondedThisPeriod,
    respondedThisPeriod,
    lastSubmittedAt: history[0]?.submittedAt ?? null,
    history,
    canSubmit: true,
  };
}

module.exports = { getSurveyEligibility, currentPeriod };
