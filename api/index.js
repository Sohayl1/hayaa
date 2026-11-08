// api/index.js - Vercel Serverless Function entry point
const app = require('../server.js');

module.exports = (req, res) => {
  // Ensure req.url starts with /api so Express routes match correctly when Vercel rewrites /api/(.*)
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  return app(req, res);
};
