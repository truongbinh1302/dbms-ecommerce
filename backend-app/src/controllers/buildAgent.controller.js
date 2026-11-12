const buildAgentService = require('../services/buildAgent.service');
const { error } = require('../utils/response');

const BUSY = 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.';

/*
  POST /builder/agent: trợ lý AI tự ráp cấu hình.
  Lỗi trước khi bắt đầu (chưa bật, yêu cầu trống, hết hạn mức) trả JSON như mọi API khác.
  Khi đã bắt đầu, trả luồng NDJSON (mỗi dòng một sự kiện) để giao diện hiện từng bước ngay khi xảy ra:
    {"type":"thinking","round":1}
    {"type":"step","step":{...}}
    {"type":"done","result":{...}}  hoặc  {"type":"error","message":"..."}
  Khách đóng trang thì huỷ luôn các lượt gọi OpenAI còn lại để khỏi tốn tiền.
*/
const streamAgent = async (req, res) => {
  let prepared;
  try {
    prepared = await buildAgentService.prepare(req.body || {});
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data, { expose: true });
    console.error('[build-agent] prepare failed:', err.message);
    return error(res, BUSY, 503, null, { expose: true });
  }

  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    // nginx mặc định gom phản hồi rồi mới gửi; tắt để từng bước tới trình duyệt ngay.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const send = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const result = await buildAgentService.run(prepared, { onEvent: send, signal: controller.signal });
    send({ type: 'done', result });
  } catch (err) {
    if (!controller.signal.aborted) {
      if (!err.status) console.error('[build-agent] unexpected error:', err.message);
      send({ type: 'error', message: err.status ? err.message : BUSY });
    }
  }
  if (!res.writableEnded) res.end();
  return undefined;
};

module.exports = { streamAgent };
