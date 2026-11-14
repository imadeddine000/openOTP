const express = require('express');
const cors = require('cors');
const path = require('path');
const otpRoutes = require('./routes/otp');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/otp', otpRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the web UI dashboard
app.use(express.static(path.join(__dirname, '../../web-ui')));

module.exports = app;