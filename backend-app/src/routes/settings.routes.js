const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const settingsService = require('../services/settings.service');
const assistantService = require('../services/assistant.service');
const { success, error } = require('../utils/response');

/*
  Cài đặt của admin. Hiện có trợ lý mua hàng: khoá OpenAI (lưu mã hoá, không bao giờ trả lại nguyên khoá),
  mô hình, bật/tắt, số câu mỗi giờ (mỗi IP) và mỗi ngày (cả cửa hàng).
*/
const router = express.Router();
router.use(authenticate, authorize('admin'));

const handle = (fn) => async (req, res) => {
  try {
    return success(res, await fn(req), 'OK');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    console.error('[settings]', err.message);
    return error(res, 'Không lưu được cài đặt');
  }
};

const view = async () => ({
  ...settingsService.publicView(await settingsService.getAssistantSettings({ fresh: true })),
  usageToday: assistantService.usageToday(),
});

router.get('/assistant', handle(view));
router.put('/assistant', handle(async (req) => {
  await settingsService.updateAssistantSettings(req.user.id, req.body || {});
  return view();
}));
// Thử kết nối OpenAI bằng khoá đang lưu, hoặc khoá vừa nhập (chưa lưu) nếu gửi kèm apiKey.
router.post('/assistant/test', handle((req) => settingsService.testAssistantConnection({ candidateKey: (req.body || {}).apiKey || null })));

module.exports = router;
