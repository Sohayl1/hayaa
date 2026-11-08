// api/[...all].js - Catch-all Vercel Serverless Function for all /api/* routes
const app = require('../server.js');

module.exports = (req, res) => {
  try {
    if (req.url && !req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel API Handler Error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
