const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const assistantService = require('../services/assistant.service');
const { success, error } = require('../utils/response');

const router = express.Router();

// Mỗi IP hỏi tối đa ASSISTANT_MAX_PER_HOUR câu mỗi giờ (mỗi câu tốn tiền gọi OpenAI).
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(1, config.assistant.perHour),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn hỏi hơi nhanh, nghỉ một lát rồi hỏi tiếp nhé.' },
});

// Website hỏi trợ lý có bật không để hiện hoặc ẩn nút trợ lý.
router.get('/status', (req, res) => success(res, { enabled: assistantService.isEnabled() }, 'Assistant status'));

router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const result = await assistantService.chat((req.body || {}).messages);
    return success(res, result, 'Assistant replied');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    console.error('[assistant] unexpected error:', err.message);
    return error(res, 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.', 503);
  }
});

module.exports = router;
