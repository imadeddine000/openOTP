const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const gatewayRoutes = require('./routes/gateway');
const clientRoutes = require('./routes/client');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/v1', clientRoutes);
app.use('/gateway', gatewayRoutes);

// Serve the web UI dashboard
app.use(express.static(path.join(__dirname, '../../web-ui')));

module.exports = app;
