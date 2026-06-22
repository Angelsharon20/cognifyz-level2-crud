const rateLimit = require("express-rate-limit");

const rateLimitHandler = (req, res) => {
  res.status(429).send(`<html><body style="background:#0f1117;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#191d27;border:1px solid #2b0f0f;border-left:4px solid #ef4444;border-radius:12px;padding:2.5rem 3rem;text-align:center"><h1 style="color:#ef4444">⚡ Too Many Requests</h1><p style="color:#8892a4">Please wait before trying again.</p><a href="/" style="background:#6366f1;color:#fff;padding:0.55rem 1.5rem;border-radius:6px;text-decoration:none">← Back</a></div></body></html>`);
};

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => req.path.startsWith("/css/") || req.path.startsWith("/js/"),
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => !["POST","PUT","DELETE","PATCH"].includes(req.method),
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rateLimitHandler,
});

module.exports = { globalLimiter, apiLimiter, strictLimiter };