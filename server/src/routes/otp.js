const express = require('express');
const router = express.Router();
const queue = require('../services/queue');
const { restAuth } = require('../middleware/auth');

// POST /api/otp/request  — enqueue a new OTP SMS request
router.post('/request', restAuth, (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }
  if (typeof phone !== 'string' || phone.trim().length < 5) {
    return res.status(400).json({ error: 'invalid phone number' });
  }

  const request = queue.enqueue({
    phone: phone.trim(),
    message: message.trim(),
  });

  res.status(202).json({
    requestId: request.id,
    status: request.status,
    createdAt: request.createdAt,
  });
});

// GET /api/otp/status — current queue and device stats
router.get('/status', restAuth, (req, res) => {
  res.json(queue.getStats());
});

// GET /api/otp/requests — list all OTP requests (newest first)
router.get('/requests', restAuth, (req, res) => {
  res.json({ success: true, requests: queue.getRequests() });
});

// POST /api/otp/heartbeat-config — push a new heartbeat interval to devices
// Body: { interval: 15000, target: "*" }  (target: '*' for all, or omit for all)
router.post('/heartbeat-config', restAuth, (req, res) => {
  const { interval, target } = req.body;
  if (!interval || typeof interval !== 'number') {
    return res.status(400).json({ error: 'interval (number, ms) is required' });
  }
  queue.pushHeartbeatConfig(target || '*', interval);
  res.json({ success: true, message: `Heartbeat interval set to ${interval}ms for ${target || 'all devices'}` });
});

module.exports = router;