const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.VITE_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Webhook non configuré' }) };
  }

  try {
    const payload = JSON.parse(event.body);
    const url = new URL(webhookUrl);
    const data = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        resolve({ statusCode: res.statusCode, body: JSON.stringify({ ok: res.statusCode === 200 }) });
      });
      req.on('error', (e) => {
        resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
      });
      req.write(data);
      req.end();
    });
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Payload invalide' }) };
  }
};
