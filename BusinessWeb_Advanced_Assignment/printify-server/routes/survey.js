const express = require('express');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/db');
const { requireSurveyCustomer } = require('../middlewares/require-survey-customer');
const { validateQuestions, validateSubmission } = require('../utils/survey-validation');
const { getSurveyEligibility, currentPeriod } = require('../utils/survey-eligibility');

const router = express.Router();

/** Minimal origin safeguard for cookie POSTs in this classroom example.
 * In production, ALSO use a proper CSRF token strategy and HTTPS.
 */
function checkOrigin(req, res, next) {
  const allowedOrigin = process.env.CUSTOMER_ORIGIN;
  const origin = req.get('origin');
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return res.status(403).json({ code: 'INVALID_ORIGIN' });
  }
  next();
}


router.use(requireSurveyCustomer);

// GET /api/survey/questions
router.get('/questions', async (req, res, next) => {
  try {
    const db = getDb();
    const questions = await db.collection('surveyQuestions')
      .find({ isActive: true }, {
        projection: {
          _id: 1, dimension: 1, text: 1,
          scaleType: 1, orderIndex: 1, isActive: 1
        }
      })
      .sort({ orderIndex: 1, _id: 1 })
      .toArray();
    const state = await getSurveyEligibility(db, req.surveyUserId);
    const reason = questions.length === 0
      ? 'NO_ACTIVE_QUESTIONS'
      : state.respondedThisPeriod ? 'ALREADY_RESPONDED' : null;
    res.json({
      questions,
      eligible: true,
      period: state.period,
      hasResponded: state.respondedThisPeriod,
      respondedThisPeriod: state.respondedThisPeriod,
      lastSubmittedAt: state.lastSubmittedAt,
      history: state.history,
      // Đã làm tháng này vẫn được làm phiếu mới: giao diện hỏi lại trước khi mở form
      canSubmit: questions.length > 0,
      reason
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/survey/responses
router.post('/responses', checkOrigin, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.surveyUserId;
    // Chống bấm gửi 2 lần liên tiếp (không giới hạn số lần làm khảo sát)
    const last = await db.collection('surveyResponses')
      .find({ userId }, { projection: { submittedAt: 1 } }).sort({ submittedAt: -1 }).limit(1).toArray();
    if (last[0] && Date.now() - new Date(last[0].submittedAt).getTime() < 30000) {
      return res.status(429).json({ code: 'TOO_FAST' });
    }

    const questions = await db.collection('surveyQuestions')
      .find({ isActive: true })
      .sort({ orderIndex: 1, _id: 1 })
      .toArray();
    if (questions.length === 0) {
      return res.status(503).json({ code: 'NO_ACTIVE_QUESTIONS' });
    }
    if (!validateQuestions(questions)) {
      return res.status(500).json({ code: 'QUESTION_CONFIG_INVALID' });
    }
    const badRequestCode = validateSubmission(req.body, questions);
    if (badRequestCode) {
      return res.status(422).json({ code: badRequestCode });
    }

    const submittedAt = new Date();
    const scores = new Map(req.body.answers.map(a => [a.questionId, a.score]));
    await db.collection('surveyResponses').insertOne({
      _id: `sr_${randomUUID()}`,
      userId,
      period: currentPeriod(submittedAt),
      answers: questions.map(q => ({
        questionId: q._id,
        questionText: q.text,
        dimension: q.dimension,
        score: scores.get(q._id)
      })),
      comment: (req.body.comment || '').trim(),
      submittedAt
    });

    return res.status(201).json({
      message: 'Cảm ơn bạn đã tham gia khảo sát PrintiFy!',
      submittedAt: submittedAt.toISOString(),
      period: currentPeriod(submittedAt)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;