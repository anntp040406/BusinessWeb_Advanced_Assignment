const test = require('node:test');
const assert = require('node:assert/strict');
const { getSurveyEligibility, currentPeriod } = require('../utils/survey-eligibility');

function mockDatabase(responses = []) {
  return {
    collection() {
      return { find(filter) { return { async toArray() { return responses.filter((r) => r.userId === filter.userId); } }; } };
    },
  };
}
const NOW = new Date(2026, 10, 15);

test('Khách chưa làm lần nào vẫn tham gia được', async () => {
  const s = await getSurveyEligibility(mockDatabase(), 'u01', NOW);
  assert.equal(s.canSubmit, true);
  assert.equal(s.respondedThisPeriod, false);
  assert.equal(s.period, '2026-11');
});
test('Đã làm tháng trước -> tháng này vẫn là chưa làm, có lịch sử', async () => {
  const s = await getSurveyEligibility(mockDatabase([{ _id: 'a', userId: 'u01', period: '2026-10', submittedAt: '2026-10-05T00:00:00Z', answers: [{ score: 4 }] }]), 'u01', NOW);
  assert.equal(s.respondedThisPeriod, false);
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].avg, 4);
});
test('Đã làm tháng này -> báo đã làm nhưng vẫn cho làm phiếu mới', async () => {
  const s = await getSurveyEligibility(mockDatabase([{ _id: 'b', userId: 'u01', period: '2026-11', submittedAt: '2026-11-02T00:00:00Z', answers: [] }]), 'u01', NOW);
  assert.equal(s.respondedThisPeriod, true);
  assert.equal(s.canSubmit, true);
});
test('Phiếu cũ không có period thì suy ra từ ngày gửi', async () => {
  assert.equal(currentPeriod(new Date(2026, 0, 31)), '2026-01');
});
