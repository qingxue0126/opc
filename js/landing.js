const Landing = {
  mode: 'login',

  init() {
    this.bindEvents();
    this.checkSession();
    if (new URLSearchParams(location.search).get('login') === '1') {
      this.openAuth('login');
    }
  },

  async checkSession() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const { user } = await res.json();
        this.showLoggedIn(user);
      }
    } catch {
      /* ignore */
    }
  },

  showLoggedIn(user) {
    const actions = document.getElementById('siteActions');
    actions.innerHTML = `
      <span class="site-user">你好，${this.escapeHtml(user.username)}</span>
      <a class="btn btn-primary" href="/app">进入仪表盘</a>
    `;
  },

  bindEvents() {
    document.getElementById('btnOpenLogin')?.addEventListener('click', () => this.openAuth('login'));
    document.getElementById('btnOpenRegister')?.addEventListener('click', () => this.openAuth('register'));
    document.getElementById('btnHeroStart')?.addEventListener('click', () => this.openAuth('register'));
    document.getElementById('authClose')?.addEventListener('click', () => this.closeAuth());
    document.getElementById('authOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'authOverlay') this.closeAuth();
    });

    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    document.getElementById('authForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAuth();
    });
  },

  openAuth(mode) {
    this.mode = mode;
    this.switchTab(mode);
    document.getElementById('authOverlay').classList.remove('hidden');
    document.getElementById('authUsername').focus();
  },

  closeAuth() {
    document.getElementById('authOverlay').classList.add('hidden');
    document.getElementById('authError').classList.add('hidden');
  },

  switchTab(mode) {
    this.mode = mode;
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === mode);
    });
    document.getElementById('authSubmit').textContent = mode === 'login' ? '登录' : '注册';
    document.getElementById('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  },

  authFetchError(res, text) {
    if (res.status === 405 || (text && !text.trim().startsWith('{'))) {
      return '服务版本过旧或未启动，请关闭所有旧的黑窗口后重新双击 start.bat';
    }
    if (location.protocol === 'file:') {
      return '请通过 start.bat 打开，不要直接双击 HTML 文件';
    }
    return '网络错误，请确认已运行 start.bat，并访问 http://localhost:8080/';
  },

  async submitAuth() {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    errorEl.classList.add('hidden');

    if (location.protocol === 'file:') {
      errorEl.textContent = '请通过 start.bat 打开，不要直接双击 HTML 文件';
      errorEl.classList.remove('hidden');
      return;
    }

    const endpoint = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        errorEl.textContent = this.authFetchError(res, text);
        errorEl.classList.remove('hidden');
        return;
      }
      if (!res.ok) {
        errorEl.textContent = data.error || '操作失败';
        errorEl.classList.remove('hidden');
        return;
      }
      window.location.href = '/app';
    } catch {
      errorEl.textContent = this.authFetchError(null, '');
      errorEl.classList.remove('hidden');
    }
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

document.addEventListener('DOMContentLoaded', () => Landing.init());
