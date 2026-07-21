const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { lookupLeetCodeQuestion } = require('./lib/leetcodelookup');
const { classifyBaguQuestion, smartSortBaguQuestions } = require('./lib/baguclassify');

const PORT = 8080;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'opc_dashboard_data.json');
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

const sessions = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ROUTES = {
  '/': 'index.html',
  '/app': 'app.html',
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function setSessionCookie(res, sessionId) {
  res.setHeader(
    'Set-Cookie',
    `opc_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'opc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.opc_session;
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function createSession(userId, username) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    userId,
    username,
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
  });
  return sessionId;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const next = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'));
}

function readUsersFile() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return { users: [] };
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { users: [] };
  }
}

function writeUsersFile(data) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function findUserByUsername(username) {
  const db = readUsersFile();
  return db.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

function userDataFile(userId) {
  const dir = path.join(DATA_DIR, 'users', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'dashboard.json');
}

function defaultData() {
  return { records: {}, cards: [], settings: {}, chatMessages: [] };
}

function readUserData(userId) {
  const file = userDataFile(userId);
  if (!fs.existsSync(file)) return defaultData();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultData();
  }
}

function writeUserData(userId, data) {
  fs.writeFileSync(userDataFile(userId), JSON.stringify(data, null, 2), 'utf8');
}

function getUserLLMSettings(userId) {
  const data = readUserData(userId);
  const llm = data.settings?.llm || {};
  return {
    baseUrl: llm.baseUrl || 'https://api.openai.com/v1',
    apiKey: llm.apiKey || '',
    model: llm.model || 'gpt-4o-mini',
    preferLLM: llm.preferLLM !== false,
  };
}

async function callUpstreamLLM(settings, messages, temperature = 0.7) {
  if (!settings.apiKey) throw new Error('未配置 API Key');

  const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature,
      messages,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try {
      detail = JSON.parse(text).error?.message || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function testUpstreamLLM(settings) {
  if (!settings.apiKey) throw new Error('未配置 API Key');
  await callUpstreamLLM(settings, [{ role: 'user', content: '回复 ok' }], 0);
  return true;
}

function migrateLegacyDataIfNeeded(userId) {
  const file = userDataFile(userId);
  if (fs.existsSync(file)) return;
  if (!fs.existsSync(LEGACY_DATA_FILE)) {
    writeUserData(userId, defaultData());
    return;
  }
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf8'));
    writeUserData(userId, legacy);
  } catch {
    writeUserData(userId, defaultData());
  }
}

function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 20) {
    return '用户名需 3–20 个字符';
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    return '用户名仅支持中文、字母、数字、下划线';
  }
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 6) return '密码至少 6 位';
  return null;
}

function serveStatic(req, res, urlPath) {
  const mapped = ROUTES[urlPath];
  const rel = mapped || urlPath;
  let filePath = path.normalize(path.join(ROOT, rel.startsWith('/') ? rel.slice(1) : rel));
  const parentImagesRoot = path.normalize(path.join(ROOT, '..', 'images'));

  const isUnderRoot = filePath.startsWith(ROOT);
  if (!isUnderRoot && !urlPath.startsWith('/images/')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (urlPath.startsWith('/images/')) {
      const name = decodeURIComponent(urlPath.slice('/images/'.length));
      const parentPath = path.normalize(path.join(parentImagesRoot, name));
      if (parentPath.startsWith(parentImagesRoot) && fs.existsSync(parentPath) && !fs.statSync(parentPath).isDirectory()) {
        filePath = parentPath;
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  const allowedRoots = [ROOT, parentImagesRoot];
  if (!allowedRoots.some((root) => filePath.startsWith(root))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  try {
    if (urlPath === '/api/auth/register' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const usernameErr = validateUsername(username);
      const passwordErr = validatePassword(password);
      if (usernameErr) return sendJson(res, 400, { error: usernameErr });
      if (passwordErr) return sendJson(res, 400, { error: passwordErr });
      if (findUserByUsername(username)) return sendJson(res, 409, { error: '用户名已存在' });

      const db = readUsersFile();
      const { salt, hash } = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        username,
        salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      writeUsersFile(db);
      migrateLegacyDataIfNeeded(user.id);

      const sessionId = createSession(user.id, user.username);
      setSessionCookie(res, sessionId);
      return sendJson(res, 201, { user: { id: user.id, username: user.username } });
    }

    if (urlPath === '/api/auth/login' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = findUserByUsername(username);
      if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        return sendJson(res, 401, { error: '用户名或密码错误' });
      }
      migrateLegacyDataIfNeeded(user.id);
      const sessionId = createSession(user.id, user.username);
      setSessionCookie(res, sessionId);
      return sendJson(res, 200, { user: { id: user.id, username: user.username } });
    }

    if (urlPath === '/api/auth/logout' && req.method === 'POST') {
      const session = getSession(req);
      if (session) sessions.delete(parseCookies(req).opc_session);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (urlPath === '/api/auth/me' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });
      return sendJson(res, 200, { user: { id: session.userId, username: session.username } });
    }

    if (urlPath === '/api/data') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      if (req.method === 'GET') {
        return sendJson(res, 200, readUserData(session.userId));
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readBody(req);
        const parsed = JSON.parse(body);
        writeUserData(session.userId, parsed);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (urlPath === '/api/llm/status' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const settings = getUserLLMSettings(session.userId);
      const configured = Boolean(settings.apiKey && settings.preferLLM);
      const payload = {
        configured,
        preferLLM: settings.preferLLM,
        model: settings.model,
        baseUrl: settings.baseUrl,
        connected: false,
        error: null,
      };

      if (!configured) {
        if (!settings.apiKey) payload.error = '未填写 API Key';
        else if (!settings.preferLLM) payload.error = '未勾选「优先使用 LLM」';
        return sendJson(res, 200, payload);
      }

      try {
        await testUpstreamLLM(settings);
        payload.connected = true;
      } catch (err) {
        payload.error = err.message || '连接失败';
      }
      return sendJson(res, 200, payload);
    }

    if (urlPath === '/api/llm/chat' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const settings = getUserLLMSettings(session.userId);
      if (!settings.apiKey) return sendJson(res, 400, { error: '未配置 API Key，请在 LLM 设置中填写' });
      if (!settings.preferLLM) return sendJson(res, 400, { error: '未启用 LLM，请勾选「优先使用 LLM」' });

      const body = JSON.parse(await readBody(req));
      const messages = body.messages;
      if (!Array.isArray(messages) || !messages.length) {
        return sendJson(res, 400, { error: 'messages 无效' });
      }

      try {
        const content = await callUpstreamLLM(settings, messages, body.temperature ?? 0.7);
        return sendJson(res, 200, { content, model: settings.model });
      } catch (err) {
        return sendJson(res, 502, { error: err.message || 'LLM 调用失败' });
      }
    }

    if (urlPath === '/api/leetcode/lookup' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const body = JSON.parse(await readBody(req));
      const lcNumber = body.lcNumber;
      const settings = getUserLLMSettings(session.userId);
      const llmCall =
        settings.apiKey && settings.preferLLM
          ? (prompt) => callUpstreamLLM(settings, [{ role: 'user', content: prompt }], 0.35)
          : null;

      try {
        const result = await lookupLeetCodeQuestion(lcNumber, { llmCall });
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 502, { error: err.message || '题目识别失败' });
      }
    }

    if (urlPath === '/api/bagu/classify' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const body = JSON.parse(await readBody(req));
      const title = String(body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: '请先填写题目' });

      const settings = getUserLLMSettings(session.userId);
      const llmCall =
        settings.apiKey && settings.preferLLM
          ? (prompt) => callUpstreamLLM(settings, [{ role: 'user', content: prompt }], 0.2)
          : null;

      try {
        const result = await classifyBaguQuestion(
          {
            title,
            bankId: body.bankId || '',
            bankName: body.bankName || '',
            categories: body.categories || [],
          },
          { llmCall }
        );
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 502, { error: err.message || '自动分类失败' });
      }
    }

    if (urlPath === '/api/bagu/smart-sort' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const body = JSON.parse(await readBody(req));
      const questions = Array.isArray(body.questions) ? body.questions : [];
      if (!questions.length) return sendJson(res, 400, { error: '没有可排序的题目' });

      const settings = getUserLLMSettings(session.userId);
      const llmCall =
        settings.apiKey && settings.preferLLM
          ? (prompt) => callUpstreamLLM(settings, [{ role: 'user', content: prompt }], 0.2)
          : null;

      try {
        const items = await smartSortBaguQuestions(
          {
            bankId: body.bankId || '',
            bankName: body.bankName || '',
            categories: body.categories || [],
            questions,
          },
          { llmCall }
        );
        return sendJson(res, 200, { items });
      } catch (err) {
        return sendJson(res, 502, { error: err.message || '智能排序失败' });
      }
    }

    if (urlPath === '/api/llm/test' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '未登录' });

      const body = JSON.parse(await readBody(req));
      const saved = getUserLLMSettings(session.userId);
      const settings = {
        baseUrl: body.baseUrl || saved.baseUrl,
        apiKey: body.apiKey || saved.apiKey,
        model: body.model || saved.model,
        preferLLM: body.preferLLM !== undefined ? body.preferLLM : saved.preferLLM,
      };

      if (!settings.apiKey) return sendJson(res, 400, { error: '请先填写 API Key' });

      try {
        await testUpstreamLLM(settings);
        return sendJson(res, 200, { ok: true, model: settings.model, baseUrl: settings.baseUrl });
      } catch (err) {
        return sendJson(res, 502, { error: err.message || '连接失败' });
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, urlPath);
      return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'server error' });
  }
});

server.listen(PORT, () => {
  ensureDataDir();
  console.log(`OPC 官网: http://localhost:${PORT}`);
  console.log(`OPC 仪表盘: http://localhost:${PORT}/app`);
});
