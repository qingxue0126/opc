const App = {
  route: { view: 'home' },
  handwriteDraft: null,
  handwriteEditing: null,
  baguDraft: null,
  baguEditing: null,
  baguCollapsed: {},
  sleepViewMode: 'day', // day | week | month
  sleepViewAnchor: null, // YYYY-MM-DD
  sleepMonthMetric: 'total', // total | long | nap
  studyViewMode: 'day', // day | week | month
  studyViewAnchor: null, // YYYY-MM-DD
  planScope: 'daily', // 左栏计划：daily | weekly | monthly
  planStatsScope: 'weekly', // 右栏统计：daily | weekly | monthly
  planStatsAnchor: null, // 统计锚点 YYYY-MM-DD
  planSheetColumn: null, // null | 'plan'
  planSheetKey: null,
  planSheetPriority: 'none', // none | high | medium | low
  planSheetParentId: null, // 变为子待办时选中的父待办
  planSheetEditId: null, // 编辑中的待办 id
  planSheetOriginKey: null, // 编辑开始时的日期/周/月 key
  planEditingId: null,
  calendarYear: null,
  calendarMonth: null,
  calendarViewDate: null,

  init() {
    Store.getRecycleBin();
    this.renderStorageHint();
    this.renderNav();
    this.renderProfile();
    this.render();
    this.bindGlobal();
    this.updateDate();
    this.applyTopbarWidgetStyles();
    this.updateRecycleBinNav();
  },

  renderStorageHint() {
    const footer = document.querySelector('.sidebar-footer');
    if (!footer) return;
    let hint = document.getElementById('storageHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'storageHint';
      footer.insertBefore(hint, footer.firstChild);
    }
    if (Store.isFileSync()) {
      hint.className = 'storage-hint storage-hint-ok';
      hint.textContent = '📁 数据已同步到账号';
    } else {
      hint.className = 'storage-hint storage-hint-warn';
      hint.textContent = '⚠️ 请运行 start.bat 并登录后使用';
    }
  },

  async ensureAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        window.location.href = '/?login=1';
        return null;
      }
      return res.json();
    } catch {
      window.location.href = '/?login=1';
      return null;
    }
  },

  navigate(view, params = {}) {
    this.route = { view, ...params };
    this.renderNav();
    this.render();
  },

  confirmDelete(message, title = '确认删除') {
    const overlay = document.getElementById('confirmOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (!overlay || !okBtn || !cancelBtn) {
      return Promise.resolve(
        window.confirm(message || '确定删除吗？删除后将移入回收箱，满 30 天后自动清除。')
      );
    }

    titleEl.textContent = title;
    msgEl.textContent =
      message || '确定删除吗？删除后将移入回收箱，满 30 天后自动清除。';
    overlay.classList.remove('hidden');
    okBtn.focus();

    return new Promise((resolve) => {
      const finish = (ok) => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
        resolve(ok);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onOverlay = (e) => {
        if (e.target === overlay) finish(false);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter') finish(true);
      };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
    });
  },

  updateRecycleBinNav() {
    const btn = document.getElementById('btnRecycleBin');
    if (!btn) return;
    const count = Store.getRecycleBinCount();
    btn.textContent = count > 0 ? `回收箱 (${count})` : '回收箱';
    btn.classList.toggle('has-items', count > 0);
    btn.classList.toggle('is-active', this.route.view === 'recycle');
  },

  renderRecycleBin() {
    const items = Store.getRecycleBin();
    if (!items.length) {
      return `
        <div class="recycle-page">
          <p class="recycle-hint">删除的内容会在此保留 30 天，之后自动清除。可随时恢复或彻底删除。</p>
          <div class="recycle-empty">回收箱是空的</div>
        </div>`;
    }

    const list = items
      .map((item) => {
        const days = Store.recycleDaysLeft(item.deletedAt);
        const kind = Store._recycleKindLabel(item.kind);
        const deletedAt = item.deletedAt
          ? new Date(item.deletedAt).toLocaleString('zh-CN', { hour12: false })
          : '';
        return `
          <article class="recycle-item" data-bin-id="${item.id}">
            <div class="recycle-item-main">
              <p class="recycle-item-title">${this.escapeHtml(item.title || '未命名')}</p>
              <p class="recycle-item-meta">${this.escapeHtml(kind)} · 删除于 ${this.escapeHtml(deletedAt)} · 剩余 ${days} 天</p>
            </div>
            <div class="recycle-item-actions">
              <button type="button" class="btn btn-primary btn-sm btn-recycle-restore">恢复</button>
              <button type="button" class="btn btn-danger-ghost btn-sm btn-recycle-purge">彻底删除</button>
            </div>
          </article>`;
      })
      .join('');

    return `
      <div class="recycle-page">
        <div class="recycle-toolbar">
          <p class="recycle-hint">删除的内容会在此保留 30 天，之后自动清除。</p>
          <button type="button" class="btn btn-danger-ghost btn-sm" id="btnEmptyRecycle">清空回收箱</button>
        </div>
        <div class="recycle-list">${list}</div>
      </div>`;
  },

  bindRecycleBin() {
    document.getElementById('btnEmptyRecycle')?.addEventListener('click', async () => {
      const ok = await this.confirmDelete(
        '确定清空回收箱吗？清空后无法恢复。',
        '清空回收箱'
      );
      if (!ok) return;
      Store.emptyRecycleBin();
      this.updateRecycleBinNav();
      this.render();
    });

    document.querySelectorAll('.btn-recycle-restore').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.recycle-item')?.dataset.binId;
        if (!id) return;
        Store.restoreRecycleItem(id);
        this.updateRecycleBinNav();
        this.render();
      });
    });

    document.querySelectorAll('.btn-recycle-purge').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.recycle-item')?.dataset.binId;
        if (!id) return;
        const ok = await this.confirmDelete(
          '确定彻底删除吗？此操作不可恢复。',
          '彻底删除'
        );
        if (!ok) return;
        Store.purgeRecycleItem(id);
        this.updateRecycleBinNav();
        this.render();
      });
    });
  },

  renderNav() {
    const nav = document.getElementById('nav');
    const items = [
      { view: 'home', label: '总览', color: '#4F46E5' },
      ...DEPARTMENTS.map((d) => {
        const dept = getDeptBase(d.id);
        return {
          view: 'dept',
          deptId: d.id,
          label: `${dept.order} ${dept.name}`,
          color: dept.color,
        };
      }),
    ];

    nav.innerHTML = items
      .map((item) => {
        const active =
          (item.view === 'home' && this.route.view === 'home') ||
          (item.view === 'dept' &&
            ((this.route.view === 'dept' && this.route.deptId === item.deptId) ||
              (this.route.view === 'module' && this.route.deptId === item.deptId)));

        if (item.view === 'home') {
          return `
            <button class="nav-item ${active ? 'active' : ''}"
              data-view="${item.view}">
              <span class="nav-dot" style="background:${item.color}"></span>
              <span class="nav-label">${item.label}</span>
            </button>`;
        }

        return `
          <div class="nav-item-row ${active ? 'active' : ''}">
            <button class="nav-item" data-view="${item.view}" data-dept="${item.deptId}">
              <span class="nav-dot" style="background:${item.color}"></span>
              <span class="nav-label">${this.escapeHtml(item.label)}</span>
            </button>
            <button type="button" class="nav-edit-dept" title="编辑部门" data-dept="${item.deptId}">✎</button>
          </div>`;
      })
      .join('');

    nav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'home') this.navigate('home');
        else {
          const dept = getDepartment(btn.dataset.dept);
          if (dept?.layout === 'pages' && dept.modules[0]) {
            this.navigate('module', { deptId: dept.id, moduleId: dept.modules[0].id });
          } else {
            this.navigate('dept', { deptId: btn.dataset.dept });
          }
        }
      });
    });

    nav.querySelectorAll('.nav-edit-dept').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDeptEditModal(btn.dataset.dept);
      });
    });
  },

  render() {
    const content = document.getElementById('content');
    const title = document.getElementById('pageTitle');
    if (this.interviewCountdownTimer) {
      clearInterval(this.interviewCountdownTimer);
      this.interviewCountdownTimer = null;
    }
    RichEditor.destroyAll();

    switch (this.route.view) {
      case 'home':
        title.textContent = '总览';
        content.innerHTML = this.renderHome();
        this.bindHome();
        this.updateInterviewWidget(false);
        break;
      case 'recycle':
        title.textContent = '回收箱';
        content.innerHTML = this.renderRecycleBin();
        this.bindRecycleBin();
        this.updateInterviewWidget(false);
        break;
      case 'dept': {
        const dept = getDepartment(this.route.deptId);
        if (dept?.layout === 'pages' && dept.modules[0]) {
          const firstId = dept.modules[0].id;
          title.textContent = getModule(this.route.deptId, firstId)?.name || dept.name;
          content.innerHTML = this.renderModulePage(this.route.deptId, firstId);
          this.bindModulePage(this.route.deptId, firstId);
          this.updateInterviewWidget(this.route.deptId === 'core');
          if (this.route.deptId === 'core') this.setupInterviewCountdown();
          break;
        }
        title.textContent = dept?.name || '部门';
        content.innerHTML = this.renderDept(this.route.deptId);
        this.bindDept(this.route.deptId);
        this.updateInterviewWidget(this.route.deptId === 'core');
        if (this.route.deptId === 'core') this.setupInterviewCountdown();
        break;
      }
      case 'module': {
        const mod = getModule(this.route.deptId, this.route.moduleId);
        const dept = getDepartment(this.route.deptId);
        if (mod?.recordView === 'bagu' && this.route.baguBank) {
          const bank = getBaguBank(this.route.baguBank);
          title.textContent = bank ? `${bank.name} 面试题` : mod?.name || '八股';
        } else {
          title.textContent = mod?.name || dept?.name || '模块';
        }
        content.innerHTML = this.renderModulePage(this.route.deptId, this.route.moduleId);
        this.bindModulePage(this.route.deptId, this.route.moduleId);
        this.updateInterviewWidget(this.route.deptId === 'core');
        if (this.route.deptId === 'core') this.setupInterviewCountdown();
        break;
      }
    }
    this.updatePageHeader();
  },

  updatePageHeader() {
    const main = document.querySelector('.main');
    const descEl = document.getElementById('deptHeaderDesc');
    if (!main || !descEl) return;

    if (this.route.view === 'dept') {
      const dept = getDepartment(this.route.deptId);
      main.classList.add('main--sticky-header');
      descEl.textContent = dept?.desc || '';
      descEl.classList.toggle('hidden', !dept?.desc);
    } else if (this.route.view === 'module') {
      const dept = getDepartment(this.route.deptId);
      if (dept?.layout === 'pages') {
        main.classList.add('main--sticky-header');
        descEl.textContent = dept?.desc || '';
        descEl.classList.toggle('hidden', !dept?.desc);
      } else {
        main.classList.remove('main--sticky-header');
        descEl.textContent = '';
        descEl.classList.add('hidden');
      }
    } else if (this.route.view === 'home') {
      main.classList.add('main--sticky-header');
      descEl.textContent = '';
      descEl.classList.add('hidden');
    } else {
      main.classList.remove('main--sticky-header');
      descEl.textContent = '';
      descEl.classList.add('hidden');
    }
    this.bindStickyHeaderShadow();
    this.applyHeaderBackground();
    this.updateNorthStarWidget();
    this.applyTopbarWidgetStyles();
  },

  getTopbarWidgetColors(widgetKey, urgent = false) {
    const defaults = TOPBAR_WIDGET_DEFAULTS[widgetKey];
    const saved = Store.getTopbarWidgetStyle(widgetKey);
    if (urgent && defaults.urgentFrom) {
      return {
        from: saved.urgentFrom || defaults.urgentFrom,
        to: saved.urgentTo || defaults.urgentTo,
      };
    }
    return {
      from: saved.colorFrom || defaults.colorFrom,
      to: saved.colorTo || defaults.colorTo,
    };
  },

  applyWidgetGradient(el, widgetKey, urgent = false) {
    if (!el) return;
    const { from, to } = this.getTopbarWidgetColors(widgetKey, urgent);
    el.style.background = `linear-gradient(135deg, ${from}, ${to})`;
  },

  applyTopbarWidgetStyles() {
    const interview = document.getElementById('nextInterviewWidget');
    const northStar = document.getElementById('northStar');
    this.applyWidgetGradient(northStar, 'northStar', false);
    this.applyWidgetGradient(interview, 'interview', interview?.classList.contains('urgent'));
  },

  updateNorthStarWidget() {
    const wrap = document.getElementById('northStarWrap');
    if (!wrap) return;
    const show =
      this.route.view === 'home' ||
      (this.route.deptId === 'core' &&
        (this.route.view === 'dept' || this.route.view === 'module'));
    wrap.classList.toggle('hidden', !show);
  },

  getHeaderBackgroundKey() {
    if (this.route.view === 'home') return 'home';
    if (this.route.view === 'dept') return this.route.deptId;
    if (this.route.view === 'module') {
      const dept = getDepartment(this.route.deptId);
      if (dept?.layout === 'pages') return this.route.deptId;
    }
    return null;
  },

  applyHeaderBackground() {
    const header = document.getElementById('pageHeader');
    const bgEl = document.getElementById('pageHeaderBg');
    const actions = document.getElementById('headerBgActions');
    const removeBtn = document.getElementById('btnHeaderBgRemove');
    if (!header || !bgEl) return;

    const key = this.getHeaderBackgroundKey();
    actions?.classList.toggle('hidden', !key);

    if (!key) {
      bgEl.style.backgroundImage = '';
      header.classList.remove('has-bg');
      removeBtn?.classList.add('hidden');
      return;
    }

    const bg = Store.getHeaderBackground(key);
    if (bg) {
      bgEl.style.backgroundImage = `url("${bg}")`;
      header.classList.add('has-bg');
      removeBtn?.classList.remove('hidden');
    } else {
      bgEl.style.backgroundImage = '';
      header.classList.remove('has-bg');
      removeBtn?.classList.add('hidden');
    }
  },

  async processHeaderBackground(file) {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    if (file.size > 3 * 1024 * 1024) throw new Error('图片不能超过 3MB');

    const bitmap = await createImageBitmap(file);
    const targetW = 1200;
    const targetH = 280;
    const targetRatio = targetW / targetH;
    const srcRatio = bitmap.width / bitmap.height;

    let sx;
    let sy;
    let sw;
    let sh;
    if (srcRatio > targetRatio) {
      sh = bitmap.height;
      sw = sh * targetRatio;
      sx = (bitmap.width - sw) / 2;
      sy = 0;
    } else {
      sw = bitmap.width;
      sh = sw / targetRatio;
      sx = 0;
      sy = (bitmap.height - sh) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i] * 0.3 + avg * 0.7;
      data[i + 1] = data[i + 1] * 0.3 + avg * 0.7;
      data[i + 2] = data[i + 2] * 0.3 + avg * 0.7;
      data[i] = data[i] * 0.5 + 247 * 0.5;
      data[i + 1] = data[i + 1] * 0.5 + 245 * 0.5;
      data[i + 2] = data[i + 2] * 0.5 + 242 * 0.5;
    }
    ctx.putImageData(imageData, 0, 0);
    ctx.fillStyle = 'rgba(247, 245, 242, 0.38)';
    ctx.fillRect(0, 0, targetW, targetH);

    return canvas.toDataURL('image/jpeg', 0.82);
  },

  bindStickyHeaderShadow() {
    const header = document.getElementById('pageHeader');
    if (this.stickyScrollHandler) {
      window.removeEventListener('scroll', this.stickyScrollHandler);
      this.stickyScrollHandler = null;
    }
    if (!header || !document.querySelector('.main--sticky-header')) {
      header?.classList.remove('is-scrolled');
      return;
    }

    const update = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 4);
    };
    this.stickyScrollHandler = update;
    window.addEventListener('scroll', update, { passive: true });
    update();
  },

  renderHome() {
    return `
      <div class="chat-panel ${Store.isChatCollapsed() ? 'is-collapsed' : ''}" id="chatPanel">
        ${this.renderChatPanel()}
      </div>

      <div class="plan-module-wrap">
        ${this.renderPlanModule()}
      </div>

      ${this.renderYearCalendar()}

      <div class="section-title" style="margin-top:28px">主题分区</div>
      <div class="dept-grid">
        ${DEPARTMENTS.map(
          (d) => {
            const dept = getDeptBase(d.id);
            return `
          <div class="dept-card" data-dept="${d.id}">
            <div class="dept-card-header">
              <span class="dept-badge" style="background:${dept.bg};color:${dept.color}">${dept.order}</span>
              <h3>${this.escapeHtml(dept.name)}</h3>
            </div>
            <p>${this.escapeHtml(dept.desc)}</p>
            <div class="module-tags">
              ${d.modules.map((m) => {
                const mod = getModule(d.id, m.id);
                return `<span class="module-tag">${mod.icon} ${this.escapeHtml(mod.name)}</span>`;
              }).join('')}
            </div>
          </div>`;
          }
        ).join('')}
      </div>
    `;
  },

  renderPlanModule() {
    const planType =
      this.planScope === 'weekly' || this.planScope === 'monthly' ? this.planScope : 'daily';
    const timeline = Store.getPlanTimeline(planType);
    const todayTitle =
      planType === 'weekly' ? '本周' : planType === 'monthly' ? '本月' : '今天';
    const totalCount =
      timeline.future.reduce((n, b) => n + b.items.length, 0) +
      timeline.today.items.length +
      timeline.past.reduce((n, b) => n + b.items.length, 0);
    const doneCount =
      timeline.future.reduce((n, b) => n + b.items.filter((i) => i.done).length, 0) +
      timeline.today.items.filter((i) => i.done).length +
      timeline.past.reduce((n, b) => n + b.items.filter((i) => i.done).length, 0);

    const renderBucket = (bucket, opts = {}) => {
      const items = (bucket.items || []).map((item) => Store.resolvePlanItem(item));
      if (!items.length && !opts.forceEmpty) return '';
      return `
        <div class="plan-bucket" data-plan-key="${this.escapeHtml(bucket.key)}">
          ${
            opts.hideLabel
              ? ''
              : `<div class="plan-bucket-label">${this.escapeHtml(bucket.label)}</div>`
          }
          <ul class="plan-list">
            ${
              items.length
                ? items
                    .map((item) =>
                      this.renderPlanItem(item, {
                        canNest: items.length > 1,
                        editingId: this.planEditingId,
                      })
                    )
                    .join('')
                : `<li class="plan-empty">${opts.emptyText || '暂无计划'}</li>`
            }
          </ul>
        </div>`;
    };

    const renderSection = (period, title, buckets, opts = {}) => {
      const body = Array.isArray(buckets)
        ? buckets.map((b) => renderBucket(b)).join('')
        : renderBucket(buckets, opts);
      if (!body && !opts.always) return '';
      return `
        <section class="plan-section" data-period="${period}">
          <h4 class="plan-section-title">${title}</h4>
          <div class="plan-section-body">${body || `<div class="plan-empty">${opts.emptyText || '暂无'}</div>`}</div>
        </section>`;
    };

    const scopeTabs = (active, attr) => `
      <div class="plan-scope-tabs" role="tablist">
        <button type="button" class="plan-scope-tab ${active === 'daily' ? 'is-active' : ''}" ${attr}="daily">日</button>
        <button type="button" class="plan-scope-tab ${active === 'weekly' ? 'is-active' : ''}" ${attr}="weekly">周</button>
        <button type="button" class="plan-scope-tab ${active === 'monthly' ? 'is-active' : ''}" ${attr}="monthly">月</button>
      </div>`;

    const sheetOpen = this.planSheetColumn === 'plan';

    return `
      <div class="plan-module-grid">
        <section class="plan-module" data-plan-column="plan" data-plan-type="${planType}">
          <div class="plan-module-head">
            <div>
              <h3 class="plan-module-title">计划</h3>
              <p class="plan-module-sub">${totalCount ? `完成 ${doneCount}/${totalCount}` : '按时间管理目标'}</p>
            </div>
            ${scopeTabs(planType, 'data-plan-scope')}
          </div>
          <div class="plan-timeline">
            ${renderSection('future', '未来', timeline.future)}
            ${renderSection('today', todayTitle, timeline.today, {
              always: true,
              hideLabel: true,
              forceEmpty: true,
              emptyText:
                planType === 'weekly'
                  ? '本周还没有计划'
                  : planType === 'monthly'
                    ? '本月还没有计划'
                    : '今天还没有计划',
            })}
            ${renderSection('past', '过去', timeline.past)}
          </div>
          <button type="button" class="plan-fab btn-plan-fab" title="添加计划" aria-label="添加计划" data-plan-column="plan">+</button>
          ${sheetOpen ? this.renderPlanSheet(planType) : ''}
        </section>
        <section class="plan-module plan-stats-module" data-plan-column="stats">
          <div class="plan-module-head">
            <div>
              <h3 class="plan-module-title">统计</h3>
              <p class="plan-module-sub">完成情况一览</p>
            </div>
            ${scopeTabs(this.planStatsScope || 'weekly', 'data-plan-stats-scope')}
          </div>
          <div class="plan-stats-body">
            ${this.renderPlanStatsBody()}
          </div>
        </section>
      </div>`;
  },

  getPlanStatsAnchor() {
    if (this.planStatsAnchor && /^\d{4}-\d{2}-\d{2}$/.test(this.planStatsAnchor)) {
      return this.planStatsAnchor;
    }
    return todayStr();
  },

  renderPlanStatsBody() {
    const mode = this.planStatsScope || 'weekly';
    if (mode === 'daily') return this.renderPlanStatsDay();
    if (mode === 'monthly') return this.renderPlanStatsMonth();
    return this.renderPlanStatsWeek();
  },

  renderPlanStatsDay() {
    const date = this.getPlanStatsAnchor();
    const items = Store.getPlanItems('daily', date)
      .map((item) => Store.resolvePlanItem(item))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const done = items.filter((i) => i.done).length;
    return `
      <div class="plan-stats-day">
        <div class="plan-stats-nav">
          <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-prev" title="前一天">‹</button>
          <span class="plan-stats-range">${this.escapeHtml(formatDate(date))}</span>
          <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-next" title="后一天">›</button>
        </div>
        <p class="plan-stats-summary">${items.length ? `完成 ${done}/${items.length}` : '这一天没有计划'}</p>
        <ol class="plan-stats-timeline">
          ${
            items.length
              ? items
                  .map((item, i) => {
                    const time = item.createdAt
                      ? String(item.createdAt).slice(11, 16)
                      : String(i + 1).padStart(2, '0');
                    return `
              <li class="plan-stats-tl-item ${item.done ? 'is-done' : ''}">
                <span class="plan-stats-tl-time">${this.escapeHtml(time)}</span>
                <span class="plan-stats-tl-dot"></span>
                <span class="plan-stats-tl-text">${this.escapeHtml(item.text || '—')}</span>
              </li>`;
                  })
                  .join('')
              : '<li class="plan-empty">暂无时间线数据</li>'
          }
        </ol>
      </div>`;
  },

  renderPlanStatsWeek() {
    const anchor = this.getPlanStatsAnchor();
    const weekKey = Store.weekKey(new Date(`${anchor}T00:00:00`));
    const tracker = Store.getPlanWeekTracker(weekKey);
    const weekday = ['一', '二', '三', '四', '五', '六', '日'];
    const range = String(tracker.rangeLabel || '').replace(/\//g, '.');
    const head = `
      <div class="plan-stats-nav">
        <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-prev" title="上一周">‹</button>
        <span class="plan-stats-range">${this.escapeHtml(range || weekKey)}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-next" title="下一周">›</button>
      </div>
      <div class="plan-week-tracker-title">Weekly Tracker</div>`;
    if (!tracker.rows.length) {
      return `${head}<p class="plan-empty">本周还没有日计划打卡</p>`;
    }
    const headCells = tracker.days
      .map(
        (date, i) =>
          `<th><span class="plan-week-day-chip">${weekday[i]}</span><span class="plan-week-day-num">${date.slice(8)}</span></th>`
      )
      .join('');
    const body = tracker.rows
      .map((row, ri) => {
        const tone = ri % 2 === 0 ? 'is-cool' : 'is-warm';
        const cells = tracker.days
          .map((date) => {
            const cell = row.cells[date];
            // 有任务但未完成：格子留空；仅已完成显示圆点
            if (!cell?.done) return '<td></td>';
            return `<td><span class="plan-week-dot ${tone} is-done" title="已完成"></span></td>`;
          })
          .join('');
        return `<tr><th scope="row">${this.escapeHtml(row.label)}</th>${cells}</tr>`;
      })
      .join('');
    return `
      <div class="plan-stats-week">
        ${head}
        <div class="plan-week-tracker-wrap">
          <table class="plan-week-tracker">
            <thead><tr><th></th>${headCells}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  },

  planMonthMoodFace(kind) {
    const faces = {
      sad: `<svg viewBox="0 0 40 40" class="plan-month-face-svg" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="currentColor"/><path d="M12 15c1.2-2 3-3 4.5-2.2M28 15c-1.2-2-3-3-4.5-2.2" stroke="#444" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 27c2.5-2.5 9.5-2.5 12 0" stroke="#444" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
      meh: `<svg viewBox="0 0 40 40" class="plan-month-face-svg" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="currentColor"/><path d="M12 16h6M22 16h6" stroke="#444" stroke-width="1.8" stroke-linecap="round"/><path d="M14 27h12" stroke="#444" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      ok: `<svg viewBox="0 0 40 40" class="plan-month-face-svg" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="currentColor"/><circle cx="14" cy="17" r="1.6" fill="#444"/><circle cx="26" cy="17" r="1.6" fill="#444"/><path d="M14 26h12" stroke="#444" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      happy: `<svg viewBox="0 0 40 40" class="plan-month-face-svg" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="currentColor"/><path d="M12 18l3-2 3 2M22 18l3-2 3 2" stroke="#444" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 25c2.2 3 9.8 3 12 0" stroke="#444" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
    };
    return faces[kind] || faces.ok;
  },

  renderPlanStatsMonth() {
    const anchor = this.getPlanStatsAnchor();
    const monthKey = Store.monthKey(new Date(`${anchor}T00:00:00`));
    const stats = Store.getPlanMonthStats(monthKey);
    const today = todayStr();
    const firstDow = new Date(stats.year, stats.month, 1).getDay();
    const mondayBased = (firstDow + 6) % 7;
    const weekdays = ['一', '二', '三', '四', '五', '六', '日']
      .map((w) => `<span class="plan-month-weekday-chip">${w}</span>`)
      .join('');
    const cells = [];
    for (let i = 0; i < mondayBased; i++) cells.push('<div class="plan-month-cell is-empty"></div>');
    stats.days.forEach((day) => {
      const isFuture = day.date > today;
      let mood = null;
      if (!isFuture) {
        // 灰难过 / 粉不爽 / 绿平淡 / 橙开心 —— 按完成率映射
        if (day.total === 0 || day.rate <= 0) mood = 'sad';
        else if (day.rate < 0.34) mood = 'meh';
        else if (day.rate < 0.67) mood = 'ok';
        else mood = 'happy';
      }
      const tip = day.total
        ? `${day.date} · 完成 ${day.done}/${day.total}`
        : `${day.date}${isFuture ? ' · 未来' : ' · 无计划'}`;
      cells.push(
        mood
          ? `<div class="plan-month-cell has-mood mood-${mood}" title="${this.escapeHtml(tip)}">${this.planMonthMoodFace(mood)}</div>`
          : `<div class="plan-month-cell is-future" title="${this.escapeHtml(tip)}"><span class="plan-month-num">${day.d}</span></div>`
      );
    });
    const label = `${stats.year} 年 ${String(stats.month + 1).padStart(2, '0')} 月`;
    return `
      <div class="plan-stats-month">
        <div class="plan-stats-nav">
          <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-prev" title="上一月">‹</button>
          <div class="plan-month-tracker-head">
            <div class="plan-month-tracker-title">Month Tracker</div>
            <div class="plan-month-tracker-sub">${this.escapeHtml(label)}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-plan-stats-next" title="下一月">›</button>
        </div>
        <div class="plan-month-weekdays">${weekdays}</div>
        <div class="plan-month-grid">${cells.join('')}</div>
        <p class="plan-stats-legend">表情按当日计划完成率：灰低 → 粉 → 绿 → 橙高</p>
      </div>`;
  },

  renderPlanSheet(type) {
    const key = this.planSheetKey || Store.currentPlanKey(type);
    const editId = this.planSheetEditId || '';
    const editFound = editId ? Store.findPlanItem(Store.getPlanItems(type, key), editId) : null;
    const editItem = editFound?.item || null;
    const chip = Store.planChipLabel(type, key);
    const priority = this.planSheetPriority || 'none';
    const parentId = this.planSheetParentId || '';
    const rawParent = parentId
      ? Store.getPlanItems(type, key).find((item) => item.id === parentId)
      : null;
    if (parentId && !rawParent) this.planSheetParentId = null;
    const parentLabel = rawParent ? String(Store.resolvePlanItem(rawParent).text || '') : '';
    const titleValue = editItem ? String(editItem.text || '') : '';
    const noteValue = editItem ? String(editItem.note || '') : '';
    const childRows = editItem && !editFound?.parent
      ? (Array.isArray(editItem.children) ? editItem.children : [])
          .filter((c) => !c.refKind)
          .map(
            (c) => `
          <div class="plan-sheet-sub-row">
            <span class="plan-sheet-subtodo-box" aria-hidden="true"></span>
            <input type="text" class="plan-sheet-sub-input" maxlength="120" placeholder="子待办" autocomplete="off" value="${this.escapeHtml(c.text || '')}">
          </div>`
          )
          .join('')
      : '';
    const iconCal = `<svg class="plan-sheet-svg" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 8h15" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 2.2v2.6M13.5 2.2v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="5.2" y="10.2" width="2.2" height="2.2" rx="0.4" fill="currentColor"/><rect x="8.9" y="10.2" width="2.2" height="2.2" rx="0.4" fill="currentColor"/><rect x="12.6" y="10.2" width="2.2" height="2.2" rx="0.4" fill="currentColor"/></svg>`;
    const iconFlag = `<svg class="plan-sheet-svg" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 17V3.5M5 3.5h8.2l-1.4 2.8 1.4 2.8H5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const iconTag = `<svg class="plan-sheet-svg" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.2 10.8 9.6 4.4A1.6 1.6 0 0 1 10.7 4h5.1v5.1a1.6 1.6 0 0 1-.5 1.1L8.9 16.6a1.2 1.2 0 0 1-1.7 0L3.2 12.5a1.2 1.2 0 0 1 0-1.7Z" fill="none" stroke="currentColor" stroke-width="1.55"/><circle cx="13.4" cy="6.6" r="1.1" fill="currentColor"/></svg>`;
    const iconRef = `<svg class="plan-sheet-svg" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.55"/><path d="M12.4 11.8a2.6 2.6 0 1 1 0-3.6" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><path d="M12.4 8.2v2.7c0 1.2.8 2.1 2 2.1" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>`;
    const iconMore = `<svg class="plan-sheet-svg" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.35" fill="currentColor"/><circle cx="10" cy="10" r="1.35" fill="currentColor"/><circle cx="15.5" cy="10" r="1.35" fill="currentColor"/></svg>`;
    const iconSend = `<svg class="plan-sheet-svg plan-sheet-svg-send" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15.2V5.4M6.4 8.8 10 5.2l3.6 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `
      <div class="plan-sheet-overlay">
        <div class="plan-sheet" data-plan-type="${type}" data-plan-key="${this.escapeHtml(key)}" data-edit-id="${this.escapeHtml(editId)}" data-priority="${priority}" data-parent-id="${this.escapeHtml(this.planSheetParentId || '')}" role="dialog" aria-label="${editId ? '编辑计划' : '添加计划'}">
          <div class="plan-sheet-body">
            <div class="plan-sheet-fields">
              <div class="plan-sheet-title-wrap">
                <input type="text" class="plan-sheet-title plan-sheet-input" maxlength="200" placeholder="准备做什么..." autocomplete="off" value="${this.escapeHtml(titleValue)}">
                <div class="plan-mention-menu hidden" role="listbox"></div>
              </div>
              <div class="plan-sheet-divider" aria-hidden="true"></div>
              <textarea class="plan-sheet-desc" rows="2" maxlength="500" placeholder="描述" autocomplete="off">${this.escapeHtml(noteValue)}</textarea>
              <div class="plan-sheet-parent-chip ${this.planSheetParentId && parentLabel ? '' : 'hidden'}" title="将作为所选待办的子待办">
                <span class="plan-sheet-parent-chip-text">子待办 · ${this.escapeHtml(parentLabel)}</span>
                <button type="button" class="plan-sheet-parent-clear" title="取消变为子待办" aria-label="取消变为子待办">×</button>
              </div>
              <div class="plan-sheet-sublist ${editFound?.parent ? 'hidden' : ''}">
                ${childRows}
                <div class="plan-sheet-sub-row is-starter">
                  <button type="button" class="plan-sheet-subtodo" title="添加子待办">
                    <span class="plan-sheet-subtodo-box" aria-hidden="true"></span>
                    <span>子待办</span>
                  </button>
                </div>
              </div>
            </div>
            <span class="plan-sheet-resize" aria-hidden="true"></span>
          </div>
          <div class="plan-sheet-toolbar">
            <div class="plan-sheet-tools">
              <div class="plan-sheet-date-wrap">
                <button type="button" class="plan-sheet-date" title="选择时间">
                  <span class="plan-sheet-date-icon" aria-hidden="true">${iconCal}</span>
                  <span class="plan-sheet-date-text">${this.escapeHtml(chip)}</span>
                </button>
                <div class="plan-sheet-picker hidden" role="dialog" aria-label="选择时间"></div>
              </div>
              <div class="plan-sheet-priority-wrap">
                <button type="button" class="plan-sheet-icon plan-sheet-priority-btn is-priority-${priority}" title="优先级">${iconFlag}</button>
                <div class="plan-sheet-priority-menu hidden" role="menu" aria-label="选择优先级">
                  <button type="button" class="plan-sheet-priority-option is-high ${priority === 'high' ? 'is-active' : ''}" data-priority="high" role="menuitem">
                    <span class="plan-priority-flag is-high">${iconFlag}</span>高优先级
                  </button>
                  <button type="button" class="plan-sheet-priority-option is-medium ${priority === 'medium' ? 'is-active' : ''}" data-priority="medium" role="menuitem">
                    <span class="plan-priority-flag is-medium">${iconFlag}</span>中优先级
                  </button>
                  <button type="button" class="plan-sheet-priority-option is-low ${priority === 'low' ? 'is-active' : ''}" data-priority="low" role="menuitem">
                    <span class="plan-priority-flag is-low">${iconFlag}</span>低优先级
                  </button>
                  <button type="button" class="plan-sheet-priority-option is-none ${priority === 'none' ? 'is-active' : ''}" data-priority="none" role="menuitem">
                    <span class="plan-priority-flag is-none">${iconFlag}</span>无优先级
                  </button>
                </div>
              </div>
              <button type="button" class="plan-sheet-icon plan-sheet-tag-btn" title="标签">${iconTag}</button>
              <button type="button" class="plan-sheet-icon plan-sheet-ref-btn" title="引用">${iconRef}</button>
              <div class="plan-sheet-more-wrap">
                <button type="button" class="plan-sheet-icon plan-sheet-more-btn" title="更多">${iconMore}</button>
                <div class="plan-sheet-more-menu hidden" role="menu" aria-label="更多操作">
                  <button type="button" class="plan-sheet-more-option" data-sheet-action="delete" role="menuitem">删除</button>
                  <button type="button" class="plan-sheet-more-option" data-sheet-action="to-sub" role="menuitem">变为子待办</button>
                </div>
                <div class="plan-sheet-nest-picker hidden" role="dialog" aria-label="选择父待办"></div>
              </div>
            </div>
            <div class="plan-sheet-tools-right">
              <button type="button" class="plan-sheet-send" title="${editId ? '保存' : '添加'}">${iconSend}</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderPlanSheetNestPicker(type, key, selectedId) {
    const editId = this.planSheetEditId || '';
    const items = Store.getPlanItems(type, key)
      .map((item) => Store.resolvePlanItem(item))
      .filter((item) => item.id !== editId);
    if (!items.length) {
      return `<div class="plan-sheet-nest-empty">当前没有可选择的待办</div>`;
    }
    return `
      <div class="plan-sheet-nest-head">选择父待办</div>
      <div class="plan-sheet-nest-list">
        ${items
          .map((item) => {
            const active = item.id === selectedId ? 'is-active' : '';
            const childCount = Array.isArray(item.children) ? item.children.length : 0;
            return `<button type="button" class="plan-sheet-nest-option ${active}" data-parent-id="${this.escapeHtml(item.id)}">
              <strong>${this.escapeHtml(item.text || '未命名待办')}</strong>
              <span>${childCount ? `已有 ${childCount} 个子待办` : '暂无子待办'}</span>
            </button>`;
          })
          .join('')}
      </div>`;
  },

  formatPlanItemText(text) {
    const raw = String(text || '');
    if (!raw) return '';
    return raw
      .split(/(#[^\s#]+)/g)
      .map((part) =>
        part.startsWith('#')
          ? `<span class="plan-tag">${this.escapeHtml(part)}</span>`
          : this.escapeHtml(part)
      )
      .join('');
  },

  extractPlanTags(text) {
    const tags = [];
    String(text || '').replace(/(^|\s)#([^\s#]+)/g, (_, __, tag) => {
      if (tag && !tags.includes(tag)) tags.push(tag);
      return '';
    });
    return tags;
  },

  planPriorityClass(priority) {
    const p = priority === 'high' || priority === 'medium' || priority === 'low' ? priority : 'none';
    return `is-priority-${p}`;
  },

  /** 弹窗内时间选择器（日/周/月），锚定在计划模块内 */
  renderPlanSheetPicker(type, selectedKey, viewMonthKey) {
    if (type === 'weekly') {
      const current = selectedKey || Store.currentPlanKey('weekly');
      const base = Store.shiftPlanKey('weekly', current, -3);
      const weeks = [];
      let k = base;
      for (let i = 0; i < 8; i++) {
        weeks.push(k);
        k = Store.shiftPlanKey('weekly', k, 1);
      }
      return `
        <div class="plan-picker-head">选择周</div>
        <div class="plan-picker-week-list">
          ${weeks
            .map((wk) => {
              const label = Store.weekRangeLabel(wk);
              const isCur = wk === Store.currentPlanKey('weekly');
              const active = wk === current ? 'is-active' : '';
              return `<button type="button" class="plan-picker-week-option ${active}" data-plan-key="${this.escapeHtml(wk)}">
                <strong>${this.escapeHtml(isCur ? '本周' : wk)}</strong>
                <span>${this.escapeHtml(label)}</span>
              </button>`;
            })
            .join('')}
        </div>`;
    }

    if (type === 'monthly') {
      const current = selectedKey || Store.currentPlanKey('monthly');
      const m = String(viewMonthKey || current).match(/^(\d{4})-(\d{2})$/);
      const year = m ? Number(m[1]) : new Date().getFullYear();
      const months = [];
      for (let i = 1; i <= 12; i++) {
        const mk = `${year}-${String(i).padStart(2, '0')}`;
        months.push(mk);
      }
      return `
        <div class="plan-picker-head">
          <button type="button" class="plan-picker-nav" data-picker-year="-1" title="上一年">‹</button>
          <span>${year} 年</span>
          <button type="button" class="plan-picker-nav" data-picker-year="1" title="下一年">›</button>
        </div>
        <div class="plan-picker-month-grid">
          ${months
            .map((mk) => {
              const n = Number(mk.slice(5));
              const active = mk === current ? 'is-active' : '';
              const isCur = mk === Store.currentPlanKey('monthly') ? 'is-current' : '';
              return `<button type="button" class="plan-picker-month-option ${active} ${isCur}" data-plan-key="${mk}">${n}月</button>`;
            })
            .join('')}
        </div>`;
    }

    // daily calendar
    const selected = selectedKey || Store.currentPlanKey('daily');
    const vm = String(viewMonthKey || selected.slice(0, 7)).match(/^(\d{4})-(\d{2})$/);
    const year = vm ? Number(vm[1]) : new Date().getFullYear();
    const month = vm ? Number(vm[2]) - 1 : new Date().getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const today = todayStr();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push('<span class="plan-picker-day is-empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${monthKey}-${String(d).padStart(2, '0')}`;
      const cls = [
        'plan-picker-day',
        date === selected ? 'is-active' : '',
        date === today ? 'is-today' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells.push(
        `<button type="button" class="${cls}" data-plan-key="${date}">${d}</button>`
      );
    }
    return `
      <div class="plan-picker-head">
        <button type="button" class="plan-picker-nav" data-picker-month="-1" title="上一月">‹</button>
        <span>${year}年${month + 1}月</span>
        <button type="button" class="plan-picker-nav" data-picker-month="1" title="下一月">›</button>
      </div>
      <div class="plan-picker-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="plan-picker-day-grid">${cells.join('')}</div>
      <button type="button" class="plan-picker-today" data-plan-key="${today}">回到今天</button>`;
  },

  renderPlanItemActions() {
    return `
      <div class="plan-item-actions">
        <button type="button" class="icon-btn btn-plan-up" title="向上调整顺序" aria-label="向上">↑</button>
        <button type="button" class="icon-btn btn-plan-down" title="向下调整顺序" aria-label="向下">↓</button>
        <button type="button" class="icon-btn btn-plan-edit" title="编辑" aria-label="编辑">✎</button>
      </div>`;
  },

  openPlanSheet(column) {
    const planType =
      this.planScope === 'weekly' || this.planScope === 'monthly' ? this.planScope : 'daily';
    this.planSheetColumn = 'plan';
    this.planSheetKey = Store.currentPlanKey(planType);
    this.planSheetPriority = 'none';
    this.planSheetParentId = null;
    this.planSheetEditId = null;
    this.planSheetOriginKey = null;
    this.planEditingId = null;
    this.render();
  },

  openPlanSheetEdit(type, key, itemId) {
    const items = Store.getPlanItems(type, key);
    const found = Store.findPlanItem(items, itemId);
    if (!found) return;
    const item = found.item;
    this.planSheetColumn = 'plan';
    this.planSheetKey = key;
    this.planSheetOriginKey = key;
    this.planSheetEditId = itemId;
    this.planSheetPriority =
      item.priority === 'high' || item.priority === 'medium' || item.priority === 'low'
        ? item.priority
        : 'none';
    this.planSheetParentId = found.parent?.id || null;
    this.planEditingId = null;
    this.render();
  },

  closePlanSheet() {
    this.planSheetColumn = null;
    this.planSheetPriority = 'none';
    this.planSheetParentId = null;
    this.planSheetEditId = null;
    this.planSheetOriginKey = null;
    this.render();
  },

  renderPlanItem(item, options = {}) {
    const isRef = Boolean(item.refKind && item.refId);
    const badge = item.refLabel || '';
    const meta =
      item.refKind === 'interview'
        ? this.formatPlanInterviewTime(item.refId)
        : item.refMeta || '';
    const children = Array.isArray(item.children) ? item.children : [];
    const childDone = children.filter((c) => c.done).length;
    const canNest = Boolean(options.canNest);
    const editing =
      Boolean(options.editingId && options.editingId === item.id) ||
      this.planSheetEditId === item.id;
    const hasChildren = children.length > 0;
    const collapsed = hasChildren && Store.isPlanChildrenCollapsed(item.id);
    const priority = item.priority === 'high' || item.priority === 'medium' || item.priority === 'low' ? item.priority : 'none';

    return `
      <li class="plan-item ${item.done ? 'is-done' : ''} ${editing ? 'is-editing' : ''} ${hasChildren ? 'has-children' : ''} ${collapsed ? 'is-collapsed' : ''} ${this.planPriorityClass(priority)} ${isRef ? `is-ref is-ref-${item.refKind}` : ''}" data-id="${item.id}" data-priority="${priority}" ${isRef ? `data-ref-kind="${item.refKind}" data-ref-id="${item.refId}"` : ''}>
        <div class="plan-item-row">
          ${
            hasChildren
              ? `<button type="button" class="plan-children-toggle" title="${collapsed ? '展开子待办' : '收起子待办'}" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? '>' : 'v'}</button>`
              : ''
          }
          <button type="button" class="plan-check ${item.done ? 'is-done' : ''}" title="${item.done ? '标为未完成' : '标为完成'}">${item.done ? '✓' : ''}</button>
          ${
            priority !== 'none'
              ? `<span class="plan-priority-dot ${this.planPriorityClass(priority)}" title="优先级" aria-hidden="true"></span>`
              : ''
          }
          <div class="plan-main">
            <span class="plan-text${isRef ? ' plan-text-ref' : ''}" ${isRef ? 'role="link" tabindex="0" title="查看引用"' : ''}>${this.formatPlanItemText(item.text)}${item.refAlive === false ? ' <em class="plan-ref-missing">（已删除）</em>' : ''}</span>
            ${item.note ? `<span class="plan-item-note">${this.escapeHtml(item.note)}</span>` : ''}
            ${
              isRef
                ? `<span class="plan-ref-meta"><span class="plan-ref-badge plan-ref-badge-${item.refKind}">${this.escapeHtml(badge)}</span>${meta ? `<span class="plan-ref-time">${this.escapeHtml(meta)}</span>` : ''}</span>`
                : ''
            }
            ${
              hasChildren
                ? `<button type="button" class="plan-sub-progress btn-plan-toggle-children" title="${collapsed ? '展开子待办' : '收起子待办'}">${childDone}/${children.length} 子待办</button>`
                : ''
            }
          </div>
          ${this.renderPlanItemActions()}
        </div>
        ${
          hasChildren
            ? `<ul class="plan-sublist ${collapsed ? 'hidden' : ''}">
                ${children
                  .map((child) =>
                    this.renderPlanSubItem(child, {
                      canNest,
                      editingId: options.editingId,
                    })
                  )
                  .join('')}
              </ul>`
            : ''
        }
        <div class="plan-sub-add hidden">
          <div class="plan-sub-input-wrap">
            <input type="text" class="plan-sub-input" maxlength="120" placeholder="添加子待办，输入 @ 引用…" autocomplete="off">
            <div class="plan-mention-menu hidden" role="listbox"></div>
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-plan-sub-confirm">添加</button>
          <button type="button" class="btn btn-ghost btn-sm btn-plan-sub-cancel">取消</button>
        </div>
      </li>`;
  },

  renderPlanSubItem(child, options = {}) {
    const resolved = Store.resolvePlanItem({ ...child, children: [] });
    const isRef = Boolean(resolved.refKind && resolved.refId);
    const badge = resolved.refLabel || '';
    const meta =
      resolved.refKind === 'interview'
        ? this.formatPlanInterviewTime(resolved.refId)
        : resolved.refMeta || '';
    const editing =
      Boolean(options.editingId && options.editingId === resolved.id) ||
      this.planSheetEditId === resolved.id;
    const priority =
      resolved.priority === 'high' || resolved.priority === 'medium' || resolved.priority === 'low'
        ? resolved.priority
        : 'none';

    return `
      <li class="plan-item plan-sub-item ${resolved.done ? 'is-done' : ''} ${editing ? 'is-editing' : ''} ${this.planPriorityClass(priority)} ${isRef ? `is-ref is-ref-${resolved.refKind}` : ''}" data-id="${resolved.id}" data-priority="${priority}" ${isRef ? `data-ref-kind="${resolved.refKind}" data-ref-id="${resolved.refId}"` : ''}>
        <div class="plan-item-row">
          <button type="button" class="plan-check ${resolved.done ? 'is-done' : ''}" title="${resolved.done ? '标为未完成' : '标为完成'}">${resolved.done ? '✓' : ''}</button>
          ${
            priority !== 'none'
              ? `<span class="plan-priority-dot ${this.planPriorityClass(priority)}" title="优先级" aria-hidden="true"></span>`
              : ''
          }
          <div class="plan-main">
            <span class="plan-text${isRef ? ' plan-text-ref' : ''}" ${isRef ? 'role="link" tabindex="0" title="查看引用"' : ''}>${this.formatPlanItemText(resolved.text)}${resolved.refAlive === false ? ' <em class="plan-ref-missing">（已删除）</em>' : ''}</span>
            ${
              isRef
                ? `<span class="plan-ref-meta"><span class="plan-ref-badge plan-ref-badge-${resolved.refKind}">${this.escapeHtml(badge)}</span>${meta ? `<span class="plan-ref-time">${this.escapeHtml(meta)}</span>` : ''}</span>`
                : ''
            }
          </div>
          ${this.renderPlanItemActions()}
        </div>
      </li>`;
  },

  openPlanNestPicker(type, key, itemId) {
    const items = Store.getPlanItems(type, key).map((item) => Store.resolvePlanItem(item));
    const found = Store.findPlanItem(items, itemId);
    if (!found) return;

    const candidates = items.filter((item) => item.id !== itemId);
    if (!candidates.length) return;

    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '变为子待办';
    const form = document.getElementById('recordForm');
    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.remove('hidden');
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.textContent = '确定';
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    const currentParentId = found.parent?.id || '';
    form.innerHTML = `
      <p class="form-hint">将「${this.escapeHtml(found.item.text || '待办')}」挂到下面某一条待办下成为子待办。若它本身还有子待办，会一并并入。</p>
      <div class="plan-nest-picker-list">
        ${candidates
          .map(
            (item, index) => `
          <label class="project-bagu-picker-item ${item.id === currentParentId ? 'is-linked' : ''}">
            <input type="radio" name="planNestParent" value="${item.id}" ${
              item.id === currentParentId || (!currentParentId && index === 0) ? 'checked' : ''
            }>
            <span class="project-bagu-picker-main">
              <span class="project-bagu-picker-title">${this.escapeHtml(item.text || '未命名待办')}</span>
              <span class="project-bagu-picker-meta">${
                Array.isArray(item.children) && item.children.length
                  ? `已有 ${item.children.length} 个子待办`
                  : '暂无子待办'
              }</span>
            </span>
          </label>`
          )
          .join('')}
      </div>`;

    form.onsubmit = (e) => {
      e.preventDefault();
      const parentId = form.querySelector('input[name="planNestParent"]:checked')?.value;
      if (!parentId || parentId === currentParentId) {
        this.closeModal();
        return;
      }
      Store.movePlanItemUnder(type, key, itemId, parentId);
      this.closeModal();
      this.render();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  formatPlanInterviewTime(interviewId) {
    const record = Store.getRecord('core', 'interview', interviewId);
    if (!record) return '';
    return this.formatDateTimeDisplay(record.date, record);
  },

  getPlanMentionKinds() {
    return [
      { id: 'handwrite', label: '题库', aliases: ['题库', '算法题', '算法', '手撕', 'leetcode'] },
      { id: 'bagu', label: '面试题', aliases: ['面试题', '八股', 'bagu'] },
      { id: 'project', label: '项目经历', aliases: ['项目经历', '项目', 'project'] },
      { id: 'interview', label: '面试', aliases: ['面试', 'interview'] },
    ];
  },

  parsePlanMention(value) {
    const text = String(value || '');
    const match = text.match(/(?:^|[\s　])@([^\s@]*)$/);
    if (!match) return null;
    const atIndex = text.lastIndexOf('@');
    return { query: match[1] || '', atIndex, prefix: text.slice(0, atIndex) };
  },

  getPlanMentionItems(kind, query = '') {
    const q = String(query || '').trim().toLowerCase();
    const match = (parts) => {
      if (!q) return true;
      return parts.some((p) => String(p || '').toLowerCase().includes(q));
    };

    if (kind === 'bagu') {
      return Store.getRawRecords('core', 'bagu')
        .slice()
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'))
        .filter((r) => {
          const bank = getBaguBank(r.bank);
          return match([r.title, bank?.name, r.category, r.difficulty]);
        })
        .slice(0, 40)
        .map((r) => {
          const bank = getBaguBank(r.bank);
          return {
            id: r.id,
            kind,
            title: r.title || '未命名题目',
            meta: [bank?.name, r.category, r.difficulty].filter(Boolean).join(' · '),
          };
        });
    }

    if (kind === 'handwrite') {
      return Store.getRawRecords('core', 'handwrite')
        .slice()
        .sort(
          (a, b) =>
            Number(a.lcNumber || 0) - Number(b.lcNumber || 0) ||
            String(a.title || '').localeCompare(String(b.title || ''), 'zh')
        )
        .filter((r) => match([Store.formatHandwritePlanText(r), r.difficulty, r.method, r.dataStructure]))
        .slice(0, 40)
        .map((r) => ({
          id: r.id,
          kind,
          title: Store.formatHandwritePlanText(r),
          meta: [r.difficulty, r.method, r.dataStructure].filter(Boolean).join(' · '),
        }));
    }

    if (kind === 'project') {
      return Store.getSortedRecords('core', 'project')
        .map((r) => this.normalizeProjectRecord(r))
        .filter((r) => match([r.name, r.role, this.formatProjectPeriod(r)]))
        .slice(0, 40)
        .map((r) => ({
          id: r.id,
          kind,
          title: r.name || '未命名项目',
          meta: [r.role, this.formatProjectPeriod(r)].filter(Boolean).join(' · '),
        }));
    }

    if (kind === 'interview') {
      return Store.getRawRecords('core', 'interview')
        .slice()
        .sort((a, b) => Store.parseRecordDateTime(b) - Store.parseRecordDateTime(a))
        .filter((r) => match([Store.formatInterviewPlanText(r), this.formatDateTimeDisplay(r.date, r), r.result]))
        .slice(0, 40)
        .map((r) => ({
          id: r.id,
          kind,
          title: Store.formatInterviewPlanText(r),
          meta: [this.formatDateTimeDisplay(r.date, r), r.result && r.result !== '待面' ? r.result : '']
            .filter(Boolean)
            .join(' · '),
        }));
    }

    return [];
  },

  bindPlanMentionInput(input, menu, { onSelectItem } = {}) {
    if (!input || !menu || typeof onSelectItem !== 'function') return;

    const state = {
      open: false,
      kind: null,
      query: '',
      atIndex: -1,
      prefix: '',
      active: 0,
      options: [],
    };

    const closeMenu = () => {
      state.open = false;
      state.kind = null;
      state.active = 0;
      state.options = [];
      menu.classList.add('hidden');
      menu.innerHTML = '';
    };

    const renderMenu = () => {
      if (!state.open) {
        menu.classList.add('hidden');
        menu.innerHTML = '';
        return;
      }

      const kinds = this.getPlanMentionKinds();
      let html = '';

      if (!state.kind) {
        const filtered = kinds.filter((k) => {
          if (!state.query) return true;
          const q = state.query.toLowerCase();
          return (
            k.label.toLowerCase().includes(q) ||
            k.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))
          );
        });
        state.options = filtered.map((k) => ({ type: 'kind', ...k }));
        html = state.options.length
          ? `<div class="plan-mention-hint">选择引用类型</div>${state.options
              .map(
                (opt, i) => `
            <button type="button" class="plan-mention-option ${i === state.active ? 'is-active' : ''}" data-index="${i}" role="option">
              <span class="plan-mention-option-title">@${this.escapeHtml(opt.label)}</span>
            </button>`
              )
              .join('')}`
          : '<div class="plan-mention-empty">没有匹配的类型</div>';
      } else {
        const kindMeta = kinds.find((k) => k.id === state.kind);
        const items = this.getPlanMentionItems(state.kind, state.query);
        state.options = [
          { type: 'back', label: '返回类型' },
          ...items.map((item) => ({ type: 'item', ...item })),
        ];
        html = `
          <div class="plan-mention-hint">
            <button type="button" class="plan-mention-back" data-index="0">← ${this.escapeHtml(kindMeta?.label || '类型')}</button>
            <span>回车选择 · Esc 关闭</span>
          </div>
          ${
            items.length
              ? items
                  .map(
                    (item, i) => `
            <button type="button" class="plan-mention-option ${i + 1 === state.active ? 'is-active' : ''}" data-index="${i + 1}" role="option">
              <span class="plan-mention-option-title">${this.escapeHtml(item.title)}</span>
              ${item.meta ? `<span class="plan-mention-option-meta">${this.escapeHtml(item.meta)}</span>` : ''}
            </button>`
                  )
                  .join('')
              : '<div class="plan-mention-empty">没有匹配的内容</div>'
          }`;
      }

      menu.innerHTML = html;
      menu.classList.remove('hidden');
      menu.querySelectorAll('.plan-mention-option, .plan-mention-back').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = Number(btn.dataset.index);
          pick(idx);
        });
      });
    };

    const syncFromInput = () => {
      const parsed = this.parsePlanMention(input.value);
      if (!parsed) {
        closeMenu();
        return;
      }
      state.open = true;
      state.atIndex = parsed.atIndex;
      state.prefix = parsed.prefix;
      const rawQuery = parsed.query;
      if (!state.kind) {
        const exact = this.getPlanMentionKinds().find((k) =>
          k.aliases.some((a) => a.toLowerCase() === rawQuery.toLowerCase())
        );
        if (exact && rawQuery) {
          state.kind = exact.id;
          state.query = '';
        } else {
          state.query = rawQuery;
        }
      } else {
        state.query = rawQuery;
      }
      state.active = 0;
      renderMenu();
    };

    const pick = (index) => {
      const opt = state.options[index];
      if (!opt) return;
      if (opt.type === 'back') {
        state.kind = null;
        state.query = '';
        input.value = `${state.prefix}@`;
        input.focus();
        const pos = input.value.length;
        input.setSelectionRange(pos, pos);
        state.active = 0;
        renderMenu();
        return;
      }
      if (opt.type === 'kind') {
        state.kind = opt.id;
        state.query = '';
        input.value = `${state.prefix}@`;
        input.focus();
        const pos = input.value.length;
        input.setSelectionRange(pos, pos);
        state.active = 0;
        renderMenu();
        return;
      }
      if (opt.type === 'item') {
        closeMenu();
        onSelectItem(opt);
      }
    };

    input.addEventListener('input', syncFromInput);
    input.addEventListener('keydown', (e) => {
      if (!state.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeMenu();
        const parsed = this.parsePlanMention(input.value);
        if (parsed) input.value = parsed.prefix.replace(/\s+$/, '');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.options.length) return;
        state.active = (state.active + 1) % state.options.length;
        renderMenu();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!state.options.length) return;
        state.active = (state.active - 1 + state.options.length) % state.options.length;
        renderMenu();
        return;
      }
      if (e.key === 'Enter') {
        if (state.options.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pick(state.active);
        }
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!menu.contains(document.activeElement)) closeMenu();
      }, 120);
    });
  },

  openPlanRefPicker(type, key, initialKind = 'bagu') {
    const kinds = [
      { id: 'bagu', label: '面试题' },
      { id: 'handwrite', label: '算法题' },
      { id: 'project', label: '项目经历' },
      { id: 'interview', label: '面试' },
    ];
    let activeKind = kinds.some((k) => k.id === initialKind) ? initialKind : 'bagu';

    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '引用到每日计划';
    const form = document.getElementById('recordForm');
    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.remove('hidden');
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.textContent = '加入计划';
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    const renderBody = () => {
      const linked = Store.getPlanRefIds(type, key, activeKind);
      let body = '';

      if (activeKind === 'interview') {
        body = this.renderPlanInterviewPickerBody(key, linked);
      } else if (activeKind === 'bagu') {
        const records = Store.getRawRecords('core', 'bagu')
          .slice()
          .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
        body = records.length
          ? `<div class="project-bagu-picker-list plan-ref-picker-list">
              ${records
                .map((r) => {
                  const checked = linked.has(r.id);
                  const bank = getBaguBank(r.bank);
                  const meta = [bank?.name, r.category, r.difficulty].filter(Boolean).join(' · ');
                  return `
                <label class="project-bagu-picker-item ${checked ? 'is-linked' : ''}">
                  <input type="checkbox" value="${r.id}" ${checked ? 'checked' : ''}>
                  <span class="project-bagu-picker-main">
                    <span class="project-bagu-picker-title">${this.escapeHtml(r.title || '未命名题目')}</span>
                    <span class="project-bagu-picker-meta">${this.escapeHtml(meta)}</span>
                  </span>
                </label>`;
                })
                .join('')}
            </div>`
          : '<div class="empty-state empty-inline">题库还没有题目，请先在「八股」中添加</div>';
      } else if (activeKind === 'handwrite') {
        const records = Store.getRawRecords('core', 'handwrite')
          .slice()
          .sort(
            (a, b) =>
              Number(a.lcNumber || 0) - Number(b.lcNumber || 0) ||
              String(a.title || '').localeCompare(String(b.title || ''), 'zh')
          );
        body = records.length
          ? `<div class="project-bagu-picker-list plan-ref-picker-list">
              ${records
                .map((r) => {
                  const checked = linked.has(r.id);
                  const meta = [r.difficulty, r.method, r.dataStructure].filter(Boolean).join(' · ');
                  return `
                <label class="project-bagu-picker-item ${checked ? 'is-linked' : ''}">
                  <input type="checkbox" value="${r.id}" ${checked ? 'checked' : ''}>
                  <span class="project-bagu-picker-main">
                    <span class="project-bagu-picker-title">${this.escapeHtml(Store.formatHandwritePlanText(r))}</span>
                    <span class="project-bagu-picker-meta">${this.escapeHtml(meta)}</span>
                  </span>
                </label>`;
                })
                .join('')}
            </div>`
          : '<div class="empty-state empty-inline">还没有算法题，请先在「手撕」中添加</div>';
      } else if (activeKind === 'project') {
        const records = Store.getSortedRecords('core', 'project').map((r) => this.normalizeProjectRecord(r));
        body = records.length
          ? `<div class="project-bagu-picker-list plan-ref-picker-list">
              ${records
                .map((r) => {
                  const checked = linked.has(r.id);
                  const meta = this.formatProjectPeriod(r);
                  return `
                <label class="project-bagu-picker-item ${checked ? 'is-linked' : ''}">
                  <input type="checkbox" value="${r.id}" ${checked ? 'checked' : ''}>
                  <span class="project-bagu-picker-main">
                    <span class="project-bagu-picker-title">${this.escapeHtml(r.name || '未命名项目')}</span>
                    <span class="project-bagu-picker-meta">${this.escapeHtml([r.role, meta].filter(Boolean).join(' · '))}</span>
                  </span>
                </label>`;
                })
                .join('')}
            </div>`
          : '<div class="empty-state empty-inline">还没有项目经历，请先在「项目准备」中添加</div>';
      }

      form.innerHTML = `
        <div class="plan-ref-tabs" role="tablist">
          ${kinds
            .map(
              (k) => `
            <button type="button" class="plan-ref-tab ${k.id === activeKind ? 'is-active' : ''}" data-kind="${k.id}">${k.label}</button>`
            )
            .join('')}
        </div>
        <p class="form-hint">勾选要加入「每日计划」的内容；已引用的会保持勾选。取消勾选不会从计划删除，请在计划列表点 ×。</p>
        <div class="plan-ref-picker-body">${body}</div>`;

      form.querySelectorAll('.plan-ref-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          activeKind = tab.dataset.kind;
          renderBody();
        });
      });
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const selected = [...form.querySelectorAll('.plan-ref-picker-body input[type="checkbox"]:checked')].map(
        (el) => el.value
      );
      Store.addPlanRefs(type, key, activeKind, selected);
      this.closeModal();
      this.render();
    };

    renderBody();
    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  renderPlanInterviewPickerBody(key, linked) {
    const now = Date.now();
    const interviews = Store.getRawRecords('core', 'interview')
      .map((r) => ({
        ...r,
        _ts: Store.parseRecordDateTime(r),
        _day: Store.interviewDateKey(r),
      }))
      .sort((a, b) => a._ts - b._ts);

    const todayList = interviews.filter((r) => r._day === key);
    const upcoming = interviews.filter((r) => r._day !== key && r._ts >= now);
    const past = interviews
      .filter((r) => r._day !== key && r._ts < now)
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 20);

    const renderGroup = (label, list) => {
      if (!list.length) return '';
      return `
        <div class="plan-interview-group">
          <h4 class="plan-interview-group-title">${label}<span>${list.length}</span></h4>
          <div class="project-bagu-picker-list plan-interview-picker-list">
            ${list
              .map((r) => {
                const checked = linked.has(r.id);
                const meta = [
                  this.formatDateTimeDisplay(r.date, r),
                  r.result && r.result !== '待面' ? r.result : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `
              <label class="project-bagu-picker-item ${checked ? 'is-linked' : ''}">
                <input type="checkbox" value="${r.id}" ${checked ? 'checked' : ''}>
                <span class="project-bagu-picker-main">
                  <span class="project-bagu-picker-title">${this.escapeHtml(Store.formatInterviewPlanText(r))}</span>
                  <span class="project-bagu-picker-meta">${this.escapeHtml(meta)}</span>
                </span>
              </label>`;
              })
              .join('')}
          </div>
        </div>`;
    };

    if (!interviews.length) {
      return '<div class="empty-state empty-inline">还没有面试日程，请先在「找工作 → 面试」中添加</div>';
    }
    return (
      [
        renderGroup(key === todayStr() ? '今日面试' : `${key} 当天`, todayList),
        renderGroup('即将到来', upcoming),
        renderGroup('近期已过（可补引）', past),
      ].join('') || '<div class="empty-state empty-inline">暂无可引用的面试</div>'
    );
  },

  openPlanRefItem(kind, refId) {
    if (!kind || !refId) return;
    if (kind === 'interview') {
      this.navigate('module', { deptId: 'core', moduleId: 'interview' });
      return;
    }
    if (kind === 'project') {
      this.navigate('module', { deptId: 'core', moduleId: 'project' });
      return;
    }
    if (kind === 'bagu') {
      const record = Store.getRecord('core', 'bagu', refId);
      if (record) this.openBaguAnswerModal('core', 'bagu', record);
      else this.navigate('module', { deptId: 'core', moduleId: 'bagu' });
      return;
    }
    if (kind === 'handwrite') {
      const record = Store.getRecord('core', 'handwrite', refId);
      if (record) this.openModal('core', 'handwrite', record);
      else this.navigate('module', { deptId: 'core', moduleId: 'handwrite' });
    }
  },

  bindPlanPanels() {
    const modules = document.querySelectorAll('.plan-module');
    if (!modules.length) return;

    const ctxOf = (el) => {
      const moduleEl = el?.closest?.('.plan-module');
      const bucket = el?.closest?.('.plan-bucket');
      const type = moduleEl?.dataset?.planType;
      const key = bucket?.dataset?.planKey;
      if (!type || !key) return null;
      return { type, key, module: moduleEl };
    };

    const showSubAdd = (parentEl, moduleEl) => {
      if (!parentEl || !moduleEl) return;
      const parentId = parentEl.dataset.id;
      if (parentId && Store.isPlanChildrenCollapsed(parentId)) {
        Store.setPlanChildrenCollapsed(parentId, false);
        this.planEditingId = parentId;
        this._planPendingSubAddId = parentId;
        this.render();
        return;
      }
      const row = parentEl.querySelector(':scope > .plan-sub-add');
      const subInput = row?.querySelector('.plan-sub-input');
      if (!row) return;
      moduleEl.querySelectorAll('.plan-sub-add').forEach((el) => {
        if (el !== row) el.classList.add('hidden');
      });
      row.classList.remove('hidden');
      subInput?.focus();
    };

    const toggleChildren = (itemEl) => {
      if (!itemEl?.dataset.id) return;
      Store.togglePlanChildrenCollapsed(itemEl.dataset.id);
      this.render();
    };

    document.querySelectorAll('[data-plan-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.planScope;
        if (scope !== 'daily' && scope !== 'weekly' && scope !== 'monthly') return;
        if (scope === this.planScope) return;
        this.planScope = scope;
        this.planSheetColumn = null;
        this.planEditingId = null;
        this.render();
      });
    });

    document.querySelectorAll('[data-plan-stats-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.planStatsScope;
        if (scope !== 'daily' && scope !== 'weekly' && scope !== 'monthly') return;
        if (scope === this.planStatsScope) return;
        this.planStatsScope = scope;
        this.render();
      });
    });

    document.querySelectorAll('.btn-plan-stats-prev').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = this.planStatsScope || 'weekly';
        const anchor = this.getPlanStatsAnchor();
        if (mode === 'daily') {
          this.planStatsAnchor = Store.shiftPlanKey('daily', anchor, -1);
        } else if (mode === 'monthly') {
          const mk = Store.monthKey(new Date(`${anchor}T00:00:00`));
          this.planStatsAnchor = `${Store.shiftPlanKey('monthly', mk, -1)}-01`;
        } else {
          const wk = Store.weekKey(new Date(`${anchor}T00:00:00`));
          this.planStatsAnchor = Store.getPlanWeekTracker(Store.shiftPlanKey('weekly', wk, -1))
            .days[0];
        }
        this.render();
      });
    });

    document.querySelectorAll('.btn-plan-stats-next').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = this.planStatsScope || 'weekly';
        const anchor = this.getPlanStatsAnchor();
        if (mode === 'daily') {
          this.planStatsAnchor = Store.shiftPlanKey('daily', anchor, 1);
        } else if (mode === 'monthly') {
          const mk = Store.monthKey(new Date(`${anchor}T00:00:00`));
          this.planStatsAnchor = `${Store.shiftPlanKey('monthly', mk, 1)}-01`;
        } else {
          const wk = Store.weekKey(new Date(`${anchor}T00:00:00`));
          this.planStatsAnchor = Store.getPlanWeekTracker(Store.shiftPlanKey('weekly', wk, 1))
            .days[0];
        }
        this.render();
      });
    });

    document.querySelectorAll('.btn-plan-fab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPlanSheet('plan');
      });
    });

    modules.forEach((moduleEl) => {
      moduleEl.querySelectorAll('.plan-check').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.plan-item');
          const ctx = ctxOf(item);
          if (!item || !ctx) return;
          Store.togglePlanItem(ctx.type, ctx.key, item.dataset.id);
          this.render();
        });
      });

      moduleEl.querySelectorAll('.plan-children-toggle, .btn-plan-toggle-children').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleChildren(btn.closest('.plan-item:not(.plan-sub-item)'));
        });
      });

      moduleEl.querySelectorAll('.btn-plan-edit').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('.plan-item');
          const ctx = ctxOf(item);
          if (!item || !ctx) return;
          this.openPlanSheetEdit(ctx.type, ctx.key, item.dataset.id);
        });
      });

      moduleEl.querySelectorAll('.btn-plan-up').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('.plan-item');
          const ctx = ctxOf(item);
          if (!item || !ctx) return;
          Store.movePlanItemOrder(ctx.type, ctx.key, item.dataset.id, -1);
          this.render();
        });
      });

      moduleEl.querySelectorAll('.btn-plan-down').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('.plan-item');
          const ctx = ctxOf(item);
          if (!item || !ctx) return;
          Store.movePlanItemOrder(ctx.type, ctx.key, item.dataset.id, 1);
          this.render();
        });
      });
      moduleEl.querySelectorAll('.plan-text-ref').forEach((el) => {
        const open = (e) => {
          e.stopPropagation();
          const item = el.closest('.plan-item');
          if (!item) return;
          this.openPlanRefItem(item.dataset.refKind, item.dataset.refId);
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(e);
          }
        });
      });

      moduleEl.querySelectorAll('.plan-sub-add').forEach((row) => {
        const parent = row.closest('.plan-item:not(.plan-sub-item)');
        const ctx = ctxOf(parent);
        const subInput = row.querySelector('.plan-sub-input');
        const subMenu = row.querySelector('.plan-mention-menu');
        if (!ctx) return;

        this.bindPlanMentionInput(subInput, subMenu, {
          onSelectItem: (opt) => {
            if (!parent?.dataset.id) return;
            Store.addPlanSubRef(ctx.type, ctx.key, parent.dataset.id, opt.kind, opt.id);
            this.planEditingId = parent.dataset.id;
            this.render();
          },
        });

        const confirm = () => {
          const text = String(subInput?.value || '').trim();
          if (!text || text === '@' || !parent) {
            subInput?.focus();
            return;
          }
          if (this.parsePlanMention(subInput?.value || '')) {
            subInput?.focus();
            return;
          }
          this.planEditingId = parent.dataset.id;
          Store.addPlanSubItem(ctx.type, ctx.key, parent.dataset.id, text);
          this.render();
        };
        row.querySelector('.btn-plan-sub-confirm')?.addEventListener('click', confirm);
        row.querySelector('.btn-plan-sub-cancel')?.addEventListener('click', () => {
          row.classList.add('hidden');
          if (subInput) subInput.value = '';
        });
        subInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            if (subMenu && !subMenu.classList.contains('hidden')) return;
            e.preventDefault();
            confirm();
          }
          if (e.key === 'Escape') {
            if (subMenu && !subMenu.classList.contains('hidden')) return;
            row.classList.add('hidden');
            if (subInput) subInput.value = '';
          }
        });
      });
    });

    if (this._planPendingSubAddId) {
      const pendingId = this._planPendingSubAddId;
      this._planPendingSubAddId = null;
      const fresh = document.querySelector(`.plan-item[data-id="${pendingId}"]`);
      const row = fresh?.querySelector(':scope > .plan-sub-add');
      const subInput = row?.querySelector('.plan-sub-input');
      if (row) {
        row.classList.remove('hidden');
        subInput?.focus();
      }
    }

    this.bindPlanSheet();

    if (!this._planEditOutsideBound) {
      this._planEditOutsideBound = true;
      document.addEventListener('click', (e) => {
        if (!this.planEditingId) return;
        if (e.target.closest('.plan-item.is-editing')) return;
        if (e.target.closest('.plan-sub-add')) return;
        if (e.target.closest('#modalOverlay')) return;
        if (e.target.closest('.plan-sheet')) return;
        this.planEditingId = null;
        this.render();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.planSheetColumn) {
          this.closePlanSheet();
          return;
        }
        if (e.key === 'Escape' && this.planEditingId) {
          this.planEditingId = null;
          this.render();
        }
      });
    }
  },

  bindPlanSheet() {
    const overlay = document.querySelector('.plan-module .plan-sheet-overlay');
    const sheet = overlay?.querySelector('.plan-sheet');
    if (!overlay || !sheet) return;
    const type = sheet.dataset.planType || 'daily';
    const input = sheet.querySelector('.plan-sheet-title') || sheet.querySelector('.plan-sheet-input');
    const desc = sheet.querySelector('.plan-sheet-desc');
    const menu = sheet.querySelector('.plan-mention-menu');
    const dateBtn = sheet.querySelector('.plan-sheet-date');
    const picker = sheet.querySelector('.plan-sheet-picker');
    const sublist = sheet.querySelector('.plan-sheet-sublist');
    const priorityBtn = sheet.querySelector('.plan-sheet-priority-btn');
    const priorityMenu = sheet.querySelector('.plan-sheet-priority-menu');
    const tagBtn = sheet.querySelector('.plan-sheet-tag-btn');
    const refBtn = sheet.querySelector('.plan-sheet-ref-btn');
    const moreBtn = sheet.querySelector('.plan-sheet-more-btn');
    const moreMenu = sheet.querySelector('.plan-sheet-more-menu');
    const nestPicker = sheet.querySelector('.plan-sheet-nest-picker');
    const parentChip = sheet.querySelector('.plan-sheet-parent-chip');
    const parentChipText = sheet.querySelector('.plan-sheet-parent-chip-text');
    let priority = this.planSheetPriority || 'none';
    let nestParentId = this.planSheetParentId || null;
    let pickerViewKey =
      type === 'daily'
        ? (this.planSheetKey || Store.currentPlanKey('daily')).slice(0, 7)
        : type === 'monthly'
          ? this.planSheetKey || Store.currentPlanKey('monthly')
          : this.planSheetKey || Store.currentPlanKey('weekly');

    const refreshChip = () => {
      const key = this.planSheetKey || Store.currentPlanKey(type);
      sheet.dataset.planKey = key;
      const text = sheet.querySelector('.plan-sheet-date-text');
      if (text) text.textContent = Store.planChipLabel(type, key);
      // 切换日期后校验父待办是否仍存在
      if (nestParentId && !Store.getPlanItems(type, key).some((item) => item.id === nestParentId)) {
        clearNestParent();
      }
    };

    const closePicker = () => picker?.classList.add('hidden');
    const closePriorityMenu = () => priorityMenu?.classList.add('hidden');
    const closeMoreMenu = () => moreMenu?.classList.add('hidden');
    const closeNestPicker = () => nestPicker?.classList.add('hidden');
    const closeFloating = () => {
      closePicker();
      closePriorityMenu();
      closeMoreMenu();
      closeNestPicker();
    };

    const refreshParentChip = () => {
      const key = this.planSheetKey || Store.currentPlanKey(type);
      sheet.dataset.parentId = nestParentId || '';
      this.planSheetParentId = nestParentId;
      if (!parentChip) return;
      if (!nestParentId) {
        parentChip.classList.add('hidden');
        if (parentChipText) parentChipText.textContent = '';
        return;
      }
      const raw = Store.getPlanItems(type, key).find((item) => item.id === nestParentId);
      const label = raw ? String(Store.resolvePlanItem(raw).text || '未命名待办') : '';
      if (!label) {
        nestParentId = null;
        this.planSheetParentId = null;
        parentChip.classList.add('hidden');
        return;
      }
      if (parentChipText) parentChipText.textContent = `子待办 · ${label}`;
      parentChip.classList.remove('hidden');
    };

    const clearNestParent = () => {
      nestParentId = null;
      this.planSheetParentId = null;
      refreshParentChip();
      closeNestPicker();
    };

    const paintNestPicker = () => {
      if (!nestPicker) return;
      const key = this.planSheetKey || Store.currentPlanKey(type);
      nestPicker.innerHTML = this.renderPlanSheetNestPicker(type, key, nestParentId);
      nestPicker.querySelectorAll('[data-parent-id]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          nestParentId = btn.dataset.parentId || null;
          this.planSheetParentId = nestParentId;
          refreshParentChip();
          closeNestPicker();
        });
      });
    };

    const openNestParentPicker = () => {
      closePicker();
      closePriorityMenu();
      closeMoreMenu();
      if (!nestPicker) return;
      paintNestPicker();
      nestPicker.classList.remove('hidden');
    };

    const applyPriority = (next) => {
      priority = next === 'high' || next === 'medium' || next === 'low' ? next : 'none';
      this.planSheetPriority = priority;
      sheet.dataset.priority = priority;
      if (priorityBtn) {
        priorityBtn.classList.remove('is-priority-none', 'is-priority-high', 'is-priority-medium', 'is-priority-low');
        priorityBtn.classList.add(`is-priority-${priority}`);
      }
      priorityMenu?.querySelectorAll('.plan-sheet-priority-option').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.priority === priority);
      });
      closePriorityMenu();
    };

    const paintPicker = () => {
      if (!picker) return;
      picker.innerHTML = this.renderPlanSheetPicker(
        type,
        this.planSheetKey || Store.currentPlanKey(type),
        pickerViewKey
      );
      picker.querySelectorAll('[data-plan-key]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const k = btn.dataset.planKey;
          if (!k) return;
          this.planSheetKey = k;
          refreshChip();
          closePicker();
        });
      });
      picker.querySelectorAll('[data-picker-month]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const delta = Number(btn.dataset.pickerMonth) || 0;
          pickerViewKey = Store.shiftPlanKey('monthly', pickerViewKey, delta);
          paintPicker();
        });
      });
      picker.querySelectorAll('[data-picker-year]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const delta = Number(btn.dataset.pickerYear) || 0;
          const y = Number(String(pickerViewKey).slice(0, 4)) + delta;
          const mm = String(pickerViewKey).slice(5, 7) || '01';
          pickerViewKey = `${y}-${mm}`;
          paintPicker();
        });
      });
    };

    const makeSubRow = (value = '', { starter = false } = {}) => {
      const row = document.createElement('div');
      row.className = `plan-sheet-sub-row${starter ? ' is-starter' : ''}`;
      if (starter) {
        row.innerHTML = `
          <button type="button" class="plan-sheet-subtodo" title="添加子待办">
            <span class="plan-sheet-subtodo-box" aria-hidden="true"></span>
            <span>子待办</span>
          </button>`;
        row.querySelector('.plan-sheet-subtodo')?.addEventListener('click', (e) => {
          e.stopPropagation();
          activateStarter(row);
        });
      } else {
        row.innerHTML = `
          <span class="plan-sheet-subtodo-box" aria-hidden="true"></span>
          <input type="text" class="plan-sheet-sub-input" maxlength="120" placeholder="子待办" autocomplete="off">`;
        const subInput = row.querySelector('.plan-sheet-sub-input');
        if (subInput) subInput.value = value;
        subInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            ensureTrailingStarter();
            const starterRow = sublist?.querySelector('.plan-sheet-sub-row.is-starter');
            if (starterRow) activateStarter(starterRow);
          }
        });
      }
      return row;
    };

    const ensureTrailingStarter = () => {
      if (!sublist) return;
      let starter = sublist.querySelector('.plan-sheet-sub-row.is-starter');
      if (!starter) {
        starter = makeSubRow('', { starter: true });
        sublist.appendChild(starter);
        return;
      }
      sublist.appendChild(starter);
    };

    const activateStarter = (starterRow) => {
      if (!sublist || !starterRow) return;
      const editRow = makeSubRow('', { starter: false });
      sublist.insertBefore(editRow, starterRow);
      ensureTrailingStarter();
      editRow.querySelector('.plan-sheet-sub-input')?.focus();
    };

    const collectSubtasks = () =>
      [...(sublist?.querySelectorAll('.plan-sheet-sub-input') || [])]
        .map((el) => String(el.value || '').trim())
        .filter(Boolean);

    const insertTagMarker = () => {
      if (!input) return;
      const value = String(input.value || '');
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const needSpace = before.length > 0 && !/\s$/.test(before) && !before.endsWith('#');
      const insert = `${needSpace ? ' ' : ''}#`;
      input.value = `${before}${insert}${after}`;
      const caret = before.length + insert.length;
      input.setSelectionRange(caret, caret);
      input.focus();
    };

    const insertMentionMarker = () => {
      if (!input) return;
      const value = String(input.value || '');
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      if (/@$/.test(before) || /(?:^|[\s　])@$/.test(before)) {
        input.setSelectionRange(before.length, before.length);
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const needSpace = before.length > 0 && !/\s$/.test(before);
      const insert = `${needSpace ? ' ' : ''}@`;
      input.value = `${before}${insert}${after}`;
      const caret = before.length + insert.length;
      input.setSelectionRange(caret, caret);
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const clearDraft = () => {
      if (input) input.value = '';
      if (desc) desc.value = '';
      applyPriority('none');
      clearNestParent();
      if (sublist) {
        sublist.innerHTML = '';
        sublist.appendChild(makeSubRow('', { starter: true }));
      }
    };

    const submit = () => {
      const key = this.planSheetKey || Store.currentPlanKey(type);
      const editId = this.planSheetEditId || sheet.dataset.editId || '';
      const text = String(input?.value || '').trim();
      const note = String(desc?.value || '').trim();
      const children = collectSubtasks();
      if ((!text || text === '@') && !children.length) {
        input?.focus();
        return;
      }
      if (text && this.parsePlanMention(input?.value || '')) {
        input?.focus();
        return;
      }
      const title = text || children.shift() || '';
      if (!title) {
        input?.focus();
        return;
      }
      const extra = {
        note,
        priority,
        tags: this.extractPlanTags(title),
      };

      if (editId) {
        const originKey = this.planSheetOriginKey || key;
        const isTop = !Store.findPlanItem(Store.getPlanItems(type, originKey), editId)?.parent;
        Store.updatePlanItem(type, originKey, editId, {
          ...extra,
          children: isTop ? children : undefined,
        });
        if (isTop && key !== originKey) {
          Store.movePlanItemToKey(type, originKey, key, editId);
        }
        const found = Store.findPlanItem(Store.getPlanItems(type, key), editId);
        const currentParentId = found?.parent?.id || null;
        if (nestParentId && nestParentId !== editId && nestParentId !== currentParentId) {
          Store.movePlanItemUnder(type, key, editId, nestParentId);
        } else if (!nestParentId && currentParentId) {
          Store.promotePlanSubItem(type, key, editId);
        }
      } else if (nestParentId && Store.getPlanItems(type, key).some((item) => item.id === nestParentId)) {
        Store.addPlanSubItem(type, key, nestParentId, title, extra);
        children.forEach((childText) => {
          Store.addPlanSubItem(type, key, nestParentId, childText);
        });
      } else {
        Store.addPlanItem(type, key, title, { ...extra, children });
      }
      this.planSheetColumn = null;
      this.planSheetPriority = 'none';
      this.planSheetParentId = null;
      this.planSheetEditId = null;
      this.planSheetOriginKey = null;
      this.planEditingId = null;
      this.render();
    };

    this.bindPlanMentionInput(input, menu, {
      onSelectItem: (opt) => {
        const key = this.planSheetKey || Store.currentPlanKey(type);
        Store.addPlanRefs(type, key, opt.kind, [opt.id]);
        this.planSheetColumn = null;
        this.planSheetPriority = 'none';
        this.planSheetParentId = null;
        this.planSheetEditId = null;
        this.planSheetOriginKey = null;
        this.planEditingId = null;
        this.render();
      },
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closePlanSheet();
    });
    sheet.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!e.target.closest('.plan-sheet-date-wrap')) closePicker();
      if (!e.target.closest('.plan-sheet-priority-wrap')) closePriorityMenu();
      if (!e.target.closest('.plan-sheet-more-wrap')) {
        closeMoreMenu();
        closeNestPicker();
      }
    });

    sheet.querySelector('.plan-sheet-send')?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (menu && !menu.classList.contains('hidden')) return;
        e.preventDefault();
        submit();
      }
    });

    dateBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closePriorityMenu();
      closeMoreMenu();
      closeNestPicker();
      if (!picker) return;
      const willOpen = picker.classList.contains('hidden');
      if (willOpen) {
        paintPicker();
        picker.classList.remove('hidden');
      } else {
        closePicker();
      }
    });

    priorityBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closePicker();
      closeMoreMenu();
      closeNestPicker();
      priorityMenu?.classList.toggle('hidden');
    });
    priorityMenu?.querySelectorAll('[data-priority]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyPriority(btn.dataset.priority);
      });
    });

    tagBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloating();
      insertTagMarker();
    });

    refBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloating();
      insertMentionMarker();
    });

    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closePicker();
      closePriorityMenu();
      closeNestPicker();
      moreMenu?.classList.toggle('hidden');
    });
    moreMenu?.querySelectorAll('[data-sheet-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.sheetAction;
        closeMoreMenu();
        if (action === 'delete') {
          const editId = this.planSheetEditId || sheet.dataset.editId || '';
          const key = this.planSheetOriginKey || this.planSheetKey || Store.currentPlanKey(type);
          if (editId) {
            Store.deletePlanItem(type, key, editId);
            this.closePlanSheet();
            return;
          }
          clearDraft();
          this.closePlanSheet();
          return;
        }
        if (action === 'to-sub') openNestParentPicker();
      });
    });

    sheet.querySelector('.plan-sheet-parent-clear')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearNestParent();
    });

    sublist?.querySelector('.plan-sheet-subtodo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const starter = e.currentTarget.closest('.plan-sheet-sub-row');
      activateStarter(starter);
    });

    sublist?.querySelectorAll('.plan-sheet-sub-input').forEach((subInput) => {
      subInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ensureTrailingStarter();
          const starterRow = sublist.querySelector('.plan-sheet-sub-row.is-starter');
          if (starterRow) activateStarter(starterRow);
        }
      });
    });

    requestAnimationFrame(() => {
      input?.focus();
      if (input && this.planSheetEditId) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    });
  },

  async updateChatLlmStatus() {
    const el = document.getElementById('chatLlmStatus');
    if (!el) return;

    const status = await NLP.fetchLLMStatus();
    el.classList.remove('chat-llm-ok', 'chat-llm-error', 'chat-llm-offline');

    if (!status.configured) {
      el.textContent = `离线模式 · ${status.error || '未配置 LLM'}`;
      el.classList.add('chat-llm-offline');
      return;
    }
    if (status.connected) {
      el.textContent = `Kimi 已连接 · ${status.model}`;
      el.classList.add('chat-llm-ok');
      return;
    }
    el.textContent = `Kimi 未连上 · ${status.error || '请检查 LLM 设置'}`;
    el.classList.add('chat-llm-error');
  },

  renderChatPanel() {
    const assistant = Store.getAssistant();
    const messages = Store.getChatMessages();
    const collapsed = Store.isChatCollapsed();

    return `
      <div class="chat-header">
        <button type="button" class="chat-header-profile" id="btnAssistantSettings" title="点击设置小助手人设与语气">
          ${this.renderChatAvatar('assistant')}
          <div class="chat-header-info">
            <h3>${this.escapeHtml(assistant.name)}</h3>
            <p id="chatLlmStatus">${collapsed ? '已收起 · 点击右侧展开' : '检测 Kimi 连接中…'}</p>
          </div>
        </button>
        <button type="button" class="chat-collapse-btn" id="btnChatCollapse" title="${collapsed ? '展开时间喵' : '收起时间喵'}" aria-expanded="${collapsed ? 'false' : 'true'}">
          <span class="chat-collapse-label">${collapsed ? '展开' : '收起'}</span>
          <span class="chat-collapse-chevron" aria-hidden="true">${collapsed ? '›' : '‹'}</span>
        </button>
      </div>
      <div class="chat-body">
        <div class="chat-messages" id="chatMessages">
          ${messages.map((m) => this.renderChatMessage(m)).join('')}
        </div>
        <div class="chat-input-area">
          <textarea id="chatInput" class="chat-input" rows="1" placeholder="跟${this.escapeHtml(assistant.name)}说点什么…"></textarea>
          <button type="button" class="btn btn-primary chat-send-btn" id="btnChatSend">发送</button>
        </div>
      </div>
    `;
  },

  renderChatAvatar(role) {
    if (role === 'assistant') {
      const assistant = Store.getAssistant();
      if (assistant.avatar) {
        return `<span class="chat-avatar chat-avatar-assistant"><img src="${assistant.avatar}" alt=""></span>`;
      }
      return `<span class="chat-avatar chat-avatar-assistant chat-avatar-bot">🐱</span>`;
    }

    const profile = Store.getProfile();
    const name = profile.username?.trim() || 'CEO';
    if (profile.avatar) {
      return `<span class="chat-avatar chat-avatar-user"><img src="${profile.avatar}" alt=""></span>`;
    }
    return `<span class="chat-avatar chat-avatar-user">${this.escapeHtml(name.charAt(0).toUpperCase())}</span>`;
  },

  renderChatMessage(msg) {
    const isUser = msg.role === 'user';
    const time = this.formatChatTime(msg.createdAt);
    return `
      <div class="chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-assistant'}">
        ${!isUser ? this.renderChatAvatar('assistant') : ''}
        <div class="chat-msg-body">
          <div class="chat-msg-bubble">${this.formatChatContent(msg.content)}</div>
          <div class="chat-msg-time">${time}</div>
        </div>
        ${isUser ? this.renderChatAvatar('user') : ''}
      </div>`;
  },

  formatChatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderModuleIcon(mod, className = 'module-page-icon') {
    if (mod?.iconSrc) {
      return `<img class="${className} module-icon-img" src="${this.escapeHtml(mod.iconSrc)}" alt="">`;
    }
    return `<span class="${className}">${mod?.icon || ''}</span>`;
  },

  setModalTitle(mod, titleText) {
    const el = document.getElementById('modalTitle');
    if (!el) return;
    if (mod?.iconSrc) {
      el.innerHTML = `${this.renderModuleIcon(mod, 'modal-module-icon')} ${this.escapeHtml(titleText)}`;
    } else {
      el.textContent = `${mod?.icon || ''} ${titleText}`;
    }
  },

  formatChatContent(str) {
    return this.escapeHtml(str).replace(/\n/g, '<br>');
  },

  scrollChatToBottom() {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  },

  appendChatMessageToDom(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', this.renderChatMessage(msg));
    this.scrollChatToBottom();
  },

  showChatTyping() {
    const container = document.getElementById('chatMessages');
    if (!container || document.getElementById('chatTyping')) return;
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="chat-msg chat-msg-assistant" id="chatTyping">
        ${this.renderChatAvatar('assistant')}
        <div class="chat-msg-body">
          <div class="chat-msg-bubble chat-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`
    );
    this.scrollChatToBottom();
  },

  hideChatTyping() {
    document.getElementById('chatTyping')?.remove();
  },

  refreshHomeCards() {
    const grid = document.getElementById('cardGrid');
    if (grid) grid.innerHTML = this.renderCards();
    this.bindHomeCardActions();
  },

  bindHomeCardActions() {
    document.querySelectorAll('.checkin-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.toggleCardCheckIn(btn.dataset.cardId);
        this.render();
      });
    });

    document.querySelectorAll('.card-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('删除这张打卡卡片？')) {
          Store.deleteCard(btn.dataset.cardId);
          this.render();
        }
      });
    });
  },

  async handleChatSend() {
    const input = document.getElementById('chatInput');
    const btn = document.getElementById('btnChatSend');
    const text = input?.value?.trim();
    if (!text || this.chatBusy) return;

    this.chatBusy = true;
    btn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    const userMsg = Store.addChatMessage({ role: 'user', content: text });
    this.appendChatMessageToDom(userMsg);
    this.showChatTyping();

    const assistant = Store.getAssistant();
    const recentMessages = Store.getChatMessages().slice(-10);

    try {
      const { intent, llmError } = await NLP.classifyIntent(text, { assistant, recentMessages });

      if (intent === 'chat') {
        let reply = await NLP.generateChatReply(text, { assistant, recentMessages });
        if (llmError && !reply.startsWith('⚠️')) {
          reply = `（意图识别已降级为离线规则）\n\n${reply}`;
        }
        this.hideChatTyping();
        const assistantMsg = Store.addChatMessage({ role: 'assistant', content: reply });
        this.appendChatMessageToDom(assistantMsg);
      } else {
        const existingCards = Store.getCards();
        const parsed = await NLP.parse(text, { existingCards });
        const { action, card, targetTitle, fallback } = NLP.applyParsed(parsed, existingCards);

        if (action === 'create') {
          Store.addCard(card);
        } else {
          Store.updateCard(card);
        }

        const reply = NLP.buildCardReply(action, card, { assistant, targetTitle, fallback });
        this.hideChatTyping();
        const assistantMsg = Store.addChatMessage({ role: 'assistant', content: reply });
        this.appendChatMessageToDom(assistantMsg);
        this.refreshHomeCards();
      }
    } catch (err) {
      this.hideChatTyping();
      const assistantMsg = Store.addChatMessage({
        role: 'assistant',
        content: `喵…${assistant.name || '时间喵'}有点迷糊了：${err.message || '换个说法试试？'}`,
      });
      this.appendChatMessageToDom(assistantMsg);
    } finally {
      this.chatBusy = false;
      btn.disabled = false;
      input?.focus();
    }
  },

  openAssistantModal() {
    const assistant = Store.getAssistant();
    this.assistantDraft = {
      name: assistant.name || '时间喵',
      avatar: assistant.avatar || null,
      persona: assistant.persona || '',
      tone: assistant.tone || '',
    };

    document.getElementById('modalTitle').textContent = '🐱 小助手人设';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="profile-preview">
        <span class="chat-avatar chat-avatar-assistant chat-avatar-lg ${this.assistantDraft.avatar ? '' : 'chat-avatar-bot'}" id="modalAssistantAvatar">
          <img id="modalAssistantAvatarImg" class="profile-avatar-img ${this.assistantDraft.avatar ? '' : 'hidden'}" alt=""
            ${this.assistantDraft.avatar ? `src="${this.assistantDraft.avatar}"` : ''}>
          <span class="chat-avatar-bot-icon ${this.assistantDraft.avatar ? 'hidden' : ''}" id="modalAssistantAvatarFallback">🐱</span>
        </span>
        <div class="profile-upload-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btnPickAssistantAvatar">上传头像</button>
          <button type="button" class="btn btn-ghost btn-sm ${this.assistantDraft.avatar ? '' : 'hidden'}" id="btnRemoveAssistantAvatar">恢复默认</button>
        </div>
        <input type="file" id="assistantAvatarFileInput" accept="image/*" hidden>
      </div>
      <div class="form-group">
        <label>小助手名称</label>
        <input type="text" name="assistantName" id="assistantNameInput" maxlength="12" placeholder="时间喵" required>
      </div>
      <div class="form-group">
        <label>人设</label>
        <textarea name="assistantPersona" id="assistantPersonaInput" maxlength="200" rows="3"
          placeholder="例如：一只软萌的时间管理小猫，最喜欢陪用户聊天和记习惯"></textarea>
      </div>
      <div class="form-group">
        <label>语气</label>
        <textarea name="assistantTone" id="assistantToneInput" maxlength="200" rows="3"
          placeholder="例如：温柔可爱、简短活泼，偶尔在句尾加「喵～」"></textarea>
      </div>
      <p class="settings-hint">点击聊天区头像即可打开此设置。配置 LLM 后，闲聊会按你的人设和语气生成；离线时使用内置猫猫回复。</p>
    `;

    const nameInput = document.getElementById('assistantNameInput');
    const personaInput = document.getElementById('assistantPersonaInput');
    const toneInput = document.getElementById('assistantToneInput');
    nameInput.value = this.assistantDraft.name;
    personaInput.value = this.assistantDraft.persona;
    toneInput.value = this.assistantDraft.tone;
    const imgEl = document.getElementById('modalAssistantAvatarImg');
    const fallbackEl = document.getElementById('modalAssistantAvatarFallback');
    const avatarWrap = document.getElementById('modalAssistantAvatar');
    const removeBtn = document.getElementById('btnRemoveAssistantAvatar');

    const syncPreview = () => {
      if (this.assistantDraft.avatar) {
        imgEl.src = this.assistantDraft.avatar;
        imgEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
        avatarWrap.classList.remove('chat-avatar-bot');
      } else {
        imgEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
        avatarWrap.classList.add('chat-avatar-bot');
      }
      removeBtn.classList.toggle('hidden', !this.assistantDraft.avatar);
    };

    document.getElementById('btnPickAssistantAvatar').addEventListener('click', () => {
      document.getElementById('assistantAvatarFileInput').click();
    });

    document.getElementById('assistantAvatarFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        this.assistantDraft.avatar = await this.compressAvatar(file);
        syncPreview();
      } catch (err) {
        alert(err.message || '头像上传失败');
      }
      e.target.value = '';
    });

    removeBtn.addEventListener('click', () => {
      this.assistantDraft.avatar = null;
      syncPreview();
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      Store.saveAssistant({
        name: nameInput.value.trim() || '时间喵',
        avatar: this.assistantDraft.avatar,
        persona: personaInput.value.trim(),
        tone: toneInput.value.trim(),
      });
      this.closeModal();
      if (this.route.view === 'home') this.render();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  getDeptExpanded(deptId) {
    this.deptExpanded = this.deptExpanded || {};
    if (!this.deptExpanded[deptId]) {
      const dept = getDepartment(deptId);
      this.deptExpanded[deptId] = new Set(dept?.modules.map((m) => m.id) || []);
    }
    return this.deptExpanded[deptId];
  },

  setDeptExpanded(deptId, moduleId, expanded = true) {
    const set = this.getDeptExpanded(deptId);
    if (expanded) set.add(moduleId);
    else set.delete(moduleId);
  },

  renderDept(deptId) {
    const dept = getDepartment(deptId);
    if (!dept) return '<div class="empty-state">部门不存在</div>';

    if (dept.layout === 'accordion') {
      return this.renderDeptAccordion(dept);
    }

    return `
      <div class="module-grid">
        ${dept.modules
          .map((m) => {
            const count = Store.getRecords(deptId, m.id).length;
            const today = Store.getRecords(deptId, m.id).some((r) => r.date === todayStr());
            return `
              <div class="module-card" data-dept="${deptId}" data-module="${m.id}"
                style="border-color:${today ? dept.color + '33' : 'transparent'}">
                <div class="icon">${m.icon}</div>
                <h4>${m.name}</h4>
                <p>${m.desc}</p>
                <div class="count">${count} 条记录${today ? ' · 今日已记' : ''}</div>
              </div>`;
          })
          .join('')}
      </div>
    `;
  },

  renderModuleToolbar(m, dept) {
    if (m.recordView === 'habitChecklist' || m.recordView === 'weekdayCheckin') return '';
    if (m.id === 'sleep') return this.renderSleepToolbar(dept);
    if (m.id === 'study') return this.renderStudyToolbar(dept);
    const sort = Store.getModuleSort(dept.id, m.id);
    return `
      <div class="accordion-toolbar accordion-toolbar-icons">
        <div class="toolbar-actions">
          <div class="sort-menu-wrap">
            <button type="button" class="icon-btn btn-sort-toggle" title="调整顺序"
              data-dept="${dept.id}" data-module="${m.id}">⇅</button>
            <div class="sort-dropdown hidden" data-dept="${dept.id}" data-module="${m.id}">
              <button type="button" class="sort-option ${sort.mode === 'default' ? 'active' : ''}"
                data-sort="default" data-dept="${dept.id}" data-module="${m.id}">默认</button>
              <button type="button" class="sort-option ${sort.mode === 'time' ? 'active' : ''}"
                data-sort="time" data-dept="${dept.id}" data-module="${m.id}">时间</button>
              <button type="button" class="sort-option ${sort.mode === 'custom' ? 'active' : ''}"
                data-sort="custom" data-dept="${dept.id}" data-module="${m.id}">自定义</button>
            </div>
          </div>
          <button type="button" class="icon-btn btn-add-record" title="新增记录"
            data-dept="${dept.id}" data-module="${m.id}">+</button>
        </div>
      </div>`;
  },

  parseTimeToMinutes(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
    return h * 60 + min;
  },

  calcSleepDurationMinutes(bedtime, wakeup) {
    const bed = this.parseTimeToMinutes(bedtime);
    const wake = this.parseTimeToMinutes(wakeup);
    if (bed == null || wake == null) return null;
    let end = wake;
    if (end <= bed) end += 24 * 60;
    return end - bed;
  },

  calcSleepHours(bedtime, wakeup) {
    const mins = this.calcSleepDurationMinutes(bedtime, wakeup);
    return mins == null ? null : mins / 60;
  },

  formatSleepDuration(bedtime, wakeup) {
    const mins = this.calcSleepDurationMinutes(bedtime, wakeup);
    if (mins == null) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} h ${m} min`;
  },

  formatSleepHoursDisplay(value, bedtime, wakeup) {
    if (bedtime && wakeup) {
      const formatted = this.formatSleepDuration(bedtime, wakeup);
      if (formatted) return formatted;
    }
    const raw = String(value || '');
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const totalMins = Math.round(Number(raw) * 60);
      return `${Math.floor(totalMins / 60)} h ${totalMins % 60} min`;
    }
    return raw;
  },

  normalizeSleepType(value) {
    return value === 'nap' ? 'nap' : 'long';
  },

  sleepTypeLabel(sleepType) {
    return this.normalizeSleepType(sleepType) === 'nap' ? '小憩' : '长睡眠';
  },

  getSleepTimelineSegments(record) {
    const bed = this.parseTimeToMinutes(record.bedtime);
    const wake = this.parseTimeToMinutes(record.wakeup);
    if (bed == null || wake == null) return [];
    if (wake > bed) return [{ start: bed, end: wake }];
    if (wake === bed) return [];
    return [
      { start: bed, end: 24 * 60 },
      { start: 0, end: wake },
    ];
  },

  formatSleepAxisTime(mins) {
    const DAY = 24 * 60;
    const m = Math.max(0, Math.min(DAY, Math.round(mins)));
    if (m >= DAY) return '24:00';
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  },

  /**
   * 周视图 Y 轴：上 00:00 → 下 24:00（时钟分钟）
   * 无跨午夜时按数据动态收窄；有过夜睡眠则用全日，避免柱子被拆得看不清范围
   */
  computeSleepWeekYRange(recordsByDay) {
    const DAY = 24 * 60;
    let minM = Infinity;
    let maxM = -Infinity;
    let hasOvernight = false;

    recordsByDay.forEach((list) => {
      (list || []).forEach((r) => {
        const bed = this.parseTimeToMinutes(r.bedtime);
        const wake = this.parseTimeToMinutes(r.wakeup);
        if (bed != null && wake != null && wake <= bed) hasOvernight = true;
        this.getSleepTimelineSegments(r).forEach((seg) => {
          minM = Math.min(minM, seg.start);
          maxM = Math.max(maxM, seg.end);
        });
      });
    });

    if (!Number.isFinite(minM) || !Number.isFinite(maxM) || maxM <= minM) {
      return { rangeStart: 0, rangeEnd: DAY };
    }
    if (hasOvernight || maxM - minM >= 16 * 60) {
      return { rangeStart: 0, rangeEnd: DAY };
    }

    const padMins = 60;
    const minSpan = 8 * 60;
    let rangeStart = Math.max(0, minM - padMins);
    let rangeEnd = Math.min(DAY, maxM + padMins);
    let span = rangeEnd - rangeStart;
    if (span < minSpan) {
      const extra = (minSpan - span) / 2;
      rangeStart = Math.max(0, rangeStart - extra);
      rangeEnd = Math.min(DAY, rangeEnd + extra);
      span = rangeEnd - rangeStart;
      if (span < minSpan) {
        if (rangeStart <= 0) rangeEnd = Math.min(DAY, rangeStart + minSpan);
        else rangeStart = Math.max(0, rangeEnd - minSpan);
      }
    }

    rangeStart = Math.floor(rangeStart / 60) * 60;
    rangeEnd = Math.ceil(rangeEnd / 60) * 60;
    if (rangeEnd <= rangeStart) rangeEnd = Math.min(DAY, rangeStart + 60);
    return { rangeStart, rangeEnd };
  },

  getSleepViewAnchor() {
    if (this.sleepViewAnchor && /^\d{4}-\d{2}-\d{2}$/.test(this.sleepViewAnchor)) {
      return this.sleepViewAnchor;
    }
    return todayStr();
  },

  getWeekDateList(anchorDate) {
    const d = new Date(`${anchorDate}T00:00:00`);
    const mondayOffset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - mondayOffset);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(d);
      cur.setDate(d.getDate() + i);
      dates.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      );
    }
    return dates;
  },

  formatSleepRangeLabel(mode, anchor) {
    if (mode === 'week') {
      const days = this.getWeekDateList(anchor);
      const fmt = (s) => s.slice(5).replace('-', '/');
      return `${fmt(days[0])} - ${fmt(days[6])}`;
    }
    if (mode === 'month') {
      const m = anchor.match(/^(\d{4})-(\d{2})/);
      return m ? `${m[1]}年${Number(m[2])}月` : anchor;
    }
    return formatDate(anchor);
  },

  shiftSleepViewAnchor(delta) {
    const mode = this.sleepViewMode || 'day';
    const anchor = this.getSleepViewAnchor();
    const d = new Date(`${anchor}T00:00:00`);
    if (mode === 'week') d.setDate(d.getDate() + delta * 7);
    else if (mode === 'month') d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta);
    this.sleepViewAnchor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  renderSleepToolbar(dept) {
    const mode = this.sleepViewMode || 'day';
    const anchor = this.getSleepViewAnchor();
    const rangeCenter =
      mode === 'week'
        ? `<div class="sleep-toolbar-range">
            <button type="button" class="btn btn-ghost btn-sm btn-sleep-prev" title="上一周">‹</button>
            <span class="sleep-chart-range">本周 ${this.formatSleepRangeLabel('week', anchor)}</span>
            <button type="button" class="btn btn-ghost btn-sm btn-sleep-next" title="下一周">›</button>
          </div>`
        : mode === 'month'
          ? `<div class="sleep-toolbar-range">
              <button type="button" class="btn btn-ghost btn-sm btn-sleep-prev" title="上一月">‹</button>
              <span class="sleep-chart-range">${this.formatSleepRangeLabel('month', anchor)}</span>
              <button type="button" class="btn btn-ghost btn-sm btn-sleep-next" title="下一月">›</button>
            </div>`
          : `<div class="sleep-toolbar-range is-empty" aria-hidden="true"></div>`;
    return `
      <div class="accordion-toolbar accordion-toolbar-icons sleep-toolbar">
        <div class="sleep-view-tabs" role="tablist">
          <button type="button" class="sleep-view-tab ${mode === 'day' ? 'is-active' : ''}" data-sleep-view="day">日</button>
          <button type="button" class="sleep-view-tab ${mode === 'week' ? 'is-active' : ''}" data-sleep-view="week">周</button>
          <button type="button" class="sleep-view-tab ${mode === 'month' ? 'is-active' : ''}" data-sleep-view="month">月</button>
        </div>
        ${rangeCenter}
        <div class="toolbar-actions">
          <button type="button" class="icon-btn btn-add-record" title="新增记录"
            data-dept="${dept.id}" data-module="sleep">+</button>
        </div>
      </div>`;
  },

  renderSleepModuleBody(deptId, moduleId, mod, dept) {
    const mode = this.sleepViewMode || 'day';
    const records = Store.getSortedRecords(deptId, moduleId);
    return `
      ${this.renderSleepToolbar(dept)}
      <div class="sleep-module-body" data-dept="${deptId}" data-module="${moduleId}">
        ${
          mode === 'day'
            ? this.renderSleepDayView(records, deptId, moduleId)
            : mode === 'week'
              ? this.renderSleepWeekView(records)
              : this.renderSleepMonthView(records)
        }
      </div>`;
  },

  renderSleepDayView(records, deptId, moduleId) {
    if (!records.length) {
      return '<div class="empty-state empty-inline">还没有记录</div>';
    }
    return `
      <div class="record-list accordion-records sleep-day-list">
        ${records.map((r) => this.renderSleepRecordItem(r, deptId, moduleId)).join('')}
      </div>`;
  },

  renderSleepRecordItem(record, deptId, moduleId, sortMode = null) {
    const actionAttrs = `data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}"`;
    const dateText = formatDate(record.date);
    const sleepType = this.normalizeSleepType(record.sleepType);
    const typeLabel = this.sleepTypeLabel(sleepType);
    const bedtime = record.bedtime || '—';
    const wakeup = record.wakeup || '—';
    const hours = this.formatSleepHoursDisplay(record.hours, record.bedtime, record.wakeup) || '—';
    const quality =
      record.quality !== undefined && record.quality !== '' ? `${record.quality}分` : '—';
    const note = record.note ? this.escapeHtml(String(record.note)) : '';
    const startLabel = sleepType === 'nap' ? '开始' : '入睡';
    const endLabel = sleepType === 'nap' ? '结束' : '起床';

    return `
      <div class="record-item record-item-sleep kind-${sleepType}">
        <div class="sleep-col sleep-col-type">
          <span class="sleep-type-badge kind-${sleepType}">${typeLabel}</span>
        </div>
        <div class="sleep-col sleep-col-date">${this.escapeHtml(dateText)}</div>
        <div class="sleep-col sleep-col-bed">
          <span class="k">${startLabel}</span><span class="v">${this.escapeHtml(String(bedtime))}</span>
        </div>
        <div class="sleep-col sleep-col-wake">
          <span class="k">${endLabel}</span><span class="v">${this.escapeHtml(String(wakeup))}</span>
        </div>
        <div class="sleep-col sleep-col-hours">
          <span class="k">时长</span><span class="v">${this.escapeHtml(hours)}</span>
        </div>
        <div class="sleep-col sleep-col-quality">
          <span class="k">质量</span><span class="v">${this.escapeHtml(quality)}</span>
        </div>
        <div class="record-item-actions">
          ${this.renderRecordMoreMenu(actionAttrs, { showOrder: false })}
        </div>
        ${note ? `<div class="sleep-col-note">${note}</div>` : ''}
      </div>`;
  },

  bindSleepViews(containerSelector) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;

    root.querySelectorAll('.sleep-view-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.dataset.sleepView;
        if (!mode || mode === this.sleepViewMode) return;
        this.sleepViewMode = mode;
        if (!this.sleepViewAnchor) this.sleepViewAnchor = todayStr();
        this.render();
      });
    });

    root.querySelectorAll('.btn-sleep-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.shiftSleepViewAnchor(-1);
        this.render();
      });
    });

    root.querySelectorAll('.btn-sleep-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.shiftSleepViewAnchor(1);
        this.render();
      });
    });

    root.querySelectorAll('.sleep-legend-btn[data-sleep-metric]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const metric = btn.dataset.sleepMetric;
        if (!metric || metric === this.sleepMonthMetric) return;
        if (metric !== 'total' && metric !== 'long' && metric !== 'nap') return;
        this.sleepMonthMetric = metric;
        this.render();
      });
    });
  },


  /* —— 类型选择 / 自动计分（L1403） —— */

  openSleepTypePicker(deptId, moduleId) {
    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '新增睡眠记录';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <p class="sleep-type-picker-hint">请选择本次记录类型</p>
      <div class="sleep-type-picker">
        <button type="button" class="sleep-type-card" data-sleep-type="nap">
          <strong>小憩</strong>
          <span>日间短暂补觉，不宜太长、太晚</span>
        </button>
        <button type="button" class="sleep-type-card" data-sleep-type="long">
          <strong>长睡眠</strong>
          <span>夜间主睡眠，按作息质量计分</span>
        </button>
      </div>`;
    form.onsubmit = null;
    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.add('hidden');
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    form.querySelectorAll('.sleep-type-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openModal(deptId, moduleId, null, { sleepType: btn.dataset.sleepType });
      });
    });

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  calcNapQualityScore(bedtime, wakeup) {
    const mins = this.calcSleepDurationMinutes(bedtime, wakeup);
    const bed = this.parseTimeToMinutes(bedtime);
    const wake = this.parseTimeToMinutes(wakeup);
    if (mins == null || bed == null || wake == null) return null;

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const mid = (bed + (bed + mins)) / 2 % (24 * 60);

    // 时长（满分 55）：理想 15–30 分钟
    let durationPts = 0;
    if (mins >= 15 && mins <= 30) durationPts = 55;
    else if (mins >= 10 && mins < 15) durationPts = 35 + ((mins - 10) / 5) * 20;
    else if (mins > 30 && mins <= 45) durationPts = 55 - ((mins - 30) / 15) * 18;
    else if (mins > 45 && mins <= 90) durationPts = 37 - ((mins - 45) / 45) * 22;
    else if (mins > 90 && mins <= 150) durationPts = Math.max(0, 15 - ((mins - 90) / 60) * 15);
    else if (mins < 10) durationPts = Math.max(0, (mins / 10) * 28);
    else durationPts = 0; // 超过 2.5h 对小憩来说过长

    // 时段（满分 45）：午后 13:00–15:30 最佳；靠近晚上睡觉重罚
    let timePts = 0;
    const idealStart = 13 * 60;
    const idealEnd = 15 * 60 + 30;
    if (mid >= idealStart && mid <= idealEnd) {
      timePts = 45;
    } else if (mid >= 12 * 60 && mid < idealStart) {
      timePts = 32 + ((mid - 12 * 60) / 60) * 13;
    } else if (mid > idealEnd && mid <= 17 * 60) {
      timePts = 45 - ((mid - idealEnd) / 90) * 20;
    } else if (mid >= 10 * 60 && mid < 12 * 60) {
      timePts = 18 + ((mid - 10 * 60) / 120) * 14;
    } else if (mid > 17 * 60 && mid <= 19 * 60) {
      // 傍晚，开始靠近夜间睡眠
      timePts = Math.max(4, 22 - ((mid - 17 * 60) / 120) * 18);
    } else if (mid > 19 * 60 && mid <= 21 * 60) {
      // 晚上，强烈不建议
      timePts = Math.max(0, 8 - ((mid - 19 * 60) / 120) * 8);
    } else if (mid > 21 * 60 || mid < 5 * 60) {
      // 落入夜间主睡眠窗口
      timePts = 0;
    } else if (mid >= 5 * 60 && mid < 10 * 60) {
      // 清晨小憩一般较差
      timePts = Math.max(4, 16 - ((10 * 60 - mid) / 300) * 8);
    } else {
      timePts = 8;
    }

    return Math.round(clamp(durationPts + timePts, 0, 100));
  },

  calcSleepQualityScore(bedtime, wakeup, sleepType = 'long') {
    if (this.normalizeSleepType(sleepType) === 'nap') {
      return this.calcNapQualityScore(bedtime, wakeup);
    }

    const hours = this.calcSleepHours(bedtime, wakeup);
    const bed = this.parseTimeToMinutes(bedtime);
    const wake = this.parseTimeToMinutes(wakeup);
    if (hours == null || bed == null || wake == null) return null;

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    // 时长：7–9h 满分 60
    let durationPts = 0;
    if (hours >= 7 && hours <= 9) durationPts = 60;
    else if (hours >= 6 && hours < 7) durationPts = 45 + (hours - 6) * 15;
    else if (hours > 9 && hours <= 10) durationPts = 60 - (hours - 9) * 15;
    else if (hours >= 5 && hours < 6) durationPts = 25 + (hours - 5) * 20;
    else if (hours > 10 && hours <= 11) durationPts = 45 - (hours - 10) * 20;
    else if (hours >= 4 && hours < 5) durationPts = 10 + (hours - 4) * 15;
    else if (hours < 4) durationPts = hours * 2.5;
    else durationPts = Math.max(0, 25 - (hours - 11) * 8);

    // 入睡：21:30–23:30 最佳（跨午夜用 +24h 表示凌晨入睡）
    const bedNorm = bed < 12 * 60 ? bed + 24 * 60 : bed;
    const idealBedStart = 21 * 60 + 30;
    const idealBedEnd = 23 * 60 + 30;
    let bedPts = 0;
    if (bedNorm >= idealBedStart && bedNorm <= idealBedEnd) bedPts = 25;
    else if (bedNorm < idealBedStart) bedPts = Math.max(8, 25 - (idealBedStart - bedNorm) / 40);
    else bedPts = Math.max(0, 25 - (bedNorm - idealBedEnd) / 12);

    // 起床：6:00–8:00 最佳
    let wakePts = 0;
    if (wake >= 6 * 60 && wake <= 8 * 60) wakePts = 15;
    else if (wake >= 5 * 60 && wake < 6 * 60) wakePts = 10 + (wake - 5 * 60) / 12;
    else if (wake > 8 * 60 && wake <= 9 * 60) wakePts = 15 - (wake - 8 * 60) / 12;
    else if (wake > 9 * 60 && wake <= 12 * 60) wakePts = Math.max(0, 10 - (wake - 9 * 60) / 18);
    else if (wake < 5 * 60) wakePts = Math.max(0, 8 - (5 * 60 - wake) / 30);
    else wakePts = Math.max(0, 4 - (wake - 12 * 60) / 60);

    return Math.round(clamp(durationPts + bedPts + wakePts, 0, 100));
  },

  bindSleepAutoCalc(form) {
    if (!form) return;
    const bedInput = form.querySelector('input[name="bedtime"]');
    const wakeInput = form.querySelector('input[name="wakeup"]');
    const hoursInput = form.querySelector('input[name="hours"]');
    const qualityInput = form.querySelector('input[name="quality"]');
    const typeInput = form.querySelector('input[name="sleepType"]');
    if (!bedInput || !wakeInput || !hoursInput || !qualityInput) return;

    const sync = () => {
      const sleepType = this.normalizeSleepType(typeInput?.value || 'long');
      const duration = this.formatSleepDuration(bedInput.value, wakeInput.value);
      const quality = this.calcSleepQualityScore(bedInput.value, wakeInput.value, sleepType);
      hoursInput.value = duration;
      qualityInput.value = quality == null ? '' : String(quality);
    };

    bedInput.addEventListener('change', sync);
    bedInput.addEventListener('input', sync);
    wakeInput.addEventListener('change', sync);
    wakeInput.addEventListener('input', sync);
    form.querySelectorAll('.sleep-kind-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.sleep-kind-btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        if (typeInput) typeInput.value = btn.dataset.sleepType;
        sync();
      });
    });
    sync();
  },

  renderSleepWeekView(records) {
    const anchor = this.getSleepViewAnchor();
    const days = this.getWeekDateList(anchor);
    const byDate = new Map(days.map((d) => [d, []]));
    records.forEach((r) => {
      const date = String(r.date || '').slice(0, 10);
      if (byDate.has(date)) byDate.get(date).push(r);
    });

    const { rangeStart, rangeEnd } = this.computeSleepWeekYRange(byDate);
    const rangeSpan = Math.max(60, rangeEnd - rangeStart);

    const W = 720;
    const H = 320;
    const pad = { top: 28, right: 16, bottom: 36, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const colW = plotW / 7;
    // 上 00:00 → 下 24:00
    const yAt = (clockMin) => pad.top + ((clockMin - rangeStart) / rangeSpan) * plotH;
    const xCenter = (i) => pad.left + colW * i + colW / 2;

    const stepH = rangeSpan > 14 * 60 ? 2 : 1;
    const hourMarks = [];
    for (let m = rangeStart; m <= rangeEnd; m += stepH * 60) hourMarks.push(m);
    if (hourMarks[hourMarks.length - 1] !== rangeEnd) hourMarks.push(rangeEnd);

    const gridLines = hourMarks
      .map((m) => {
        const y = yAt(m);
        return `<line class="sleep-chart-grid" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" />
          <text class="sleep-chart-axis" x="${pad.left - 18}" y="${y + 4}" text-anchor="end">${this.formatSleepAxisTime(m)}</text>`;
      })
      .join('');

    const noonMin = 12 * 60;
    const noonLine =
      noonMin >= rangeStart && noonMin <= rangeEnd
        ? `<line class="sleep-chart-noon" x1="${pad.left}" y1="${yAt(noonMin)}" x2="${W - pad.right}" y2="${yAt(noonMin)}" />`
        : '';

    const bars = days
      .map((date, i) => {
        const list = byDate.get(date) || [];
        if (!list.length) return '';
        const barW = Math.min(36, colW * 0.42);
        const x = pad.left + colW * i + (colW - barW) / 2;
        const cx = x + barW / 2;

        const items = list
          .map((r) => {
            const isNap = this.normalizeSleepType(r.sleepType) === 'nap';
            const segs = this.getSleepTimelineSegments(r).filter(
              (seg) => seg.end > rangeStart && seg.start < rangeEnd
            );
            if (!segs.length) return null;
            const bedLabel = this.escapeHtml(String(r.bedtime || ''));
            const wakeLabel = this.escapeHtml(String(r.wakeup || ''));
            const durationLabel =
              this.formatSleepDuration(r.bedtime, r.wakeup) ||
              this.formatSleepDurationFromMinutes(this.calcSleepDurationMinutes(r.bedtime, r.wakeup)) ||
              '—';
            const tip = this.escapeHtml(`时长 ${durationLabel}`);
            const rects = segs
              .map((seg) => {
                const y1 = yAt(Math.max(seg.start, rangeStart));
                const y2 = yAt(Math.min(seg.end, rangeEnd));
                const h = Math.max(4, y2 - y1);
                return `<rect class="sleep-chart-bar ${isNap ? 'is-nap' : 'is-long'}" x="${x}" y="${y1}" width="${barW}" height="${h}" rx="4" />`;
              })
              .join('');

            const bedSeg = segs.reduce((a, b) => (a.start <= b.start ? a : b));
            const wakeSeg = segs.reduce((a, b) => (a.end >= b.end ? a : b));
            const bedY = Math.max(pad.top + 10, yAt(Math.max(bedSeg.start, rangeStart)) - 3);
            const wakeY = Math.min(pad.top + plotH - 2, yAt(Math.min(wakeSeg.end, rangeEnd)) + 11);

            return {
              rects,
              tip,
              bedLabel,
              wakeLabel,
              bedY,
              wakeY,
              bedX: cx,
              wakeX: cx,
              bedAnchor: 'middle',
              wakeAnchor: 'middle',
            };
          })
          .filter(Boolean);

        // 默认居中；仅当「上面柱起床」与「下面柱入睡」文字太近时左右错开
        const ordered = items.slice().sort((a, b) => a.bedY - b.bedY || a.wakeY - b.wakeY);
        const overlapGap = 12;
        const dx = 16;
        for (let k = 0; k < ordered.length - 1; k++) {
          const upper = ordered[k];
          const lower = ordered[k + 1];
          if (Math.abs(lower.bedY - upper.wakeY) < overlapGap) {
            upper.wakeX = cx - dx;
            upper.wakeAnchor = 'end';
            lower.bedX = cx + dx;
            lower.bedAnchor = 'start';
          }
        }

        return items
          .map((it) => {
            const labels = `
              <text class="sleep-chart-bar-time" x="${it.bedX}" y="${it.bedY}" text-anchor="${it.bedAnchor}">${it.bedLabel}</text>
              <text class="sleep-chart-bar-time" x="${it.wakeX}" y="${it.wakeY}" text-anchor="${it.wakeAnchor}">${it.wakeLabel}</text>`;
            return `<g class="sleep-chart-bar-hit"><title>${it.tip}</title>${it.rects}${labels}</g>`;
          })
          .join('');
      })
      .join('');

    const xLabels = days
      .map((date, i) => {
        const md = `${date.slice(5, 7)}-${date.slice(8, 10)}`;
        const weekday = WEEKDAY_LABELS[i];
        return `<text class="sleep-chart-axis" x="${xCenter(i)}" y="${H - 10}" text-anchor="middle">${md} ${weekday}</text>`;
      })
      .join('');

    const hasData = days.some((d) => (byDate.get(d) || []).length);
    const titleX = 16;
    const titleY = pad.top + plotH / 2;

    return `
      <div class="sleep-chart-panel">
        <div class="sleep-chart-main">
          <div class="sleep-chart-wrap">
            <svg class="sleep-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="每周睡眠时间线">
              ${gridLines}
              ${noonLine}
              ${bars}
              ${xLabels}
              <text class="sleep-chart-axis-title" x="${titleX}" y="${titleY}" text-anchor="middle" transform="rotate(-90 ${titleX} ${titleY})">时间线</text>
            </svg>
          </div>
          <div class="sleep-chart-legend sleep-chart-legend-side">
            <span class="sleep-legend-item"><i class="sleep-legend-swatch is-long"></i>长睡眠</span>
            <span class="sleep-legend-item"><i class="sleep-legend-swatch is-nap"></i>小憩</span>
          </div>
        </div>
        ${hasData ? '' : '<p class="sleep-chart-empty">本周暂无睡眠记录</p>'}
      </div>`;
  },

  formatSleepDurationFromMinutes(mins) {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '';
    const total = Math.round(mins);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h} h ${m} min`;
  },

  formatSleepDurationCompact(mins) {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '';
    const total = Math.round(mins);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  },

  /** 入睡时刻 → 格子内纵向位置（偏下；21:00→03:00 窗口放大起伏） */
  sleepBedtimeToYPercent(bedMinutes) {
    if (bedMinutes == null || !Number.isFinite(bedMinutes)) return 55;
    const DAY = 24 * 60;
    const fromNoon = ((bedMinutes - 12 * 60) % DAY + DAY) % DAY;
    const winLo = 9 * 60; // 21:00
    const winHi = 15 * 60; // 03:00
    let t = (fromNoon - winLo) / (winHi - winLo);
    t = Math.max(0, Math.min(1, t));
    const yTop = 38;
    const yBot = 72;
    return yTop + t * (yBot - yTop);
  },

  /** 睡眠总时长 → 格子半透明底色（越长越深） */
  sleepDurationToCellFill(mins) {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '';
    const lo = 3 * 60;
    const hi = 10 * 60;
    const t = Math.max(0, Math.min(1, (mins - lo) / (hi - lo)));
    const alpha = 0.1 + t * 0.38;
    return `rgba(99, 102, 241, ${alpha.toFixed(3)})`;
  },

  renderCalendarWeekSleepOverlay(weekCells, sleepByDate) {
    if (!sleepByDate) return '';
    const pts = [];
    weekCells.forEach((cell, i) => {
      const info = sleepByDate.get(cell.dateStr);
      if (!info || info.bedMinutes == null) return;
      pts.push({
        x: ((i + 0.5) / 7) * 100,
        y: this.sleepBedtimeToYPercent(info.bedMinutes),
      });
    });
    if (pts.length < 2) return '';

    return `
      <svg class="year-cal-sleep-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="year-cal-sleep-polyline" fill="none" points="${pts
          .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
          .join(' ')}" />
      </svg>`;
  },

  renderSleepMonthView(records) {
    const anchor = this.getSleepViewAnchor();
    const metric = this.sleepMonthMetric === 'long' || this.sleepMonthMetric === 'nap'
      ? this.sleepMonthMetric
      : 'total';
    const m = anchor.match(/^(\d{4})-(\d{2})/);
    const year = m ? Number(m[1]) : new Date().getFullYear();
    const month = m ? Number(m[2]) - 1 : new Date().getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const byDate = {};
    records.forEach((r) => {
      const date = String(r.date || '').slice(0, 10);
      if (!date.startsWith(monthPrefix)) return;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r);
    });

    const dayStats = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const list = byDate[date] || [];
      let longMins = 0;
      let napMins = 0;
      list.forEach((r) => {
        const mins = this.calcSleepDurationMinutes(r.bedtime, r.wakeup) || 0;
        if (this.normalizeSleepType(r.sleepType) === 'nap') napMins += mins;
        else longMins += mins;
      });
      const totalMins = longMins + napMins;
      dayStats.push({
        d,
        date,
        longMins,
        napMins,
        totalMins,
        longHours: longMins / 60,
        napHours: napMins / 60,
        totalHours: totalMins / 60,
        count: list.length,
      });
    }

    const metricHours = (s) =>
      metric === 'long' ? s.longHours : metric === 'nap' ? s.napHours : s.totalHours;
    const metricMins = (s) =>
      metric === 'long' ? s.longMins : metric === 'nap' ? s.napMins : s.totalMins;

    // 保持 W=720，不收窄模块；高度与周视图对齐
    const W = 720;
    const H = 320;
    const pad = { top: 28, right: 16, bottom: 32, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const maxHours = Math.max(10, ...dayStats.map(metricHours), 1);
    const barW = Math.max(5, (plotW / daysInMonth) * 0.58);
    const xAt = (i) => pad.left + (plotW / daysInMonth) * (i + 0.5);
    const yHours = (h) => pad.top + plotH * (1 - h / maxHours);
    const baseline = pad.top + plotH;

    const hourGrid = [0, 0.25, 0.5, 0.75, 1]
      .map((t) => {
        const h = maxHours * t;
        const y = yHours(h);
        return `<line class="sleep-chart-grid" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" />
          <text class="sleep-chart-axis" x="${pad.left - 18}" y="${y + 4}" text-anchor="end">${h % 1 === 0 ? h : h.toFixed(1)}h</text>`;
      })
      .join('');

    const bars = dayStats
      .map((s, i) => {
        const hours = metricHours(s);
        if (!hours) return '';
        const x = xAt(i) - barW / 2;
        const parts = [];
        let topY = baseline;

        if (metric === 'total') {
          let yCursor = baseline;
          // 底部长睡眠，上方小憩
          if (s.longHours > 0) {
            const y = yHours(s.longHours);
            const height = Math.max(2, yCursor - y);
            parts.push(
              `<rect class="sleep-chart-bar is-long" x="${x}" y="${y}" width="${barW}" height="${height}" rx="${s.napHours > 0 ? 0 : 3}" />`
            );
            yCursor = y;
          }
          if (s.napHours > 0) {
            const yTop = yHours(s.totalHours);
            const height = Math.max(2, yCursor - yTop);
            parts.push(
              `<rect class="sleep-chart-bar is-nap" x="${x}" y="${yTop}" width="${barW}" height="${height}" rx="3" />`
            );
            yCursor = yTop;
          }
          topY = yCursor;
        } else {
          const barClass = metric === 'nap' ? 'is-nap' : 'is-long';
          const y = yHours(hours);
          const height = Math.max(2, baseline - y);
          parts.push(
            `<rect class="sleep-chart-bar ${barClass}" x="${x}" y="${y}" width="${barW}" height="${height}" rx="3" />`
          );
          topY = y;
        }

        const label = this.formatSleepDurationFromMinutes(metricMins(s));
        const labelY = Math.max(pad.top + 10, topY - 4);
        parts.push(
          `<text class="sleep-chart-bar-dur" x="${xAt(i)}" y="${labelY}" text-anchor="middle">${this.escapeHtml(label)}</text>`
        );
        return parts.join('');
      })
      .join('');

    const xLabels = dayStats
      .map((s) => {
        return `<text class="sleep-chart-axis sleep-chart-axis-day" x="${xAt(s.d - 1)}" y="${H - 10}" text-anchor="middle">${s.d}</text>`;
      })
      .join('');

    const legendBtn = (key, swatchClass, label) => `
      <button type="button" class="sleep-legend-btn ${metric === key ? 'is-active' : ''}" data-sleep-metric="${key}" title="${label}">
        <i class="sleep-legend-swatch ${swatchClass}"></i>${label}
      </button>`;

    const titleX = 16;
    const titleY = pad.top + plotH / 2;

    return `
      <div class="sleep-chart-panel">
        <div class="sleep-chart-main">
          <div class="sleep-chart-wrap">
            <svg class="sleep-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="每月睡眠趋势">
              ${hourGrid}
              ${bars}
              ${xLabels}
              <text class="sleep-chart-axis-title" x="${titleX}" y="${titleY}" text-anchor="middle" transform="rotate(-90 ${titleX} ${titleY})">时长</text>
            </svg>
          </div>
          <div class="sleep-chart-legend sleep-chart-legend-side sleep-chart-legend-toggle" role="tablist">
            ${legendBtn('long', 'is-long', '长睡眠')}
            ${legendBtn('nap', 'is-nap', '小憩')}
            ${legendBtn('total', 'is-total', '总时长')}
          </div>
        </div>
        ${dayStats.some((s) => s.count) ? '' : '<p class="sleep-chart-empty">本月暂无睡眠记录</p>'}
      </div>`;
  },

  /* —— 生活 · 学习时长 —— */

  calcStudyDurationMins(record) {
    const h = Number(record?.hours);
    const m = Number(record?.minutes);
    const hours = Number.isFinite(h) ? Math.max(0, h) : 0;
    const mins = Number.isFinite(m) ? Math.max(0, Math.min(59, Math.round(m))) : 0;
    return Math.round(hours * 60 + mins);
  },

  formatStudyDurationLabel(mins) {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '—';
    const total = Math.round(mins);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m} min`;
    if (!m) return `${h} h`;
    return `${h} h ${m} min`;
  },

  getStudyViewAnchor() {
    if (this.studyViewAnchor && /^\d{4}-\d{2}-\d{2}$/.test(this.studyViewAnchor)) {
      return this.studyViewAnchor;
    }
    return todayStr();
  },

  shiftStudyViewAnchor(delta) {
    const mode = this.studyViewMode || 'day';
    const anchor = this.getStudyViewAnchor();
    const d = new Date(`${anchor}T00:00:00`);
    if (mode === 'week') d.setDate(d.getDate() + delta * 7);
    else if (mode === 'month') d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta);
    this.studyViewAnchor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  renderStudyToolbar(dept) {
    const mode = this.studyViewMode || 'day';
    const anchor = this.getStudyViewAnchor();
    const rangeCenter =
      mode === 'week'
        ? `<div class="sleep-toolbar-range">
            <button type="button" class="btn btn-ghost btn-sm btn-study-prev" title="上一周">‹</button>
            <span class="sleep-chart-range">本周 ${this.formatSleepRangeLabel('week', anchor)}</span>
            <button type="button" class="btn btn-ghost btn-sm btn-study-next" title="下一周">›</button>
          </div>`
        : mode === 'month'
          ? `<div class="sleep-toolbar-range">
              <button type="button" class="btn btn-ghost btn-sm btn-study-prev" title="上一月">‹</button>
              <span class="sleep-chart-range">${this.formatSleepRangeLabel('month', anchor)}</span>
              <button type="button" class="btn btn-ghost btn-sm btn-study-next" title="下一月">›</button>
            </div>`
          : `<div class="sleep-toolbar-range is-empty" aria-hidden="true"></div>`;
    return `
      <div class="accordion-toolbar accordion-toolbar-icons sleep-toolbar study-toolbar">
        <div class="sleep-view-tabs" role="tablist">
          <button type="button" class="sleep-view-tab ${mode === 'day' ? 'is-active' : ''}" data-study-view="day">日</button>
          <button type="button" class="sleep-view-tab ${mode === 'week' ? 'is-active' : ''}" data-study-view="week">周</button>
          <button type="button" class="sleep-view-tab ${mode === 'month' ? 'is-active' : ''}" data-study-view="month">月</button>
        </div>
        ${rangeCenter}
        <div class="toolbar-actions">
          <button type="button" class="icon-btn btn-add-record" title="新增记录"
            data-dept="${dept.id}" data-module="study">+</button>
        </div>
      </div>`;
  },

  renderStudyModuleBody(deptId, moduleId, mod, dept) {
    const mode = this.studyViewMode || 'day';
    const records = Store.getSortedRecords(deptId, moduleId);
    return `
      ${this.renderStudyToolbar(dept)}
      <div class="study-module-body" data-dept="${deptId}" data-module="${moduleId}">
        ${
          mode === 'day'
            ? this.renderStudyDayView(records, deptId, moduleId)
            : mode === 'week'
              ? this.renderStudyWeekView(records)
              : this.renderStudyMonthView(records)
        }
      </div>`;
  },

  renderStudyDayView(records, deptId, moduleId) {
    if (!records.length) {
      return '<div class="empty-state empty-inline">还没有记录</div>';
    }
    return `
      <div class="record-list accordion-records study-day-list">
        ${records.map((r) => this.renderStudyRecordItem(r, deptId, moduleId)).join('')}
      </div>`;
  },

  renderStudyRecordItem(record, deptId, moduleId) {
    const actionAttrs = `data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}"`;
    const dateText = formatDate(record.date);
    const mins = this.calcStudyDurationMins(record);
    const dur = this.formatStudyDurationLabel(mins);
    const note = record.note ? this.escapeHtml(String(record.note)) : '';
    return `
      <div class="record-item record-item-study">
        <div class="study-col study-col-date">${this.escapeHtml(dateText)}</div>
        <div class="study-col study-col-dur">
          <span class="k">时长</span><span class="v">${this.escapeHtml(dur)}</span>
        </div>
        <div class="study-col study-col-note">${note || '<span class="muted">—</span>'}</div>
        <div class="record-item-actions">
          ${this.renderRecordMoreMenu(actionAttrs, { showOrder: false })}
        </div>
      </div>`;
  },

  renderStudyDurationBars(dayStats, opts = {}) {
    const W = 720;
    const H = 280;
    const pad = { top: 28, right: 16, bottom: 36, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const n = Math.max(1, dayStats.length);
    const maxHours = Math.max(4, ...dayStats.map((s) => s.hours), 0.5);
    const barW = Math.max(5, (plotW / n) * (opts.barRatio || 0.55));
    const xAt = (i) => pad.left + (plotW / n) * (i + 0.5);
    const yHours = (h) => pad.top + plotH * (1 - h / maxHours);
    const baseline = pad.top + plotH;

    const hourGrid = [0, 0.25, 0.5, 0.75, 1]
      .map((t) => {
        const h = maxHours * t;
        const y = yHours(h);
        const label = h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
        return `<line class="sleep-chart-grid" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" />
          <text class="sleep-chart-axis" x="${pad.left - 18}" y="${y + 4}" text-anchor="end">${label}</text>`;
      })
      .join('');

    const bars = dayStats
      .map((s, i) => {
        if (!s.mins) return '';
        const height = Math.max(3, baseline - yHours(s.hours));
        const x = xAt(i) - barW / 2;
        const y = baseline - height;
        const label = this.formatSleepDurationCompact(s.mins);
        const tip = this.escapeHtml(this.formatStudyDurationLabel(s.mins));
        const labelY = Math.max(pad.top + 10, y - 4);
        return `<g class="sleep-chart-bar-hit"><title>${tip}</title>
          <rect class="sleep-chart-bar is-study" x="${x}" y="${y}" width="${barW}" height="${height}" rx="3" />
          <text class="sleep-chart-bar-dur is-study" x="${xAt(i)}" y="${labelY}" text-anchor="middle">${this.escapeHtml(label)}</text>
        </g>`;
      })
      .join('');

    const xLabels = dayStats
      .map((s, i) => {
        const text = opts.xLabel ? opts.xLabel(s, i) : String(s.d);
        return `<text class="sleep-chart-axis ${opts.xClass || ''}" x="${xAt(i)}" y="${H - 10}" text-anchor="middle">${text}</text>`;
      })
      .join('');

    const titleX = 16;
    const titleY = pad.top + plotH / 2;
    const hasData = dayStats.some((s) => s.mins > 0);

    return `
      <div class="sleep-chart-panel study-chart-panel">
        <div class="sleep-chart-main">
          <div class="sleep-chart-wrap">
            <svg class="sleep-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.escapeHtml(opts.aria || '学习时长')}">
              ${hourGrid}
              ${bars}
              ${xLabels}
              <text class="sleep-chart-axis-title" x="${titleX}" y="${titleY}" text-anchor="middle" transform="rotate(-90 ${titleX} ${titleY})">时长</text>
            </svg>
          </div>
          <div class="sleep-chart-legend sleep-chart-legend-side">
            <span class="sleep-legend-item"><i class="sleep-legend-swatch is-study"></i>学习时长</span>
          </div>
        </div>
        ${hasData ? '' : `<p class="sleep-chart-empty">${this.escapeHtml(opts.empty || '暂无学习记录')}</p>`}
      </div>`;
  },

  renderStudyWeekView(records) {
    const anchor = this.getStudyViewAnchor();
    const days = this.getWeekDateList(anchor);
    const byDate = new Map(days.map((d) => [d, 0]));
    records.forEach((r) => {
      const date = String(r.date || '').slice(0, 10);
      if (!byDate.has(date)) return;
      byDate.set(date, byDate.get(date) + this.calcStudyDurationMins(r));
    });
    const dayStats = days.map((date, i) => {
      const mins = byDate.get(date) || 0;
      return {
        d: i + 1,
        date,
        mins,
        hours: mins / 60,
      };
    });
    return this.renderStudyDurationBars(dayStats, {
      barRatio: 0.42,
      aria: '每周学习时长',
      empty: '本周暂无学习记录',
      xLabel: (s, i) => {
        const md = `${s.date.slice(5, 7)}-${s.date.slice(8, 10)}`;
        return `${md} ${WEEKDAY_LABELS[i]}`;
      },
    });
  },

  renderStudyMonthView(records) {
    const anchor = this.getStudyViewAnchor();
    const m = anchor.match(/^(\d{4})-(\d{2})/);
    const year = m ? Number(m[1]) : new Date().getFullYear();
    const month = m ? Number(m[2]) - 1 : new Date().getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const byDate = {};
    records.forEach((r) => {
      const date = String(r.date || '').slice(0, 10);
      if (!date.startsWith(monthPrefix)) return;
      byDate[date] = (byDate[date] || 0) + this.calcStudyDurationMins(r);
    });

    const dayStats = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const mins = byDate[date] || 0;
      dayStats.push({ d, date, mins, hours: mins / 60 });
    }

    return this.renderStudyDurationBars(dayStats, {
      barRatio: 0.58,
      aria: '每月学习时长',
      empty: '本月暂无学习记录',
      xClass: 'sleep-chart-axis-day',
      xLabel: (s) => String(s.d),
    });
  },

  bindStudyViews(containerSelector) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;

    root.querySelectorAll('[data-study-view]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.dataset.studyView;
        if (!mode || mode === this.studyViewMode) return;
        this.studyViewMode = mode;
        if (!this.studyViewAnchor) this.studyViewAnchor = todayStr();
        this.render();
      });
    });

    root.querySelectorAll('.btn-study-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.shiftStudyViewAnchor(-1);
        this.render();
      });
    });

    root.querySelectorAll('.btn-study-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.shiftStudyViewAnchor(1);
        this.render();
      });
    });
  },

  renderHabitChecklist(deptId, moduleId, mod) {
    const checklist = mod.habitChecklist || [];
    const record = Store.getTodayHabitRecord(deptId, moduleId);
    const { done, total } = Store.getHabitProgress(record, checklist);
    const allDone = total > 0 && done === total;

    return `
      <div class="habit-checklist" data-dept="${deptId}" data-module="${moduleId}">
        <div class="habit-checklist-head">
          <span class="habit-checklist-date">${formatDate(todayStr())}</span>
          <span class="habit-checklist-progress ${allDone ? 'is-done' : ''}">${done}/${total}${allDone ? ' · 已完成' : ''}</span>
        </div>
        <ul class="plan-list habit-list">
          ${checklist
            .map((label) => {
              const checked = Boolean(record?.checks?.[label]);
              return `
            <li class="plan-item ${checked ? 'is-done' : ''}" data-habit-label="${this.escapeHtml(label)}">
              <button type="button" class="plan-check habit-check ${checked ? 'is-done' : ''}" title="${checked ? '标为未完成' : '标为完成'}">${checked ? '✓' : ''}</button>
              <span class="plan-text">${this.escapeHtml(label)}</span>
            </li>`;
            })
            .join('')}
        </ul>
      </div>`;
  },

  renderWeekdayCheckin(deptId, moduleId, mod) {
    const weekdays = WEEKDAY_LABELS;
    const weekKey = Store.weekKey();
    const record = Store.getWeekCheckinRecord(deptId, moduleId, weekKey);
    const { done, total } = Store.getWeekdayProgress(record, weekdays);
    const todayLabel = todayWeekdayLabel();
    const todayDone = Boolean(record?.days?.[todayLabel]);

    return `
      <div class="weekday-checkin" data-dept="${deptId}" data-module="${moduleId}">
        <div class="habit-checklist-head">
          <span class="habit-checklist-date">本周 ${Store.weekRangeLabel(weekKey)}</span>
          <span class="habit-checklist-progress ${done === total ? 'is-done' : ''}">${done}/${total}${todayDone ? ' · 今日已打卡' : ''}</span>
        </div>
        <div class="weekday-grid">
          ${weekdays
            .map((label) => {
              const checked = Boolean(record?.days?.[label]);
              const isToday = label === todayLabel;
              return `
            <button type="button" class="weekday-btn ${checked ? 'is-done' : ''} ${isToday ? 'is-today' : ''}"
              data-weekday="${label}" title="${checked ? '取消打卡' : '打卡'}">
              <span class="weekday-label">${label}</span>
              <span class="weekday-mark">${checked ? '✓' : ''}</span>
            </button>`;
            })
            .join('')}
        </div>
      </div>`;
  },

  renderHabitBody(deptId, moduleId, mod) {
    if (mod.recordView === 'weekdayCheckin') return this.renderWeekdayCheckin(deptId, moduleId, mod);
    if (mod.recordView === 'habitChecklist') return this.renderHabitChecklist(deptId, moduleId, mod);
    return '';
  },

  habitAccordionMeta(deptId, moduleId, mod) {
    if (mod.recordView === 'habitChecklist') {
      const prog = Store.getHabitProgress(Store.getTodayHabitRecord(deptId, moduleId), mod.habitChecklist || []);
      const done = prog.total > 0 && prog.done === prog.total;
      return { meta: `今日 ${prog.done}/${prog.total}${done ? ' · 已完成' : ''}`, today: done };
    }
    if (mod.recordView === 'weekdayCheckin') {
      const prog = Store.getWeekdayProgress(Store.getWeekCheckinRecord(deptId, moduleId), WEEKDAY_LABELS);
      const today = Store.isWeekdayCheckedToday(deptId, moduleId);
      return { meta: `本周 ${prog.done}/${prog.total}${today ? ' · 今日已打卡' : ''}`, today };
    }
    return null;
  },

  renderDeptAccordion(dept) {
    const expandedSet = this.getDeptExpanded(dept.id);

    return `
      <div class="accordion-list">
        ${dept.modules
          .map((m) => {
            const mod = getModule(dept.id, m.id);
            const habitMeta = this.habitAccordionMeta(dept.id, m.id, mod);
            const isHabit = Boolean(habitMeta);
            const records = isHabit ? [] : Store.getSortedRecords(dept.id, m.id);
            const sortMode = Store.getModuleSort(dept.id, m.id).mode;
            const today = isHabit
              ? habitMeta.today
              : records.some((r) => r.date?.slice(0, 10) === todayStr());
            const meta = isHabit
              ? habitMeta.meta
              : `${records.length} 条${today ? ' · 今日已记' : ''}`;
            const expanded = expandedSet.has(m.id);
            const editBtn =
              dept.id === 'living'
                ? `<button type="button" class="btn-edit-module btn-edit-module-living" title="编辑模块"
                    data-dept="${dept.id}" data-module="${m.id}">编辑</button>`
                : `<button type="button" class="icon-btn btn-edit-module" title="编辑模块"
                    data-dept="${dept.id}" data-module="${m.id}">✎</button>`;
            const collapseBtn =
              dept.id === 'living'
                ? `<button type="button" class="chat-collapse-btn accordion-collapse-btn" title="${expanded ? '收起' : '展开'}" aria-expanded="${expanded ? 'true' : 'false'}" data-dept="${dept.id}" data-module="${m.id}">
                    <span class="chat-collapse-label">${expanded ? '收起' : '展开'}</span>
                    <span class="chat-collapse-chevron" aria-hidden="true">${expanded ? '‹' : '›'}</span>
                  </button>`
                : '';
            const headerInner =
              dept.id === 'living'
                ? `<span class="accordion-icon">${mod.icon}</span>
                    <span class="accordion-living-text">
                      <span class="accordion-title">${this.escapeHtml(mod.name)}</span>
                      <span class="accordion-desc">${this.escapeHtml(mod.desc)}</span>
                    </span>
                    <span class="accordion-meta">${meta}</span>`
                : `<span class="accordion-icon">${mod.icon}</span>
                    <span class="accordion-title">${this.escapeHtml(mod.name)}</span>
                    <span class="accordion-desc">${this.escapeHtml(mod.desc)}</span>
                    <span class="accordion-meta">${meta}</span>
                    <span class="accordion-chevron">›</span>`;
            return `
              <div class="accordion-item ${expanded ? 'expanded' : ''}" data-dept="${dept.id}" data-module="${m.id}">
                <div class="accordion-header-row${dept.id === 'living' ? ' accordion-header-row-living' : ''}">
                  <button type="button" class="accordion-header${dept.id === 'living' ? ' accordion-header-living' : ''}" style="--accent:${dept.color}">
                    ${headerInner}
                  </button>
                  ${collapseBtn}
                  ${editBtn}
                </div>
                <div class="accordion-body">
                  ${
                    isHabit
                      ? this.renderHabitBody(dept.id, m.id, mod)
                      : m.id === 'sleep'
                        ? this.renderSleepModuleBody(dept.id, m.id, mod, dept)
                        : m.id === 'study'
                          ? this.renderStudyModuleBody(dept.id, m.id, mod, dept)
                          : `${this.renderModuleToolbar(mod, dept)}
                  <div class="record-list accordion-records">
                    ${
                      records.length
                        ? records
                            .map((r) => this.renderRecordItem(mod, r, dept.id, m.id, sortMode))
                            .join('')
                        : '<div class="empty-state empty-inline">还没有记录</div>'
                    }
                  </div>`
                  }
                </div>
              </div>`;
          })
          .join('')}
      </div>
    `;
  },

  updateInterviewWidget(show) {
    const wrap = document.getElementById('nextInterviewWidgetWrap');
    const widget = document.getElementById('nextInterviewWidget');
    const titleEl = document.getElementById('nextInterviewTitle');
    const countdownEl = document.getElementById('nextInterviewCountdown');
    const metaEl = document.getElementById('nextInterviewMeta');
    if (!wrap || !widget) return;

    if (!show) {
      wrap.classList.add('hidden');
      return;
    }

    const interviews = Store.getRecords('core', 'interview');
    const next = interviews
      .map((record) => ({ record, ts: Store.parseRecordDateTime(record) }))
      .filter((item) => item.ts > Date.now())
      .sort((a, b) => a.ts - b.ts)[0];

    wrap.classList.remove('hidden');

    if (!next) {
      titleEl.textContent = '暂无待面试';
      countdownEl.textContent = '—';
      countdownEl.dataset.targetTs = '';
      metaEl.textContent = '新增未来面试后自动倒计时';
      widget.classList.remove('urgent');
      countdownEl.classList.remove('urgent');
      this.applyTopbarWidgetStyles();
      return;
    }

    const { record, ts } = next;
    titleEl.textContent = [record.company || '未填公司', record.role].filter(Boolean).join(' · ');
    metaEl.textContent = [this.formatDateTimeDisplay(record.date, record), record.round, record.result]
      .filter(Boolean)
      .join(' · ');
    countdownEl.dataset.targetTs = String(ts);
    this.applyTopbarWidgetStyles();
  },

  formatCountdown(diffMs) {
    if (diffMs <= 0) return '已开始';
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}天 ${String(hours).padStart(2, '0')}时 ${String(minutes).padStart(2, '0')}分 ${String(seconds).padStart(2, '0')}秒`;
    }
    return `${String(hours).padStart(2, '0')}时 ${String(minutes).padStart(2, '0')}分 ${String(seconds).padStart(2, '0')}秒`;
  },

  setupInterviewCountdown() {
    const countdownEl = document.getElementById('nextInterviewCountdown');
    const widget = document.getElementById('nextInterviewWidget');
    if (!countdownEl) return;

    const targetTs = Number(countdownEl.dataset.targetTs);
    if (!Number.isFinite(targetTs) || !targetTs) return;

    const update = () => {
      const diff = targetTs - Date.now();
      countdownEl.textContent = this.formatCountdown(diff);
      const isUrgent = diff > 0 && diff <= 86400000;
      widget?.classList.toggle('urgent', isUrgent);
      countdownEl.classList.toggle('urgent', isUrgent);
      this.applyWidgetGradient(widget, 'interview', isUrgent);
    };

    update();
    this.interviewCountdownTimer = setInterval(update, 1000);
  },

  renderModuleTabs(dept, activeModuleId) {
    return `
      <nav class="module-tabs" aria-label="${this.escapeHtml(dept.name)}模块">
        ${dept.modules
          .map((m) => {
            const mod = getModule(dept.id, m.id);
            const active = m.id === activeModuleId;
            const count = Store.getRecords(dept.id, m.id).length;
            return `
              <button type="button" class="module-tab ${active ? 'active' : ''}"
                data-dept="${dept.id}" data-module="${m.id}"
                style="--tab-accent:${dept.color}">
                ${this.renderModuleIcon(mod, 'module-tab-icon')}
                <span class="module-tab-label">${this.escapeHtml(mod.name)}</span>
                ${count ? `<span class="module-tab-count">${count}</span>` : ''}
              </button>`;
          })
          .join('')}
      </nav>`;
  },

  normalizeHandwriteRecord(record) {
    return {
      ...record,
      title: record.title || record.problem || '未命名题目',
      method: record.method || '未分类',
      difficulty: record.difficulty || '中等',
      dataStructure: record.dataStructure || '',
      lcNumber: record.lcNumber ?? '',
      hot100: Boolean(record.hot100),
      codetopFreq: record.codetopFreq ?? '',
      done: Boolean(record.done),
    };
  },

  isHandwriteEditing(deptId, moduleId) {
    return (
      this.handwriteEditing?.deptId === deptId &&
      this.handwriteEditing?.moduleId === moduleId
    );
  },

  initHandwriteDraft(deptId, moduleId) {
    const sort = Store.getHandwriteSort(deptId, moduleId);
    const records = Store.getRawRecords(deptId, moduleId);
    let methodOrder;
    let questionOrder;
    if (sort.mode === 'custom' && sort.methodOrder.length) {
      methodOrder = [...sort.methodOrder];
      questionOrder = { ...sort.questionOrder };
    } else {
      const layout = Store._buildDefaultHandwriteLayout(records);
      methodOrder = layout.methodOrder;
      questionOrder = { ...layout.questionOrder };
    }
    this.handwriteDraft = { deptId, moduleId, methodOrder, questionOrder, dirty: false };
  },

  syncHandwriteDraftWithRecords(deptId, moduleId) {
    if (!this.handwriteDraft || this.handwriteDraft.deptId !== deptId || this.handwriteDraft.moduleId !== moduleId) {
      return;
    }
    const records = Store.getRawRecords(deptId, moduleId);
    const groups = new Map();
    records.forEach((record) => {
      const method = Store._handwriteMethodKey(record);
      if (!groups.has(method)) groups.set(method, []);
      groups.get(method).push(record.id);
    });

    let methodOrder = this.handwriteDraft.methodOrder.filter((method) => groups.has(method));
    [...groups.keys()].forEach((method) => {
      if (!methodOrder.includes(method)) methodOrder.push(method);
    });

    const questionOrder = {};
    groups.forEach((allIds, method) => {
      const existing = (this.handwriteDraft.questionOrder[method] || []).filter((id) => allIds.includes(id));
      allIds.forEach((id) => {
        if (!existing.includes(id)) existing.push(id);
      });
      questionOrder[method] = existing;
    });

    this.handwriteDraft.methodOrder = methodOrder;
    this.handwriteDraft.questionOrder = questionOrder;
    this.handwriteDraft.dirty = true;
  },

  moveHandwriteDraftMethod(method, delta) {
    if (!this.handwriteDraft) return;
    const methodOrder = [...this.handwriteDraft.methodOrder];
    const idx = methodOrder.indexOf(method);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= methodOrder.length) return;
    [methodOrder[idx], methodOrder[next]] = [methodOrder[next], methodOrder[idx]];
    this.handwriteDraft.methodOrder = methodOrder;
    this.handwriteDraft.dirty = true;
  },

  moveHandwriteDraftRecord(method, recordId, delta) {
    if (!this.handwriteDraft) return;
    const questionOrder = { ...this.handwriteDraft.questionOrder };
    const order = [...(questionOrder[method] || [])];
    const idx = order.indexOf(recordId);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    questionOrder[method] = order;
    this.handwriteDraft.questionOrder = questionOrder;
    this.handwriteDraft.dirty = true;
  },

  async saveHandwriteDraft(deptId, moduleId) {
    if (!this.handwriteDraft || this.handwriteDraft.deptId !== deptId || this.handwriteDraft.moduleId !== moduleId) {
      return false;
    }
    Store.setHandwriteSort(deptId, moduleId, {
      mode: 'custom',
      methodOrder: [...this.handwriteDraft.methodOrder],
      questionOrder: { ...this.handwriteDraft.questionOrder },
    });
    try {
      await Store.flushSave();
    } catch {
      /* localStorage 已写入，服务端失败时仍提示用户 */
    }
    this.handwriteDraft.dirty = false;
    this.handwriteDraft = null;
    this.handwriteEditing = null;
    return true;
  },

  getHandwriteDisplaySort(deptId, moduleId, records) {
    const sort = Store.getHandwriteSort(deptId, moduleId);
    if (this.isHandwriteEditing(deptId, moduleId) && this.handwriteDraft) {
      return {
        mode: 'custom',
        methodOrder: this.handwriteDraft.methodOrder,
        questionOrder: this.handwriteDraft.questionOrder,
      };
    }
    if (sort.mode === 'custom' && sort.methodOrder.length) {
      return sort;
    }
    const layout = Store._buildDefaultHandwriteLayout(records);
    return {
      mode: 'default',
      methodOrder: layout.methodOrder,
      questionOrder: layout.questionOrder,
    };
  },

  buildHandwriteGroups(records, sort) {
    const groups = new Map();
    records.forEach((record) => {
      const key = record.method || '未分类';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });

    const sortRecordsDefault = (list) =>
      [...list].sort((a, b) => Store._defaultHandwriteRecordSort(a, b));

    if (sort.mode !== 'custom') {
      groups.forEach((list, method) => {
        groups.set(method, sortRecordsDefault(list));
      });
      return Store._defaultHandwriteMethodSort([...groups.keys()])
        .filter((method) => groups.has(method))
        .map((method) => [method, groups.get(method)]);
    }

    let methodOrder = sort.methodOrder.length
      ? [...sort.methodOrder]
      : Store._defaultHandwriteMethodSort([...groups.keys()]);
    methodOrder = methodOrder.filter((method) => groups.has(method));
    [...groups.keys()].forEach((method) => {
      if (!methodOrder.includes(method)) methodOrder.push(method);
    });

    return methodOrder.map((method) => {
      const list = groups.get(method) || [];
      const idOrder = sort.questionOrder[method] || [];
      const rank = new Map(idOrder.map((id, index) => [id, index]));
      const sorted = [...list].sort((a, b) => {
        const ia = rank.has(a.id) ? rank.get(a.id) : 9999;
        const ib = rank.has(b.id) ? rank.get(b.id) : 9999;
        if (ia !== ib) return ia - ib;
        return Store._defaultHandwriteRecordSort(a, b);
      });
      return [method, sorted];
    });
  },

  renderHandwritePage(deptId, moduleId, mod, dept) {
    const records = Store.getRawRecords(deptId, moduleId).map((r) => this.normalizeHandwriteRecord(r));
    const sortEditing = this.isHandwriteEditing(deptId, moduleId);

    if (sortEditing && (!this.handwriteDraft || this.handwriteDraft.deptId !== deptId || this.handwriteDraft.moduleId !== moduleId)) {
      this.initHandwriteDraft(deptId, moduleId);
    }

    const displaySort = this.getHandwriteDisplaySort(deptId, moduleId, records);
    const sortedGroups = this.buildHandwriteGroups(records, displaySort);
    const draftDirty = Boolean(this.handwriteDraft?.dirty);

    const groupHtml = sortedGroups.length
      ? sortedGroups
          .map(([method, list]) => this.renderHandwriteGroup(method, list, deptId, moduleId, sortEditing))
          .join('')
      : '<div class="empty-state empty-inline">还没有题目，点「添加题目」开始</div>';

    const doneCount = records.filter((r) => r.done).length;
    const totalCount = records.length;
    const progressPct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    return `
      ${this.renderModuleTabs(dept, moduleId)}
      <div class="module-page module-page-handwrite ${sortEditing ? 'is-sort-editing' : ''}">
        <div class="module-page-head">
          <div class="module-page-intro">
            ${this.renderModuleIcon(mod, 'module-page-icon')}
            <div class="module-page-intro-body">
              <h3 class="module-page-title">${this.escapeHtml(mod.name)}</h3>
              ${sortEditing && draftDirty ? '<p class="module-page-desc handwrite-unsaved-hint">顺序未保存</p>' : ''}
              <div class="handwrite-progress">
                <div class="handwrite-progress-track" role="progressbar" aria-valuenow="${doneCount}" aria-valuemin="0" aria-valuemax="${totalCount}" aria-label="完成进度">
                  <div class="handwrite-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <span class="handwrite-progress-label">已完成 ${doneCount}/${totalCount}</span>
              </div>
            </div>
          </div>
          <div class="module-page-actions handwrite-page-actions">
            <button type="button" class="btn btn-ghost btn-sm btn-handwrite-sort-toggle ${sortEditing ? 'is-active' : ''}" title="${sortEditing ? '取消调整' : '调整顺序'}">${sortEditing ? '取消' : '⇅ 顺序'}</button>
            ${sortEditing ? '<button type="button" class="btn btn-secondary btn-sm" id="btnSaveHandwriteSort">保存顺序</button>' : ''}
            <button type="button" class="btn btn-primary btn-sm" id="btnAddHandwrite">+ 添加题目</button>
          </div>
        </div>
        ${sortEditing ? `<p class="handwrite-sort-hint${draftDirty ? ' is-dirty' : ''}">使用 ↑↓ 调整方法与题目顺序，完成后点「保存顺序」</p>` : ''}
        <div class="lc-problem-board">${groupHtml}</div>
      </div>
    `;
  },

  renderHandwriteGroup(method, records, deptId, moduleId, sortEditing = false) {
    const reorderBtns = sortEditing
      ? `<div class="lc-group-reorder">
          <button type="button" class="icon-btn btn-handwrite-method-up" data-method="${this.escapeHtml(method)}" title="上移">↑</button>
          <button type="button" class="icon-btn btn-handwrite-method-down" data-method="${this.escapeHtml(method)}" title="下移">↓</button>
        </div>`
      : '';

    return `
      <section class="lc-group">
        <header class="lc-group-header">
          <span class="lc-group-title">${this.escapeHtml(method)}</span>
          ${reorderBtns}
        </header>
        <div class="lc-group-body">
          ${records.map((r) => this.renderHandwriteRow(r, deptId, moduleId, method, sortEditing)).join('')}
        </div>
      </section>
    `;
  },

  renderHandwriteRow(record, deptId, moduleId, method, sortEditing = false) {
    const diffClass =
      record.difficulty === '简单' ? 'lc-diff-easy' : record.difficulty === '困难' ? 'lc-diff-hard' : 'lc-diff-medium';
    const tags = [
      record.dataStructure || '',
      record.hot100 ? 'Hot100' : '',
      record.codetopFreq !== '' && record.codetopFreq != null ? `CodeTop 频次 ${record.codetopFreq}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const reorderBtns = sortEditing
      ? `<div class="lc-row-reorder">
          <button type="button" class="icon-btn btn-handwrite-record-up" data-method="${this.escapeHtml(method)}" data-id="${record.id}" title="上移">↑</button>
          <button type="button" class="icon-btn btn-handwrite-record-down" data-method="${this.escapeHtml(method)}" data-id="${record.id}" title="下移">↓</button>
        </div>`
      : '';

    return `
      <div class="lc-row ${record.done ? 'is-done' : ''}" data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}">
        <button type="button" class="lc-check ${record.done ? 'is-done' : ''}" title="${record.done ? '标记未完成' : '标记完成'}">
          ${record.done ? '✓' : ''}
        </button>
        <button type="button" class="lc-row-main btn-edit-handwrite">
          <span class="lc-title">${record.lcNumber ? `${this.escapeHtml(String(record.lcNumber))}. ` : ''}${this.escapeHtml(record.title)}</span>
          ${tags ? `<span class="lc-tags">${this.escapeHtml(tags)}</span>` : ''}
        </button>
        <span class="lc-diff ${diffClass}">${this.escapeHtml(record.difficulty)}</span>
        ${reorderBtns}
        ${sortEditing ? '' : '<button type="button" class="icon-btn btn-delete-handwrite" title="删除">×</button>'}
      </div>
    `;
  },

  bindHandwritePage(deptId, moduleId) {
    document.getElementById('btnAddHandwrite')?.addEventListener('click', () => {
      this.openModal(deptId, moduleId);
    });

    document.querySelector('.btn-handwrite-sort-toggle')?.addEventListener('click', () => {
      if (this.isHandwriteEditing(deptId, moduleId)) {
        if (this.handwriteDraft?.dirty && !confirm('有未保存的顺序修改，确定取消吗？')) return;
        this.handwriteDraft = null;
        this.handwriteEditing = null;
      } else {
        this.handwriteEditing = { deptId, moduleId };
        this.initHandwriteDraft(deptId, moduleId);
      }
      this.render();
    });

    document.getElementById('btnSaveHandwriteSort')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnSaveHandwriteSort');
      if (btn) btn.disabled = true;
      await this.saveHandwriteDraft(deptId, moduleId);
      this.render();
    });

    document.querySelectorAll('.btn-handwrite-method-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveHandwriteDraftMethod(btn.dataset.method, -1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-handwrite-method-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveHandwriteDraftMethod(btn.dataset.method, 1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-handwrite-record-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveHandwriteDraftRecord(btn.dataset.method, btn.dataset.id, -1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-handwrite-record-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveHandwriteDraftRecord(btn.dataset.method, btn.dataset.id, 1);
        this.render();
      });
    });

    document.querySelectorAll('.lc-check').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.lc-row');
        const record = Store.getRecord(row.dataset.dept, row.dataset.module, row.dataset.id);
        if (!record) return;
        Store.updateRecord(row.dataset.dept, row.dataset.module, row.dataset.id, { done: !record.done });
        this.render();
      });
    });

    document.querySelectorAll('.btn-edit-handwrite').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.lc-row');
        const record = Store.getRecord(row.dataset.dept, row.dataset.module, row.dataset.id);
        if (record) this.openModal(row.dataset.dept, row.dataset.module, record);
      });
    });

    document.querySelectorAll('.btn-delete-handwrite').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.lc-row');
        if (confirm('确定删除这道题目？')) {
          Store.deleteRecord(row.dataset.dept, row.dataset.module, row.dataset.id);
          if (this.isHandwriteEditing(deptId, moduleId)) {
            this.syncHandwriteDraftWithRecords(deptId, moduleId);
          }
          this.render();
        }
      });
    });
  },

  renderBaguBankIcon(bank, className = 'bagu-bank-icon') {
    if (bank?.iconSrc) {
      return `<img class="${className}" src="${this.escapeHtml(bank.iconSrc)}" alt="">`;
    }
    return `<span class="${className} bagu-bank-icon-fallback">${this.escapeHtml(bank?.name?.[0] || '?')}</span>`;
  },

  parseBaguTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
    return String(tags).split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  },

  isBaguEditing(deptId, moduleId, bankId) {
    return (
      this.baguEditing?.deptId === deptId &&
      this.baguEditing?.moduleId === moduleId &&
      this.baguEditing?.bankId === bankId
    );
  },

  initBaguDraft(deptId, moduleId, bankId) {
    const sort = Store.getBaguSort(deptId, moduleId, bankId);
    const records = Store.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    let categoryOrder;
    let questionOrder;
    if (sort.mode === 'custom' && sort.categoryOrder.length) {
      categoryOrder = [...sort.categoryOrder];
      questionOrder = { ...sort.questionOrder };
    } else {
      const layout = Store._buildDefaultBaguLayout(records, bankId);
      categoryOrder = layout.categoryOrder;
      questionOrder = { ...layout.questionOrder };
    }
    this.baguDraft = { deptId, moduleId, bankId, categoryOrder, questionOrder, dirty: false };
  },

  syncBaguDraftWithRecords(deptId, moduleId, bankId) {
    if (!this.baguDraft || this.baguDraft.deptId !== deptId || this.baguDraft.moduleId !== moduleId || this.baguDraft.bankId !== bankId) {
      return;
    }
    const records = Store.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    const groups = new Map();
    records.forEach((record) => {
      const category = Store._baguCategoryKey(record);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(record.id);
    });

    let categoryOrder = this.baguDraft.categoryOrder.filter((category) => groups.has(category));
    [...groups.keys()].forEach((category) => {
      if (!categoryOrder.includes(category)) categoryOrder.push(category);
    });

    const questionOrder = {};
    groups.forEach((allIds, category) => {
      const existing = (this.baguDraft.questionOrder[category] || []).filter((id) => allIds.includes(id));
      allIds.forEach((id) => {
        if (!existing.includes(id)) existing.push(id);
      });
      questionOrder[category] = existing;
    });

    this.baguDraft.categoryOrder = categoryOrder;
    this.baguDraft.questionOrder = questionOrder;
    this.baguDraft.dirty = true;
  },

  moveBaguDraftCategory(category, delta) {
    if (!this.baguDraft) return;
    const categoryOrder = [...this.baguDraft.categoryOrder];
    const idx = categoryOrder.indexOf(category);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= categoryOrder.length) return;
    [categoryOrder[idx], categoryOrder[next]] = [categoryOrder[next], categoryOrder[idx]];
    this.baguDraft.categoryOrder = categoryOrder;
    this.baguDraft.dirty = true;
  },

  moveBaguDraftRecord(category, recordId, delta) {
    if (!this.baguDraft) return;
    const questionOrder = { ...this.baguDraft.questionOrder };
    const order = [...(questionOrder[category] || [])];
    const idx = order.indexOf(recordId);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    questionOrder[category] = order;
    this.baguDraft.questionOrder = questionOrder;
    this.baguDraft.dirty = true;
  },

  async saveBaguDraft(deptId, moduleId, bankId) {
    if (!this.baguDraft || this.baguDraft.deptId !== deptId || this.baguDraft.moduleId !== moduleId || this.baguDraft.bankId !== bankId) {
      return false;
    }
    Store.setBaguSort(deptId, moduleId, bankId, {
      mode: 'custom',
      categoryOrder: [...this.baguDraft.categoryOrder],
      questionOrder: { ...this.baguDraft.questionOrder },
    });
    try {
      await Store.flushSave();
    } catch {
      /* localStorage 已写入 */
    }
    this.baguDraft.dirty = false;
    this.baguDraft = null;
    this.baguEditing = null;
    return true;
  },

  getBaguDisplaySort(deptId, moduleId, bankId, records) {
    if (this.isBaguEditing(deptId, moduleId, bankId) && this.baguDraft) {
      return {
        mode: 'custom',
        categoryOrder: this.baguDraft.categoryOrder,
        questionOrder: this.baguDraft.questionOrder,
      };
    }
    const sort = Store.getBaguSort(deptId, moduleId, bankId);
    if (sort.mode === 'custom' && sort.categoryOrder.length) return sort;
    const layout = Store._buildDefaultBaguLayout(records, bankId);
    return {
      mode: 'default',
      categoryOrder: layout.categoryOrder,
      questionOrder: layout.questionOrder,
    };
  },

  buildBaguGroups(records, sort, bankId) {
    const groups = new Map();
    records.forEach((record) => {
      const key = Store._baguCategoryKey(record);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });

    const sortRecordsDefault = (list) =>
      [...list].sort((a, b) => Store._defaultBaguRecordSort(a, b));

    if (sort.mode !== 'custom') {
      groups.forEach((list, category) => {
        groups.set(category, sortRecordsDefault(list));
      });
      return Store._defaultBaguCategorySort([...groups.keys()], bankId)
        .filter((category) => groups.has(category))
        .map((category) => [category, groups.get(category)]);
    }

    let categoryOrder = sort.categoryOrder.length
      ? [...sort.categoryOrder]
      : Store._defaultBaguCategorySort([...groups.keys()], bankId);
    categoryOrder = categoryOrder.filter((category) => groups.has(category));
    [...groups.keys()].forEach((category) => {
      if (!categoryOrder.includes(category)) categoryOrder.push(category);
    });

    return categoryOrder.map((category) => {
      const list = groups.get(category) || [];
      const idOrder = sort.questionOrder[category] || [];
      const rank = new Map(idOrder.map((id, index) => [id, index]));
      const sorted = [...list].sort((a, b) => {
        const ia = rank.has(a.id) ? rank.get(a.id) : 9999;
        const ib = rank.has(b.id) ? rank.get(b.id) : 9999;
        if (ia !== ib) return ia - ib;
        return Store._defaultBaguRecordSort(a, b);
      });
      return [category, sorted];
    });
  },

  isBaguGroupCollapsed(bankId, category) {
    const key = `${bankId}::${category}`;
    return Boolean(this.baguCollapsed?.[key]);
  },

  toggleBaguGroupCollapsed(bankId, category) {
    this.baguCollapsed = this.baguCollapsed || {};
    const key = `${bankId}::${category}`;
    this.baguCollapsed[key] = !this.baguCollapsed[key];
  },

  renderBaguPage(deptId, moduleId, mod, dept) {
    const bankId = this.route.baguBank;
    if (bankId) {
      return this.renderBaguBankDetail(deptId, moduleId, mod, dept, bankId);
    }
    return this.renderBaguBankGrid(deptId, moduleId, dept);
  },

  renderBaguNotesLink() {
    const url = typeof BAGU_NOTES_URL === 'string' ? BAGU_NOTES_URL.trim() : '';
    if (!url) return '';
    return `<a class="btn btn-ghost btn-sm bagu-notes-link" href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="打开个人笔记网站">个人笔记 ↗</a>`;
  },

  renderBaguBankGrid(deptId, moduleId, dept) {
    const records = Store.getRawRecords(deptId, moduleId);
    const notesLink = this.renderBaguNotesLink();
    const banks = typeof listBaguBanks === 'function' ? listBaguBanks() : BAGU_QUESTION_BANKS;

    return `
      ${this.renderModuleTabs(dept, moduleId)}
      <div class="module-page module-page-bagu">
        <div class="bagu-bank-toolbar">
          ${notesLink || ''}
          <button type="button" class="btn btn-primary btn-sm btn-create-bagu-bank">+ 创建题库</button>
        </div>
        <div class="bagu-bank-grid">
          ${banks
            .map((bank) => {
              const list = records.filter((r) => r.bank === bank.id);
              const doneCount = list.filter((r) => r.done).length;
              return `
              <button type="button" class="bagu-bank-card" data-bank="${this.escapeHtml(bank.id)}">
                <span class="bagu-bank-progress" title="已完成 ${doneCount}/${list.length}">
                  <span class="bagu-bank-progress-text">已完成<br>${doneCount}/${list.length}</span>
                </span>
                ${this.renderBaguBankIcon(bank)}
                <div class="bagu-bank-body">
                  <h4 class="bagu-bank-title">${this.escapeHtml(bank.name)} 面试题</h4>
                  <p class="bagu-bank-desc">${this.escapeHtml(bank.desc || '暂无介绍')}</p>
                </div>
              </button>`;
            })
            .join('')}
          <button type="button" class="bagu-bank-card bagu-bank-card-create btn-create-bagu-bank">
            <span class="bagu-bank-icon bagu-bank-icon-fallback" aria-hidden="true">+</span>
            <div class="bagu-bank-body">
              <h4 class="bagu-bank-title">创建题库</h4>
              <p class="bagu-bank-desc">自定义标题、Logo 与介绍</p>
            </div>
          </button>
        </div>
      </div>`;
  },

  renderBaguBankDetail(deptId, moduleId, mod, dept, bankId) {
    const bank = getBaguBank(bankId);
    if (!bank) {
      return `${this.renderModuleTabs(dept, moduleId)}<div class="empty-state">题库不存在</div>`;
    }

    const sortEditing = this.isBaguEditing(deptId, moduleId, bankId);
    if (sortEditing && (!this.baguDraft || this.baguDraft.deptId !== deptId || this.baguDraft.moduleId !== moduleId || this.baguDraft.bankId !== bankId)) {
      this.initBaguDraft(deptId, moduleId, bankId);
    }

    const draftDirty = Boolean(this.baguDraft?.dirty);
    const bankRecords = Store.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    const sort = this.getBaguDisplaySort(deptId, moduleId, bankId, bankRecords);
    const sortedGroups = this.buildBaguGroups(bankRecords, sort, bankId);
    const doneCount = bankRecords.filter((r) => r.done).length;
    const progressPct = bankRecords.length ? Math.round((doneCount / bankRecords.length) * 100) : 0;

    const groupHtml = sortedGroups.length
      ? sortedGroups
          .map(([category, list]) => this.renderBaguGroup(category, list, deptId, moduleId, bankId, sortEditing))
          .join('')
      : '<div class="empty-state empty-inline">还没有题目，点「添加题目」开始</div>';

    return `
      ${this.renderModuleTabs(dept, moduleId)}
      <div class="module-page module-page-bagu module-page-bagu-detail ${sortEditing ? 'is-sort-editing' : ''}">
        <button type="button" class="back-link btn-bagu-back" data-dept="${deptId}" data-module="${moduleId}">← 返回题库</button>
        <div class="bagu-detail-head">
          <div class="bagu-detail-intro">
            ${this.renderBaguBankIcon(bank, 'bagu-detail-icon')}
            <div class="bagu-detail-body">
              <h3 class="bagu-detail-title">${this.escapeHtml(bank.name)} 面试题</h3>
              <p class="bagu-detail-desc">${this.escapeHtml(bank.desc)}</p>
              ${sortEditing && draftDirty ? '<p class="module-page-desc handwrite-unsaved-hint">顺序未保存</p>' : ''}
              <div class="handwrite-progress bagu-detail-progress">
                <div class="handwrite-progress-track" role="progressbar" aria-valuenow="${doneCount}" aria-valuemin="0" aria-valuemax="${bankRecords.length}">
                  <div class="handwrite-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <span class="handwrite-progress-label">已完成 ${doneCount}/${bankRecords.length}</span>
              </div>
            </div>
          </div>
          <div class="bagu-detail-actions">
            ${
              bank.custom
                ? `<button type="button" class="btn btn-ghost btn-sm btn-edit-bagu-bank" data-bank="${this.escapeHtml(bankId)}" title="编辑题库">编辑题库</button>`
                : ''
            }
            <button type="button" class="btn btn-ghost btn-sm btn-bagu-smart-sort" title="按难度与学习曲线自动分类排序">智能排序</button>
            <button type="button" class="btn btn-ghost btn-sm btn-bagu-sort-toggle ${sortEditing ? 'is-active' : ''}" title="${sortEditing ? '取消调整' : '调整顺序'}">${sortEditing ? '取消' : '⇅ 顺序'}</button>
            ${sortEditing ? '<button type="button" class="btn btn-secondary btn-sm" id="btnSaveBaguSort">保存顺序</button>' : ''}
            <button type="button" class="btn btn-primary btn-sm" id="btnAddBaguQuestion">+ 添加题目</button>
          </div>
        </div>
        ${sortEditing ? `<p class="handwrite-sort-hint${draftDirty ? ' is-dirty' : ''}">使用 ↑↓ 调整分类与题目顺序，完成后点「保存顺序」</p>` : ''}
        <div class="bagu-problem-board">${groupHtml}</div>
      </div>`;
  },

  renderBaguGroup(category, records, deptId, moduleId, bankId, sortEditing = false) {
    const collapsed = this.isBaguGroupCollapsed(bankId, category);
    const doneCount = records.filter((r) => r.done).length;
    const reorderBtns = sortEditing
      ? `<div class="lc-group-reorder bagu-group-reorder">
          <button type="button" class="icon-btn btn-bagu-category-up" data-category="${this.escapeHtml(category)}" title="上移分组">↑</button>
          <button type="button" class="icon-btn btn-bagu-category-down" data-category="${this.escapeHtml(category)}" title="下移分组">↓</button>
        </div>`
      : '';

    return `
      <section class="lc-group bagu-group ${collapsed ? 'is-collapsed' : ''}" data-category="${this.escapeHtml(category)}">
        <header class="lc-group-header bagu-group-header">
          <button type="button" class="bagu-group-toggle" data-bank="${this.escapeHtml(bankId)}" data-category="${this.escapeHtml(category)}" title="${collapsed ? '展开' : '折叠'}">
            <span class="bagu-group-chevron">${collapsed ? '›' : '⌄'}</span>
            <span class="lc-group-title">${this.escapeHtml(category)}</span>
            <span class="bagu-group-count">${doneCount}/${records.length}</span>
          </button>
          ${reorderBtns}
        </header>
        <div class="lc-group-body bagu-group-body">
          ${records.map((r) => this.renderBaguQuestionRow(r, deptId, moduleId, category, sortEditing)).join('')}
        </div>
      </section>`;
  },

  renderBaguQuestionRow(record, deptId, moduleId, category, sortEditing = false) {
    const reorderBtns = sortEditing
      ? `<div class="bagu-row-reorder">
          <button type="button" class="icon-btn btn-bagu-record-up" data-category="${this.escapeHtml(category)}" data-id="${record.id}" title="上移">↑</button>
          <button type="button" class="icon-btn btn-bagu-record-down" data-category="${this.escapeHtml(category)}" data-id="${record.id}" title="下移">↓</button>
        </div>`
      : '';
    const diff = record.difficulty || '';
    const diffClass =
      diff === '简单' ? 'lc-diff-easy' : diff === '困难' ? 'lc-diff-hard' : diff === '中等' ? 'lc-diff-medium' : '';

    return `
      <div class="bagu-question-row ${record.done ? 'is-done' : ''}" data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}">
        <button type="button" class="lc-check bagu-check ${record.done ? 'is-done' : ''}" title="${record.done ? '标记未完成' : '标记完成'}">
          ${record.done ? '✓' : ''}
        </button>
        <div class="bagu-question-main">
          <span class="bagu-question-title">${this.escapeHtml(record.title || '未命名题目')}</span>
        </div>
        ${diff ? `<span class="lc-diff ${diffClass}">${this.escapeHtml(diff)}</span>` : ''}
        ${sortEditing ? reorderBtns : '<button type="button" class="btn btn-ghost btn-sm btn-view-bagu-answer">查看答案</button>'}
      </div>`;
  },

  resetModalFooter() {
    document.getElementById('modalSave')?.classList.remove('hidden');
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.textContent = '保存';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');
    const cancelBtn = document.getElementById('modalCancel');
    if (cancelBtn) cancelBtn.textContent = '取消';
  },

  openBaguAnswerModal(deptId, moduleId, record, options = {}) {
    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = record.title || '题目';
    const form = document.getElementById('recordForm');
    const tagList = this.parseBaguTags(record.tags);
    const metaHtml =
      record.category || record.difficulty || tagList.length
        ? `<div class="bagu-answer-meta">
            ${record.category ? `<span class="bagu-question-category">${this.escapeHtml(record.category)}</span>` : ''}
            ${record.difficulty ? `<span class="bagu-question-tag">${this.escapeHtml(record.difficulty)}</span>` : ''}
            ${tagList.map((tag) => `<span class="bagu-question-tag">${this.escapeHtml(tag)}</span>`).join('')}
          </div>`
        : '';

    const sections = this.getBaguAnswerSections(record);
    const bodyHtml = sections.some((s) => s.html)
      ? sections
          .map(
            (s) => `
        <section class="bagu-answer-section">
          <h4 class="bagu-answer-section-title">${s.title}</h4>
          ${
            s.html
              ? `<div class="bagu-answer-view ql-editor">${s.html}</div>`
              : '<p class="bagu-answer-empty">暂无内容</p>'
          }
        </section>`
          )
          .join('')
      : '<div class="empty-state empty-inline">暂无答案，可点「编辑」补充</div>';

    form.innerHTML = `${metaHtml}<div class="bagu-answer-sections">${bodyHtml}</div>`;
    form.onsubmit = null;

    document.getElementById('modal')?.classList.add('modal-rich');
    document.getElementById('modalSave')?.classList.add('hidden');
    document.getElementById('modalCancel').textContent = '关闭';

    const editBtn = document.getElementById('btnBaguAnswerEdit');
    if (editBtn) {
      editBtn.classList.remove('hidden');
      editBtn.onclick = () => {
        this.closeModal();
        this.openModal(deptId, moduleId, record, options);
      };
    }

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  /** 兼容旧版 note 字段：无参考答案时把 note 当作参考答案 */
  getBaguAnswerSections(record) {
    const answer = record.answer || (!record.approach && !record.followUp ? record.note : '') || '';
    return [
      { key: 'approach', title: '回答思路', html: record.approach || '' },
      { key: 'answer', title: '参考答案', html: answer },
      { key: 'followUp', title: '可能追问', html: record.followUp || '' },
    ];
  },

  normalizeBaguEditRecord(record) {
    if (!record) return record;
    const next = { ...record };
    if (!next.answer && next.note && !next.approach && !next.followUp) {
      next.answer = next.note;
    }
    return next;
  },

  bindBaguPage(deptId, moduleId) {
    const bankId = this.route.baguBank;

    document.querySelectorAll('.bagu-bank-card[data-bank]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.navigate('module', { deptId, moduleId, baguBank: btn.dataset.bank });
      });
    });

    document.querySelectorAll('.btn-create-bagu-bank').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openBaguBankModal(null);
      });
    });

    document.querySelectorAll('.btn-edit-bagu-bank').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.bank;
        const bank = Store.getCustomBaguBank(id);
        if (bank) this.openBaguBankModal(bank);
      });
    });

    document.querySelectorAll('.btn-delete-bagu-bank').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deleteBaguBankWithConfirm(btn.dataset.bank);
      });
    });

    document.querySelector('.btn-bagu-back')?.addEventListener('click', () => {
      this.navigate('module', { deptId, moduleId });
    });

    document.getElementById('btnAddBaguQuestion')?.addEventListener('click', () => {
      this.openModal(deptId, moduleId);
    });

    document.querySelector('.btn-bagu-smart-sort')?.addEventListener('click', () => {
      if (!bankId) return;
      this.runBaguSmartSort(deptId, moduleId, bankId);
    });

    document.querySelector('.btn-bagu-sort-toggle')?.addEventListener('click', () => {
      if (!bankId) return;
      if (this.isBaguEditing(deptId, moduleId, bankId)) {
        if (this.baguDraft?.dirty && !confirm('有未保存的顺序修改，确定取消吗？')) return;
        this.baguDraft = null;
        this.baguEditing = null;
      } else {
        this.baguEditing = { deptId, moduleId, bankId };
        this.initBaguDraft(deptId, moduleId, bankId);
      }
      this.render();
    });

    document.getElementById('btnSaveBaguSort')?.addEventListener('click', async () => {
      if (!bankId) return;
      const btn = document.getElementById('btnSaveBaguSort');
      if (btn) btn.disabled = true;
      await this.saveBaguDraft(deptId, moduleId, bankId);
      this.render();
    });

    document.querySelectorAll('.btn-bagu-category-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveBaguDraftCategory(btn.dataset.category, -1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-bagu-category-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveBaguDraftCategory(btn.dataset.category, 1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-bagu-record-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveBaguDraftRecord(btn.dataset.category, btn.dataset.id, -1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-bagu-record-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveBaguDraftRecord(btn.dataset.category, btn.dataset.id, 1);
        this.render();
      });
    });

    document.querySelectorAll('.bagu-group-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBaguGroupCollapsed(btn.dataset.bank, btn.dataset.category);
        this.render();
      });
    });

    document.querySelectorAll('.bagu-check').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.bagu-question-row');
        const record = Store.getRecord(row.dataset.dept, row.dataset.module, row.dataset.id);
        if (!record) return;
        Store.updateRecord(row.dataset.dept, row.dataset.module, row.dataset.id, { done: !record.done });
        this.render();
      });
    });

    document.querySelectorAll('.btn-view-bagu-answer').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.bagu-question-row');
        const record = Store.getRecord(row.dataset.dept, row.dataset.module, row.dataset.id);
        if (record) this.openBaguAnswerModal(row.dataset.dept, row.dataset.module, record);
      });
    });
  },

  deleteBaguBankWithConfirm(bankId) {
    const bank = Store.getCustomBaguBank(bankId);
    if (!bank) return;
    const count = Store.countBaguQuestionsInBank(bankId);
    const msg = count
      ? `确定删除题库「${bank.name}」及其下的 ${count} 道题目吗？此操作不可撤销。`
      : `确定删除题库「${bank.name}」吗？`;
    if (!confirm(msg)) return;
    this.closeModal();
    Store.deleteCustomBaguBank(bankId, { deleteQuestions: true });
    if (this.route.baguBank === bankId) {
      this.navigate('module', { deptId: 'core', moduleId: 'bagu' });
    } else {
      this.render();
    }
  },

  openBaguBankModal(existing = null) {
    const isEdit = Boolean(existing?.id);
    RichEditor.destroyAll();
    document.getElementById('modal')?.classList.remove('modal-rich');
    document.getElementById('modal')?.classList.remove('modal-bagu-answers');
    this.baguBankDraft = {
      id: existing?.id || null,
      name: existing?.name || '',
      desc: existing?.desc || '',
      iconSrc: existing?.iconSrc || '',
      categories: Array.isArray(existing?.categories) ? existing.categories.join('，') : '',
    };

    document.getElementById('modalTitle').textContent = isEdit ? '编辑题库' : '创建题库';
    this.resetModalFooter();
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.textContent = isEdit ? '保存' : '创建';
    const form = document.getElementById('recordForm');
    const draft = this.baguBankDraft;
    form.innerHTML = `
      <div class="form-group">
        <label>题库标题</label>
        <input type="text" id="baguBankNameInput" maxlength="40" required placeholder="如 系统设计、计算机网络"
          value="${this.escapeHtml(draft.name)}">
      </div>
      <div class="form-group">
        <label>介绍</label>
        <textarea id="baguBankDescInput" rows="3" maxlength="200" placeholder="一句话介绍这个题库…">${this.escapeHtml(draft.desc)}</textarea>
      </div>
      <div class="form-group">
        <label>Logo</label>
        <div class="bagu-bank-logo-row">
          <span class="bagu-bank-logo-preview" id="baguBankLogoPreview">
            ${
              draft.iconSrc
                ? `<img src="${draft.iconSrc}" alt="">`
                : `<span class="bagu-bank-icon-fallback">${this.escapeHtml((draft.name || '?')[0])}</span>`
            }
          </span>
          <div class="bagu-bank-logo-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="btnBaguBankLogo">上传图片</button>
            <button type="button" class="btn btn-ghost btn-sm ${draft.iconSrc ? '' : 'hidden'}" id="btnBaguBankLogoClear">移除</button>
            <p class="form-hint">可选，建议方形图片，不超过 2MB</p>
          </div>
          <input type="file" id="baguBankLogoInput" accept="image/*" hidden>
        </div>
      </div>
      <div class="form-group">
        <label>预设分类（可选）</label>
        <input type="text" id="baguBankCategoriesInput" maxlength="200" placeholder="多个分类用逗号分隔，如 基础,进阶,实战"
          value="${this.escapeHtml(draft.categories)}">
        <p class="form-hint">添加题目时可快速选择；也可之后在题目里自定义分类</p>
      </div>
      ${
        isEdit
          ? `<div class="form-group bagu-bank-delete-row">
              <button type="button" class="btn btn-ghost btn-sm is-danger" id="btnDeleteBaguBank">删除题库</button>
            </div>`
          : ''
      }`;

    const syncLogoPreview = () => {
      const preview = document.getElementById('baguBankLogoPreview');
      const clearBtn = document.getElementById('btnBaguBankLogoClear');
      if (!preview) return;
      if (this.baguBankDraft.iconSrc) {
        preview.innerHTML = `<img src="${this.baguBankDraft.iconSrc}" alt="">`;
      } else {
        const ch = (this.baguBankDraft.name || '?').trim().charAt(0) || '?';
        preview.innerHTML = `<span class="bagu-bank-icon-fallback">${this.escapeHtml(ch)}</span>`;
      }
      clearBtn?.classList.toggle('hidden', !this.baguBankDraft.iconSrc);
    };

    document.getElementById('baguBankNameInput')?.addEventListener('input', (e) => {
      this.baguBankDraft.name = e.target.value;
      if (!this.baguBankDraft.iconSrc) syncLogoPreview();
    });
    document.getElementById('btnBaguBankLogo')?.addEventListener('click', () => {
      document.getElementById('baguBankLogoInput')?.click();
    });
    document.getElementById('baguBankLogoInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        this.baguBankDraft.iconSrc = await this.compressAvatar(file);
        syncLogoPreview();
      } catch (err) {
        alert(err.message || '图片处理失败');
      }
    });
    document.getElementById('btnBaguBankLogoClear')?.addEventListener('click', () => {
      this.baguBankDraft.iconSrc = '';
      syncLogoPreview();
    });

    document.getElementById('btnDeleteBaguBank')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!existing?.id) return;
      this.deleteBaguBankWithConfirm(existing.id);
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const name = String(document.getElementById('baguBankNameInput')?.value || '').trim();
      const desc = String(document.getElementById('baguBankDescInput')?.value || '').trim();
      const categories = String(document.getElementById('baguBankCategoriesInput')?.value || '').trim();
      if (!name) {
        document.getElementById('baguBankNameInput')?.focus();
        return;
      }
      if (Store.isBaguBankNameTaken(name, existing?.id || null)) {
        alert(`题库名称「${name}」已存在，请换一个名称`);
        document.getElementById('baguBankNameInput')?.focus();
        return;
      }
      const payload = {
        name,
        desc,
        iconSrc: this.baguBankDraft.iconSrc || '',
        categories,
      };
      if (isEdit) {
        const updated = Store.updateCustomBaguBank(existing.id, payload);
        if (!updated) {
          alert(`题库名称「${name}」已存在，请换一个名称`);
          document.getElementById('baguBankNameInput')?.focus();
          return;
        }
        this.closeModal();
        this.render();
      } else {
        const created = Store.addCustomBaguBank(payload);
        if (!created) {
          alert(`题库名称「${name}」已存在，请换一个名称`);
          document.getElementById('baguBankNameInput')?.focus();
          return;
        }
        this.closeModal();
        this.navigate('module', { deptId: 'core', moduleId: 'bagu', baguBank: created.id });
      }
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  splitInterviewRecords(records) {
    const now = Date.now();
    const upcoming = [];
    const past = [];
    (records || []).forEach((record) => {
      const ts = Store.parseRecordDateTime(record);
      if (Number.isFinite(ts) && ts >= now) upcoming.push(record);
      else past.push(record);
    });
    upcoming.sort((a, b) => Store.parseRecordDateTime(a) - Store.parseRecordDateTime(b));
    past.sort((a, b) => Store.parseRecordDateTime(b) - Store.parseRecordDateTime(a));
    return { upcoming, past };
  },

  interviewSectionDateDefaults(section) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    if (section === 'past') {
      d.setDate(d.getDate() - 1);
      d.setHours(14, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 1);
      d.setHours(14, 0, 0, 0);
    }
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, endTime: '15:00' };
  },

  renderInterviewPage(deptId, moduleId, mod, dept) {
    const records = Store.getRawRecords(deptId, moduleId);
    const { upcoming, past } = this.splitInterviewRecords(records);

    const renderSection = (title, desc, list, sectionKey, addLabel) => `
      <section class="interview-section" data-section="${sectionKey}">
        <div class="interview-section-head">
          <div>
            <h3 class="interview-section-title">${title}<span class="interview-section-count">${list.length}</span></h3>
            <p class="interview-section-desc">${desc}</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-add-interview" data-section="${sectionKey}">${addLabel}</button>
        </div>
        <div class="record-list interview-records">
          ${
            list.length
              ? list.map((r) => this.renderExpandableRecordItem(mod, r, deptId, moduleId, null)).join('')
              : `<div class="empty-state empty-inline">${sectionKey === 'upcoming' ? '暂无即将到来的面试' : '暂无过去的面试，可点「添加复盘」补录'}</div>`
          }
        </div>
      </section>`;

    return `
      ${this.renderModuleTabs(dept, moduleId)}
      <div class="module-page module-page-interview">
        ${renderSection('即将到来的面试', '按时间正序，顶部倒计时会取最近一场', upcoming, 'upcoming', '+ 添加面试')}
        ${renderSection('过去的面试', '按时间倒序，用于复盘；也可补录历史面试', past, 'past', '+ 添加复盘')}
      </div>`;
  },

  bindInterviewPage(deptId, moduleId) {
    document.querySelectorAll('.btn-add-interview').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openModal(deptId, moduleId, null, { interviewSection: btn.dataset.section || 'upcoming' });
      });
    });

    this.bindRecordAccordions('.module-page-interview');
    this.bindRecordActions('.module-page-interview');
  },

  projectEditorToolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ color: [] }, { background: [] }],
    ['blockquote', 'code-block'],
    [{ align: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    ['clean'],
  ],

  projectTimelinePrompt: `请按照时间线以及 STAR 法则，梳理这个项目的开发过程，我作为得物的 AI 开发实习生，简历上的每点都要提到。

我进入项目是在什么阶段？

我先后接到了什么需求（该需求是产品经理和带教开会提出需求，然后带教再把一部分需求交给我的；还是我自己在已有需求开发中遇到的？）

为什么要这么做？遇到了什么困难？怎么解决的？为什么这么解决？有没有量化结果？

一定要说清楚各种指标是在什么情况下、怎么计算的。

如果是性能优化方面要思考指标为什么变好？`,

  renderProjectTimelineHelpBtn() {
    return `<button type="button" class="project-help-btn btn-project-timeline-help" title="参考 Prompt" aria-label="参考 Prompt">?</button>`;
  },

  renderProjectDescTipsBtn(projectId) {
    return `<button type="button" class="project-help-btn btn-project-desc-tips" data-project-id="${projectId}" title="优化意见" aria-label="优化意见">!</button>`;
  },

  formatProjectTipHtml(text) {
    if (this.isRichEmpty(text)) return '';
    const raw = String(text || '');
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return `<p>${this.escapeHtml(raw)}</p>`;
  },

  openProjectDescTips(projectId) {
    if (!projectId) return;
    const project = Store.getRecord('core', 'project', projectId);
    if (!project) return;

    document.querySelectorAll('.project-card.is-edit').forEach((card) => this.saveProjectCard(card));

    this.resetModalFooter();
    const projectName = this.normalizeProjectRecord(project).name || '未命名项目';
    document.getElementById('modalTitle').textContent = `优化意见 · ${projectName}`;
    const form = document.getElementById('recordForm');
    form.onsubmit = null;
    this._projectDescTipsOpen = true;
    this._projectDescTipsProjectId = projectId;

    document.getElementById('modal')?.classList.add('modal-rich');
    document.getElementById('modal')?.classList.remove('modal-bagu-answers');
    document.getElementById('modalSave')?.classList.add('hidden');
    document.getElementById('modalCancel').textContent = '关闭';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    const tipEditorOpts = {
      toolbar: this.projectEditorToolbar,
      placeholder: '支持加粗、高亮、列表、引用…',
    };

    const render = (editingId = null) => {
      RichEditor.destroyAll();
      const tips = Store.getProjectDescTips(projectId);
      const comments = tips.length
        ? tips
            .map((tip, i) => {
              if (editingId === tip.id) {
                return `
              <article class="project-tip-comment is-editing" data-tip-id="${tip.id}">
                <div class="project-tip-avatar">我</div>
                <div class="project-tip-body">
                  <div class="project-tip-meta">
                    <span class="project-tip-author">编辑意见</span>
                    <span class="project-tip-index">#${i + 1}</span>
                  </div>
                  <input type="hidden" id="projectTipEditInput" value="">
                  <div class="rich-editor-shell project-tip-editor-shell">
                    <div class="rich-editor-host" id="projectTipEditHost"></div>
                  </div>
                  <div class="project-tip-edit-actions">
                    <button type="button" class="btn btn-primary btn-xs btn-tip-save">保存</button>
                    <button type="button" class="btn btn-ghost btn-xs btn-tip-cancel">取消</button>
                  </div>
                </div>
              </article>`;
              }
              const html = this.formatProjectTipHtml(tip.text);
              return `
              <article class="project-tip-comment" data-tip-id="${tip.id}" style="--i:${i}">
                <div class="project-tip-avatar">我</div>
                <div class="project-tip-body">
                  <div class="project-tip-meta">
                    <span class="project-tip-author">我的意见</span>
                    <span class="project-tip-index">#${i + 1}</span>
                    <div class="project-tip-actions">
                      <button type="button" class="btn btn-ghost btn-xs btn-tip-edit">编辑</button>
                      <button type="button" class="btn btn-danger-ghost btn-xs btn-tip-delete">删除</button>
                    </div>
                  </div>
                  <div class="project-tip-text project-view-rich ql-editor">${html}</div>
                </div>
              </article>`;
            })
            .join('')
        : '<p class="project-tip-empty">这个项目还没有优化意见，在下方写一条开始吧</p>';

      const composerHtml = editingId
        ? ''
        : `<div class="project-tip-composer">
            <input type="hidden" id="projectTipComposeInput" value="">
            <div class="rich-editor-shell project-tip-editor-shell">
              <div class="rich-editor-host" id="projectTipComposeHost"></div>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-tip-add">发表意见</button>
          </div>`;

      form.innerHTML = `
        <div class="project-tip-thread">
          <p class="project-tip-intro">仅针对「${this.escapeHtml(projectName)}」的修改意见，与其他项目互不影响。</p>
          <div class="project-tip-list">${comments}</div>
          ${composerHtml}
        </div>`;

      if (editingId) {
        const tip = tips.find((t) => t.id === editingId);
        RichEditor.mount('projectTipEditHost', 'projectTipEditInput', tip?.text || '', tipEditorOpts);
      } else {
        RichEditor.mount('projectTipComposeHost', 'projectTipComposeInput', '', tipEditorOpts);
      }

      form.querySelector('.btn-tip-add')?.addEventListener('click', () => {
        RichEditor.syncAll();
        const html = document.getElementById('projectTipComposeInput')?.value || '';
        if (this.isRichEmpty(html)) {
          document.getElementById('projectTipComposeHost')?.querySelector('.ql-editor')?.focus();
          return;
        }
        Store.addProjectDescTip(projectId, html);
        render();
      });

      form.querySelectorAll('.btn-tip-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tipId = btn.closest('[data-tip-id]')?.dataset.tipId;
          if (tipId) render(tipId);
        });
      });

      form.querySelectorAll('.btn-tip-delete').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tipId = btn.closest('[data-tip-id]')?.dataset.tipId;
          if (!tipId || !confirm('确定删除这条意见？')) return;
          Store.deleteProjectDescTip(projectId, tipId);
          render();
        });
      });

      form.querySelector('.btn-tip-save')?.addEventListener('click', () => {
        const card = form.querySelector('.project-tip-comment.is-editing');
        const tipId = card?.dataset.tipId;
        RichEditor.syncAll();
        const html = document.getElementById('projectTipEditInput')?.value || '';
        if (!tipId) return;
        if (this.isRichEmpty(html)) {
          document.getElementById('projectTipEditHost')?.querySelector('.ql-editor')?.focus();
          return;
        }
        Store.updateProjectDescTip(projectId, tipId, html);
        render();
      });

      form.querySelector('.btn-tip-cancel')?.addEventListener('click', () => render());
    };

    render();
    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  openProjectTimelineHelp() {
    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '时间线梳理 · 参考 Prompt';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="project-help-prompt">
        <pre class="project-help-prompt-text">${this.escapeHtml(this.projectTimelinePrompt)}</pre>
        <button type="button" class="btn btn-ghost btn-sm btn-copy-timeline-prompt">复制 Prompt</button>
      </div>`;
    form.onsubmit = null;

    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.add('hidden');
    document.getElementById('modalCancel').textContent = '关闭';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    form.querySelector('.btn-copy-timeline-prompt')?.addEventListener('click', async () => {
      const btn = form.querySelector('.btn-copy-timeline-prompt');
      try {
        await navigator.clipboard.writeText(this.projectTimelinePrompt);
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(() => {
            btn.textContent = prev;
          }, 1500);
        }
      } catch (_) {
        if (btn) btn.textContent = '复制失败';
      }
    });

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  getProjectEditingSet() {
    this.projectEditing = this.projectEditing || new Set();
    return this.projectEditing;
  },

  isProjectEditing(id) {
    return this.getProjectEditingSet().has(id);
  },

  setProjectEditing(id, editing) {
    const set = this.getProjectEditingSet();
    if (editing) set.add(id);
    else set.delete(id);
  },

  formatProjectMonth(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return value || '';
    return `${m[1]}年${m[2]}月`;
  },

  formatProjectPeriod(record) {
    const start = this.formatProjectMonth(record.startDate);
    const end = record.ongoing ? '至今' : this.formatProjectMonth(record.endDate);
    if (start && end) return `${start} - ${end}`;
    return start || end || '未填时间';
  },

  isRichEmpty(html) {
    return !String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },


  truncateQuote(text, max = 42) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  },

  defaultBaguBankForProjectComment() {
    const banks = typeof listBaguBanks === 'function' ? listBaguBanks() : BAGU_QUESTION_BANKS;
    return banks[0]?.id || 'agent';
  },

  countProjectBodyQuestions(comments) {
    return (comments || []).reduce(
      (sum, c) => sum + (Array.isArray(c.questions) ? c.questions.length : c.text ? 1 : 0),
      0
    );
  },

  isProjectCommentSidebarOpen(projectId) {
    this._projectCommentSidebar = this._projectCommentSidebar || {};
    if (this._projectCommentSidebar[projectId] == null) {
      return Store.getProjectBodyComments(projectId).length > 0;
    }
    return !!this._projectCommentSidebar[projectId];
  },

  setProjectCommentSidebarOpen(projectId, open) {
    this._projectCommentSidebar = this._projectCommentSidebar || {};
    this._projectCommentSidebar[projectId] = !!open;
  },

  /** 仅在侧栏展开（或正在添加/编辑）时占用右侧区域；收起则整块消失 */
  shouldReserveProjectCommentSidebar(projectId, comments = null) {
    const state = this._commentPanelState;
    if (state?.mode === 'compose' && state.pending?.projectId === projectId) return true;
    if (
      state?.projectId === projectId &&
      (state.mode === 'edit' || state.mode === 'add-question')
    ) {
      return true;
    }
    return this.isProjectCommentSidebarOpen(projectId);
  },

  applyProjectBodyComments(html, comments, field) {
    const all = comments || [];
    const list = all
      .filter((c) => c.field === field && c.quote)
      .slice()
      .sort((a, b) => String(b.quote).length - String(a.quote).length);

    const pending = this._commentPanelState;
    const draft =
      pending?.mode === 'compose' &&
      pending.pending?.field === field &&
      pending.pending?.quote
        ? {
            id: '__draft__',
            quote: pending.pending.quote,
            prefix: pending.pending.prefix,
            suffix: pending.pending.suffix,
            isDraft: true,
          }
        : null;

    if (!list.length && !draft) return html;

    const root = document.createElement('div');
    root.innerHTML = html;
    list.forEach((comment) => this.wrapProjectCommentQuote(root, comment));
    if (draft) this.wrapProjectCommentQuote(root, draft);
    return root.innerHTML;
  },

  wrapProjectCommentQuote(root, comment) {
    const quote = String(comment.quote || '');
    if (!quote) return;
    const full = root.textContent || '';
    let foundAt = -1;
    let searchFrom = 0;
    while (searchFrom <= full.length) {
      const idx = full.indexOf(quote, searchFrom);
      if (idx < 0) break;
      const before = full.slice(Math.max(0, idx - (comment.prefix || '').length), idx);
      const after = full.slice(idx + quote.length, idx + quote.length + (comment.suffix || '').length);
      const prefixOk = !comment.prefix || before.endsWith(comment.prefix);
      const suffixOk = !comment.suffix || after.startsWith(comment.suffix);
      if (prefixOk && suffixOk) {
        foundAt = idx;
        break;
      }
      searchFrom = idx + 1;
    }
    if (foundAt < 0) foundAt = full.indexOf(quote);
    if (foundAt < 0) return;

    const endAt = foundAt + quote.length;
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let pos = 0;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    for (const node of textNodes) {
      if (node.parentElement?.closest('mark.project-comment-mark')) {
        pos += node.textContent.length;
        continue;
      }
      const len = node.textContent.length;
      if (!startNode && pos + len > foundAt) {
        startNode = node;
        startOff = foundAt - pos;
      }
      if (startNode && pos + len >= endAt) {
        endNode = node;
        endOff = endAt - pos;
        break;
      }
      pos += len;
    }
    if (!startNode || !endNode) return;

    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    const mark = document.createElement('mark');
    mark.className = `project-comment-mark${comment.isDraft ? ' is-draft is-active' : ''}${
      this._activeBodyCommentId === comment.id ? ' is-active' : ''
    }`;
    if (!comment.isDraft) mark.dataset.commentId = comment.id;
    mark.title = comment.isDraft ? '正在添加面试题' : '查看相关面试题';
    try {
      range.surroundContents(mark);
    } catch {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }

    if (!comment.isDraft && comment.id) {
      const bubble = document.createElement('button');
      bubble.type = 'button';
      bubble.className = `project-comment-bubble${
        this._activeBodyCommentId === comment.id ? ' is-active' : ''
      }`;
      bubble.dataset.commentId = comment.id;
      const questionCount = Array.isArray(comment.questions)
        ? comment.questions.length
        : comment.text
          ? 1
          : 0;
      const count = Math.max(1, questionCount);
      bubble.title = `${count} 道相关面试题`;
      bubble.setAttribute('aria-label', `${count} 道相关面试题`);
      bubble.innerHTML = `<span class="project-comment-bubble-count">${count}</span>`;
      mark.insertAdjacentElement('afterend', bubble);
    }
  },

  renderProjectCommentSidebar(projectId, comments) {
    const open = this.isProjectCommentSidebarOpen(projectId);
    // 划词草稿态：正文有草稿高亮时保持侧栏展开（添加/编辑走八股弹窗，不再内联表单）
    const composing =
      this._commentPanelState?.mode === 'compose' &&
      this._commentPanelState.pending?.projectId === projectId;

    // 收起：整块区域不渲染（由顶部 launcher 重新展开）
    if (!open && !composing) return '';

    if (!this._activeBodyCommentId && comments.length) {
      this._activeBodyCommentId = comments[0].id;
    }
    const activeId = this._activeBodyCommentId;
    const questionCount = this.countProjectBodyQuestions(comments);

    const cards = comments
      .map((comment) => this.renderProjectCommentSidebarCard(comment, activeId === comment.id))
      .join('');

    return `
      <aside class="project-comment-sidebar is-open" data-project-id="${projectId}">
        <div class="project-comment-sidebar-head">
          <span class="project-comment-sidebar-title">相关面试题 (${questionCount})</span>
          <button type="button" class="project-comment-sidebar-toggle btn-collapse-project-comment-sidebar" data-project-id="${projectId}" title="收起相关面试题" aria-label="收起相关面试题">»</button>
        </div>
        <div class="project-comment-sidebar-body">
          ${
            cards ||
            '<p class="project-comment-sidebar-empty">选中正文后点「+」添加面试题</p>'
          }
        </div>
      </aside>`;
  },

  renderProjectCommentSidebarCard(comment, isActive) {
    const questions = Array.isArray(comment.questions) ? comment.questions : [];

    const renderMenu = (q, index) => `
      <div class="project-comment-more-wrap" data-question-id="${q.id}" data-comment-id="${comment.id}">
        <button type="button" class="project-comment-more btn-side-comment-more" title="更多" aria-label="更多">⋯</button>
        <div class="project-comment-menu hidden">
          <button type="button" class="project-comment-menu-item btn-side-comment-edit">编辑</button>
          <button type="button" class="project-comment-menu-item btn-side-comment-view">查看答案</button>
          <button type="button" class="project-comment-menu-item btn-side-comment-move-up" ${index === 0 ? 'disabled' : ''}>上移</button>
          <button type="button" class="project-comment-menu-item btn-side-comment-move-down" ${
            index >= questions.length - 1 ? 'disabled' : ''
          }>下移</button>
          <button type="button" class="project-comment-menu-item is-danger btn-side-comment-delete">删除</button>
        </div>
      </div>`;

    const questionRows = questions
      .map((q, index) => {
        const bagu = q.baguId ? Store.getRecord('core', 'bagu', q.baguId) : null;
        const title = q.text || bagu?.title || '未命名题目';
        const isPrimary = index === 0;
        return `
          <div class="project-comment-question-row ${isPrimary ? 'is-primary' : ''}" data-question-id="${q.id}" data-comment-id="${comment.id}">
            <p class="project-comment-view-text">${this.escapeHtml(title)}</p>
            ${renderMenu(q, index)}
          </div>`;
      })
      .join('');

    return `
      <article class="project-comment-side-card ${isActive ? 'is-active' : ''}" data-comment-id="${comment.id}">
        <div class="project-comment-side-card-head">
          <div class="project-comment-panel-quote" title="${this.escapeHtml(comment.quote)}">
            <span class="project-comment-panel-quote-bar"></span>
            <span class="project-comment-panel-quote-text">${this.escapeHtml(this.truncateQuote(comment.quote, 36))}</span>
          </div>
        </div>
        <div class="project-comment-question-list">
          ${questionRows || '<p class="project-comment-sidebar-empty">暂无面试题</p>'}
          ${
            questions.length
              ? `<button type="button" class="btn-side-comment-add-q" data-comment-id="${comment.id}">+ 添加题目</button>`
              : ''
          }
        </div>
      </article>`;
  },

  renderProjectCommentSidebarComposeCard({ mode, pending, comment, questionId, bagu }) {
    const quote = mode === 'compose' ? pending.quote : comment.quote;
    let textValue = '';
    let bankId = this.defaultBaguBankForProjectComment();
    if (mode === 'edit' && comment && questionId) {
      const question = (comment.questions || []).find((q) => q.id === questionId);
      textValue = question?.text || bagu?.title || '';
      bankId = bagu?.bank || bankId;
    }
    const label =
      mode === 'edit' ? '编辑面试题' : mode === 'add-question' ? '添加面试题' : '添加面试题';
    return `
      <article class="project-comment-side-card is-compose is-active" data-compose-mode="${mode}" ${
        comment ? `data-comment-id="${comment.id}"` : ''
      } ${questionId ? `data-question-id="${questionId}"` : ''}>
        <div class="project-comment-side-card-head">
          <div class="project-comment-panel-quote" title="${this.escapeHtml(quote)}">
            <span class="project-comment-panel-quote-bar"></span>
            <span>${this.escapeHtml(this.truncateQuote(quote))}</span>
          </div>
        </div>
        <p class="project-comment-panel-label">${label}</p>
        <div class="project-comment-compose">
          <input type="text" class="project-comment-input project-comment-input-title project-side-comment-input" maxlength="200" placeholder="输入面试题…" value="${this.escapeHtml(textValue)}">
          <select class="project-comment-bank project-side-comment-bank">
            ${(typeof listBaguBanks === 'function' ? listBaguBanks() : BAGU_QUESTION_BANKS).map(
              (b) =>
                `<option value="${b.id}" ${b.id === bankId ? 'selected' : ''}>${this.escapeHtml(b.name)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="project-comment-panel-actions">
          <button type="button" class="btn btn-ghost btn-sm btn-side-comment-cancel">取消</button>
          <button type="button" class="btn btn-primary btn-sm btn-side-comment-send">${mode === 'edit' ? '保存' : '添加'}</button>
        </div>
      </article>`;
  },

  renderProjectCommentSidebarLauncher(projectId, commentCount, sidebarOpen) {
    if (sidebarOpen || commentCount <= 0) return '';
    return `
      <button type="button" class="project-comment-sidebar-launcher" data-project-id="${projectId}" title="展开相关面试题" aria-label="展开相关面试题">
        <span class="project-comment-sidebar-launcher-label">相关面试题</span>
        <span class="project-comment-sidebar-launcher-count">${commentCount}</span>
      </button>`;
  },

  alignProjectCommentSidebar(projectId) {
    if (window.matchMedia('(max-width: 960px)').matches) return;
    const projectCard = projectId
      ? document.querySelector(`.project-card.is-view[data-id="${projectId}"]`)
      : null;
    const cards = projectCard
      ? [projectCard]
      : [...document.querySelectorAll('.project-card.is-view.has-comment-sidebar')];

    cards.forEach((card) => {
      if (!card.classList.contains('has-comment-sidebar')) return;
      const sidebar = card.querySelector('.project-comment-sidebar');
      const sidebarBody = card.querySelector('.project-comment-sidebar-body');
      if (!sidebar || !sidebarBody) return;

      const sideCards = [...sidebarBody.querySelectorAll('.project-comment-side-card')];
      if (!sideCards.length) {
        sidebarBody.style.minHeight = '';
        return;
      }

      const head = sidebar.querySelector('.project-comment-sidebar-head');
      sideCards.forEach((el) => {
        el.classList.add('is-anchored');
        el.style.visibility = 'hidden';
        el.style.top = `${head?.offsetHeight || 36}px`;
      });

      const sidebarRect = sidebar.getBoundingClientRect();
      const headBottom = head
        ? Math.max(0, head.getBoundingClientRect().bottom - sidebarRect.top + 8)
        : 0;

      const items = sideCards.map((el) => {
        let anchor = null;
        if (el.classList.contains('is-compose') && !el.dataset.commentId) {
          anchor = card.querySelector('.project-comment-mark.is-draft');
        } else if (el.dataset.commentId) {
          anchor =
            card.querySelector(`.project-comment-mark[data-comment-id="${el.dataset.commentId}"]`) ||
            card.querySelector(`.project-comment-bubble[data-comment-id="${el.dataset.commentId}"]`);
        }
        let top = headBottom;
        if (anchor) {
          top = anchor.getBoundingClientRect().top - sidebarRect.top;
        }
        return { el, top: Math.max(headBottom, top), height: el.offsetHeight || 0 };
      });

      items.sort((a, b) => a.top - b.top);
      let nextMin = headBottom;
      const gap = 12;
      items.forEach((item) => {
        item.top = Math.max(item.top, nextMin);
        item.el.style.top = `${Math.round(item.top)}px`;
        item.el.style.visibility = '';
        nextMin = item.top + item.height + gap;
      });

      sidebarBody.style.minHeight = `${Math.max(0, Math.ceil(nextMin))}px`;
    });
  },

  captureProjectBodySelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const rich = el?.closest?.('.project-card.is-view .project-view-rich[data-comment-field]');
    if (!rich || !rich.contains(range.commonAncestorContainer)) return null;

    const quote = String(sel.toString() || '').replace(/\s+/g, ' ').trim();
    if (!quote) return null;

    const card = rich.closest('.project-card');
    const projectId = card?.dataset.id;
    const field = rich.dataset.commentField === 'timeline' ? 'timeline' : 'description';
    if (!projectId) return null;

    const rawFull = rich.textContent || '';
    const rawQuote = sel.toString();
    let idx = -1;
    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(rich);
      preRange.setEnd(range.startContainer, range.startOffset);
      idx = preRange.toString().length;
    } catch {
      idx = rawFull.indexOf(rawQuote);
    }
    const prefix = rawFull.slice(Math.max(0, idx - 40), idx);
    const suffix = rawFull.slice(idx + rawQuote.length, idx + rawQuote.length + 40);

    return {
      projectId,
      field,
      quote: rawQuote.replace(/\s+/g, ' ').trim() || quote,
      prefix,
      suffix,
      rect: range.getBoundingClientRect(),
    };
  },

  ensureProjectCommentFab() {
    let fab = document.getElementById('projectCommentFab');
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = 'projectCommentFab';
    fab.type = 'button';
    fab.className = 'project-comment-fab hidden';
    fab.title = '添加相关面试题';
    fab.innerHTML =
      '<svg class="project-comment-fab-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onProjectCommentFabClick();
    });
    document.body.appendChild(fab);
    return fab;
  },

  showProjectCommentFab(rect) {
    const fab = this.ensureProjectCommentFab();
    if (!rect) return;
    fab.classList.remove('hidden');
    // 选区右上方
    const size = 36;
    const top = window.scrollY + rect.top - size - 6;
    const left = window.scrollX + rect.right - size / 2;
    fab.style.top = `${Math.max(8, top)}px`;
    fab.style.left = `${Math.max(8, left)}px`;
  },

  hideProjectCommentFab() {
    document.getElementById('projectCommentFab')?.classList.add('hidden');
  },

  onProjectCommentFabClick() {
    const pending = this._pendingBodyComment;
    this.hideProjectCommentFab();
    if (!pending) return;
    // 保留 compose 状态用于正文草稿高亮；保存/取消后清除
    this._commentPanelState = { mode: 'compose', pending };
    this._activeBodyCommentId = null;
    this.setProjectCommentSidebarOpen(pending.projectId, true);
    this.render();
    this.openModal('core', 'bagu', null, {
      linkBodyComment: { mode: 'compose', pending },
      linkProject: { deptId: 'core', moduleId: 'project', projectId: pending.projectId },
    });
  },

  /** 划词相关面试题：复用八股添加/编辑弹窗 */
  openProjectBodyCommentBaguModal(linkBodyComment, existingData = null) {
    if (!linkBodyComment?.projectId && !linkBodyComment?.pending?.projectId) return;
    const projectId = linkBodyComment.projectId || linkBodyComment.pending?.projectId;
    this.setProjectCommentSidebarOpen(projectId, true);
    this.openModal('core', 'bagu', existingData, {
      linkBodyComment,
      linkProject: { deptId: 'core', moduleId: 'project', projectId },
    });
  },

  applyLinkBodyCommentAfterBaguSave(options, entry, createdOrUpdatedId, isEdit) {
    const lb = options?.linkBodyComment;
    if (!lb) return;
    const title = String(entry?.title || '').trim();
    if (lb.mode === 'compose' && lb.pending) {
      const projectId = lb.pending.projectId;
      this.linkBaguToProject(projectId, createdOrUpdatedId);
      const created = Store.addProjectBodyComment(projectId, {
        ...lb.pending,
        text: title,
        baguId: createdOrUpdatedId,
      });
      this._commentPanelState = null;
      this._pendingBodyComment = null;
      this._activeBodyCommentId = created?.id || null;
      this.setProjectCommentSidebarOpen(projectId, true);
      return;
    }
    if (lb.mode === 'add-question') {
      this.linkBaguToProject(lb.projectId, createdOrUpdatedId);
      Store.addProjectBodyCommentQuestion(lb.projectId, lb.commentId, {
        text: title,
        baguId: createdOrUpdatedId,
      });
      this._commentPanelState = null;
      this._activeBodyCommentId = lb.commentId;
      this.setProjectCommentSidebarOpen(lb.projectId, true);
      return;
    }
    if (lb.mode === 'edit') {
      this.linkBaguToProject(lb.projectId, createdOrUpdatedId);
      Store.updateProjectBodyCommentQuestion(lb.projectId, lb.commentId, lb.questionId, {
        text: title,
        baguId: createdOrUpdatedId,
      });
      this._commentPanelState = null;
      this._activeBodyCommentId = lb.commentId;
      this.setProjectCommentSidebarOpen(lb.projectId, true);
    }
  },

  normalizeProjectRecord(record) {
    return {
      ...record,
      name: record.name || record.project || '',
      role: record.role || '',
      startDate: record.startDate || '',
      endDate: record.endDate || '',
      ongoing: Boolean(record.ongoing),
      description: record.description || record.output || record.note || '',
      timeline: record.timeline || '',
      relatedBaguIds: Array.isArray(record.relatedBaguIds)
        ? record.relatedBaguIds.filter(Boolean)
        : [],
      descTips: Array.isArray(record.descTips) ? record.descTips : [],
      bodyComments: Array.isArray(record.bodyComments) ? record.bodyComments : [],
    };
  },

  getProjectRelatedBaguRecords(project) {
    const ids = this.normalizeProjectRecord(project).relatedBaguIds;
    if (!ids.length) return [];
    const map = new Map(Store.getRawRecords('core', 'bagu').map((r) => [r.id, r]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  },

  linkBaguToProject(projectId, baguId) {
    if (!projectId || !baguId) return;
    const project = Store.getRecord('core', 'project', projectId);
    if (!project) return;
    const ids = [...(project.relatedBaguIds || [])];
    if (ids.includes(baguId)) return;
    ids.push(baguId);
    Store.updateRecord('core', 'project', projectId, { relatedBaguIds: ids });
  },

  unlinkBaguFromProject(projectId, baguId) {
    if (!projectId || !baguId) return;
    const project = Store.getRecord('core', 'project', projectId);
    if (!project) return;
    const ids = (project.relatedBaguIds || []).filter((id) => id !== baguId);
    Store.updateRecord('core', 'project', projectId, { relatedBaguIds: ids });
  },

  unlinkBaguFromAllProjects(baguId) {
    if (!baguId) return;
    Store.getRawRecords('core', 'project').forEach((project) => {
      const ids = project.relatedBaguIds || [];
      if (!ids.includes(baguId)) return;
      Store.updateRecord('core', 'project', project.id, {
        relatedBaguIds: ids.filter((id) => id !== baguId),
      });
    });
  },

  renderProjectPage(deptId, moduleId, mod, dept) {
    const records = Store.getSortedRecords(deptId, moduleId).map((r) => this.normalizeProjectRecord(r));

    return `
      ${this.renderModuleTabs(dept, moduleId)}
      <div class="module-page module-page-project">
        <div class="project-page-head">
          <div class="project-page-title-wrap">
            <span class="project-page-accent"></span>
            <h3 class="project-page-title">项目经历</h3>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btnAddProject">+ 添加项目经历</button>
        </div>
        <div class="project-card-list" id="projectCardList">
          ${
            records.length
              ? records.map((r, i) => this.renderProjectCard(r, deptId, moduleId, i, records.length)).join('')
              : '<div class="empty-state empty-inline project-empty">还没有项目经历，点右上角「添加项目经历」开始</div>'
          }
        </div>
      </div>`;
  },

  renderProjectCard(record, deptId, moduleId, index, total) {
    const id = record.id;
    const editing = this.isProjectEditing(id);
    if (editing) return this.renderProjectCardEdit(record, deptId, moduleId, index, total);
    return this.renderProjectCardView(record, deptId, moduleId, index, total);
  },

  renderProjectCardActions(index, total, editing) {
    if (!editing) {
      return `
      <div class="project-card-actions">
        <button type="button" class="btn btn-ghost btn-xs btn-project-edit" title="编辑">编辑 <span class="project-edit-chevron">▾</span></button>
      </div>`;
    }
    return `
      <div class="project-card-actions">
        <button type="button" class="btn btn-ghost btn-xs btn-project-up" ${index === 0 ? 'disabled' : ''} title="上移">上移</button>
        <button type="button" class="btn btn-ghost btn-xs btn-project-down" ${index >= total - 1 ? 'disabled' : ''} title="下移">下移</button>
        <button type="button" class="btn btn-primary btn-xs btn-project-done" title="完成编辑">完成</button>
        <button type="button" class="btn btn-danger-ghost btn-xs btn-project-delete" title="删除">删除</button>
      </div>`;
  },

  isProjectRelatedCollapsed(projectId) {
    this.projectRelatedCollapsed = this.projectRelatedCollapsed || new Set();
    return this.projectRelatedCollapsed.has(projectId);
  },

  toggleProjectRelatedCollapsed(projectId) {
    this.projectRelatedCollapsed = this.projectRelatedCollapsed || new Set();
    if (this.projectRelatedCollapsed.has(projectId)) this.projectRelatedCollapsed.delete(projectId);
    else this.projectRelatedCollapsed.add(projectId);
  },

  renderProjectRelatedBaguSection(project, editing = false) {
    const projectId = project.id;
    const related = this.getProjectRelatedBaguRecords(project);
    const collapsed = this.isProjectRelatedCollapsed(projectId);
    const listHtml = related.length
      ? related.map((q) => this.renderProjectBaguRow(q, projectId, editing)).join('')
      : `<p class="project-view-empty">${editing ? '还没有关联面试题，可添加新题或从八股题库选择' : '暂无相关面试题'}</p>`;

    const actionsHtml = editing
      ? `<div class="project-related-actions">
            <button type="button" class="btn btn-primary btn-xs btn-project-add-bagu" data-project-id="${projectId}">+ 添加题目</button>
            <button type="button" class="btn btn-ghost btn-xs btn-project-pick-bagu" data-project-id="${projectId}">从题库选择</button>
          </div>`
      : '';

    return `
      <section class="project-view-section project-related-bagu ${collapsed ? 'is-collapsed' : ''}" data-project-id="${projectId}">
        <div class="project-related-head">
          <button type="button" class="project-related-toggle" data-project-id="${projectId}" title="${collapsed ? '展开' : '折叠'}">
            <span class="project-related-chevron">›</span>
            <h5 class="project-view-section-title">相关面试题</h5>
            <span class="project-related-count">${related.length}</span>
          </button>
          ${actionsHtml}
        </div>
        <div class="project-related-body">
          <div class="project-related-list bagu-question-list">
            ${listHtml}
          </div>
        </div>
      </section>`;
  },

  renderProjectBaguRow(record, projectId, editing = false) {
    const bank = getBaguBank(record.bank);
    const diff = record.difficulty || '';
    const diffClass =
      diff === '简单' ? 'lc-diff-easy' : diff === '困难' ? 'lc-diff-hard' : diff === '中等' ? 'lc-diff-medium' : '';

    const manageBtns = editing
      ? `<button type="button" class="btn btn-ghost btn-sm btn-project-edit-bagu" title="编辑题目">编辑</button>
        <button type="button" class="icon-btn btn-unlink-project-bagu" title="取消关联">×</button>`
      : '';

    return `
      <div class="bagu-question-row project-bagu-row" data-dept="core" data-module="bagu" data-id="${record.id}" data-project-id="${projectId}">
        <div class="bagu-question-main">
          <span class="bagu-question-title">${this.escapeHtml(record.title || '未命名题目')}</span>
          ${bank ? `<span class="project-bagu-bank">${this.escapeHtml(bank.name)}</span>` : ''}
        </div>
        ${diff ? `<span class="lc-diff ${diffClass}">${this.escapeHtml(diff)}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm btn-view-bagu-answer">查看答案</button>
        ${manageBtns}
      </div>`;
  },

  renderProjectCardView(record, deptId, moduleId, index, total) {
    const id = record.id;
    const name = record.name || '未命名项目';
    const role = record.role || '未填角色';
    const period = this.formatProjectPeriod(record);
    const comments = Store.getProjectBodyComments(id);
    const sidebarOpen = this.isProjectCommentSidebarOpen(id);
    const reserveSidebar = this.shouldReserveProjectCommentSidebar(id, comments);
    const questionCount = this.countProjectBodyQuestions(comments);
    const descHtml = this.isRichEmpty(record.description)
      ? '<p class="project-view-empty">暂无项目描述</p>'
      : `<div class="project-view-rich ql-editor" data-comment-field="description">${this.applyProjectBodyComments(record.description, comments, 'description')}</div>`;

    return `
      <article class="project-card is-view ${reserveSidebar ? 'has-comment-sidebar' : ''}" data-dept="${deptId}" data-module="${moduleId}" data-id="${id}">
        <div class="project-card-top">
          <div class="project-card-label">项目经历 ${index + 1}</div>
          <div class="project-card-top-right">
            ${this.renderProjectCommentSidebarLauncher(id, questionCount, sidebarOpen || reserveSidebar)}
            ${this.renderProjectCardActions(index, total, false)}
          </div>
        </div>
        <div class="project-card-body-layout">
          <div class="project-card-main">
            <div class="project-view-head">
              <h4 class="project-view-name">${this.escapeHtml(name)}</h4>
              <p class="project-view-meta">${this.escapeHtml(role)} · ${this.escapeHtml(period)}</p>
            </div>
            <section class="project-view-section">
              <div class="project-section-title-row">
                <h5 class="project-view-section-title">项目描述</h5>
                ${this.renderProjectDescTipsBtn(id)}
              </div>
              ${descHtml}
            </section>
            ${
              this.isRichEmpty(record.timeline)
                ? `<section class="project-view-section">
              <div class="project-section-title-row">
                <h5 class="project-view-section-title">时间线梳理</h5>
                ${this.renderProjectTimelineHelpBtn()}
              </div>
              <p class="project-view-empty">暂无时间线</p>
            </section>`
                : this.renderProjectTimelineViewSection(record.timeline, id, comments)
            }
          </div>
          ${this.renderProjectCommentSidebar(id, comments)}
        </div>
      </article>`;
  },

  renderProjectCardEdit(record, deptId, moduleId, index, total) {
    const id = record.id;
    const ongoing = Boolean(record.ongoing);
    return `
      <article class="project-card is-edit" data-dept="${deptId}" data-module="${moduleId}" data-id="${id}">
        <div class="project-card-top">
          <div class="project-card-label">项目经历 ${index + 1}</div>
          ${this.renderProjectCardActions(index, total, true)}
        </div>
        <div class="project-card-meta">
          <div class="form-group project-field">
            <label>项目名称</label>
            <input type="text" class="project-input" name="name" value="${this.escapeHtml(record.name)}" placeholder="如 蔚来车主智能出行助手 Agent">
          </div>
          <div class="form-group project-field">
            <label>项目角色</label>
            <input type="text" class="project-input" name="role" value="${this.escapeHtml(record.role)}" placeholder="如 Agent 开发实习生">
          </div>
          <div class="form-group project-field project-field-time">
            <label>项目时间</label>
            <div class="project-time-row">
              <input type="month" class="project-input" name="startDate" value="${this.escapeHtml(record.startDate)}">
              <span class="range-sep">-</span>
              <input type="month" class="project-input" name="endDate" value="${this.escapeHtml(record.endDate)}" ${ongoing ? 'disabled' : ''}>
              <label class="project-ongoing"><input type="checkbox" name="ongoing" ${ongoing ? 'checked' : ''}><span>至今</span></label>
            </div>
          </div>
        </div>
        <div class="form-group form-group-rich project-rich">
          <div class="project-section-title-row">
            <label>项目描述</label>
            ${this.renderProjectDescTipsBtn(id)}
          </div>
          <input type="hidden" name="description" id="projectDescInput-${id}" value="">
          <div class="rich-editor-shell project-editor-shell">
            <div class="rich-editor-host" id="projectDescHost-${id}"></div>
          </div>
        </div>
        <div class="form-group form-group-rich project-rich">
          <div class="project-section-title-row">
            <label>时间线梳理</label>
            ${this.renderProjectTimelineHelpBtn()}
          </div>
          <input type="hidden" name="timeline" id="projectTimelineInput-${id}" value="">
          <div class="rich-editor-shell project-editor-shell">
            <div class="rich-editor-host" id="projectTimelineHost-${id}"></div>
          </div>
          <p class="form-hint">按时间节点梳理：需求 → 方案 → 开发 → 上线 → 复盘，便于面试讲述</p>
        </div>
        ${this.renderProjectRelatedBaguSection(record, true)}
      </article>`;
  },

  mountProjectEditors(records) {
    RichEditor.destroyAll();
    let timer = null;
    const scheduleSave = (card) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (card) this.saveProjectCard(card);
      }, 500);
    };
    const opts = {
      toolbar: this.projectEditorToolbar,
      placeholder: '支持加粗、高亮、字体颜色、引用、代码块、列表…',
    };
    records.forEach((record) => {
      const r = this.normalizeProjectRecord(record);
      if (!this.isProjectEditing(r.id)) return;
      const card = () => document.querySelector(`.project-card[data-id="${r.id}"]`);
      RichEditor.mount(`projectDescHost-${r.id}`, `projectDescInput-${r.id}`, r.description, {
        ...opts,
        onChange: () => scheduleSave(card()),
      });
      RichEditor.mount(`projectTimelineHost-${r.id}`, `projectTimelineInput-${r.id}`, r.timeline, {
        ...opts,
        placeholder: '按时间线写下关键节点与你的贡献…',
        onChange: () => scheduleSave(card()),
      });
    });
  },

  collectProjectCardData(card) {
    const get = (name) => card.querySelector(`[name="${name}"]`);
    const ongoing = Boolean(get('ongoing')?.checked);
    return {
      name: get('name')?.value?.trim() || '',
      role: get('role')?.value?.trim() || '',
      startDate: get('startDate')?.value || '',
      endDate: ongoing ? '' : get('endDate')?.value || '',
      ongoing,
      description: get('description')?.value || '',
      timeline: get('timeline')?.value || '',
    };
  },

  saveProjectCard(card) {
    if (!card?.classList.contains('is-edit')) return;
    RichEditor.syncAll();
    const { dept, module: moduleId, id } = card.dataset;
    const entry = this.collectProjectCardData(card);
    Store.updateRecord(dept, moduleId, id, entry);
  },

  openProjectBaguPicker(projectId) {
    const project = Store.getRecord('core', 'project', projectId);
    if (!project) return;
    const linked = new Set(project.relatedBaguIds || []);
    const questions = Store.getRawRecords('core', 'bagu').slice().sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'zh')
    );

    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '从八股题库选择';
    const form = document.getElementById('recordForm');
    form.innerHTML = questions.length
      ? `<div class="project-bagu-picker-list">
          ${questions
            .map((q) => {
              const bank = getBaguBank(q.bank);
              const checked = linked.has(q.id);
              return `
            <label class="project-bagu-picker-item ${checked ? 'is-linked' : ''}">
              <input type="checkbox" value="${q.id}" ${checked ? 'checked' : ''}>
              <span class="project-bagu-picker-main">
                <span class="project-bagu-picker-title">${this.escapeHtml(q.title || '未命名题目')}</span>
                <span class="project-bagu-picker-meta">${this.escapeHtml([bank?.name, q.category, q.difficulty].filter(Boolean).join(' · '))}</span>
              </span>
            </label>`;
            })
            .join('')}
        </div>`
      : '<div class="empty-state empty-inline">题库还没有题目，请先「添加题目」</div>';

    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.remove('hidden');
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.textContent = '确认关联';
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');

    form.onsubmit = (e) => {
      e.preventDefault();
      const selected = [...form.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
      Store.updateRecord('core', 'project', projectId, { relatedBaguIds: selected });
      this.closeModal();
      this.render();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  bindProjectRelatedBagu(deptId, moduleId) {
    document.querySelectorAll('.project-related-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleProjectRelatedCollapsed(btn.dataset.projectId);
        this.render();
      });
    });

    document.querySelectorAll('.btn-project-add-bagu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.project-card.is-edit').forEach((card) => this.saveProjectCard(card));
        this.openModal('core', 'bagu', null, {
          linkProject: { deptId, moduleId, projectId: btn.dataset.projectId },
        });
      });
    });

    document.querySelectorAll('.btn-project-pick-bagu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.project-card.is-edit').forEach((card) => this.saveProjectCard(card));
        this.openProjectBaguPicker(btn.dataset.projectId);
      });
    });

    document.querySelectorAll('.project-bagu-row .btn-view-bagu-answer').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.project-bagu-row');
        if (!row) return;
        const record = Store.getRecord('core', 'bagu', row.dataset.id);
        if (!record) return;
        this.openBaguAnswerModal('core', 'bagu', record, {
          linkProject: { deptId, moduleId, projectId: row.dataset.projectId },
        });
      });
    });

    document.querySelectorAll('.btn-project-edit-bagu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.project-bagu-row');
        if (!row) return;
        const record = Store.getRecord('core', 'bagu', row.dataset.id);
        if (!record) return;
        document.querySelectorAll('.project-card.is-edit').forEach((card) => this.saveProjectCard(card));
        this.openModal('core', 'bagu', record, {
          linkProject: { deptId, moduleId, projectId: row.dataset.projectId },
        });
      });
    });

    document.querySelectorAll('.btn-unlink-project-bagu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.project-bagu-row');
        if (!row) return;
        this.unlinkBaguFromProject(row.dataset.projectId, row.dataset.id);
        this.render();
      });
    });
  },

  buildProjectTimelineOutline(html, projectId = '') {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');
    const items = [];
    const prefix = `tl-${String(projectId || 'p').replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const pushItem = (el, level, index, key) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const id = `${prefix}-${key}-${index}`;
      el.setAttribute('id', id);
      items.push({ id, level, text });
    };

    let headingIndex = 0;
    wrap.querySelectorAll('h1, h2, h3, .ql-header-1, .ql-header-2, .ql-header-3').forEach((el) => {
      let level = 2;
      if (/^H[1-3]$/.test(el.tagName)) level = Number(el.tagName[1]);
      else if (el.classList.contains('ql-header-1')) level = 1;
      else if (el.classList.contains('ql-header-2')) level = 2;
      else if (el.classList.contains('ql-header-3')) level = 3;
      pushItem(el, level, headingIndex, 'h');
      headingIndex += 1;
    });

    if (!items.length) {
      let strongIndex = 0;
      wrap.querySelectorAll('p').forEach((p) => {
        const strong = p.querySelector(':scope > strong');
        if (!strong) return;
        const text = (strong.textContent || '').replace(/\s+/g, ' ').trim();
        const full = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || full.length > 60) return;
        if (full.indexOf(text) > 8) return;
        pushItem(p, 2, strongIndex, 's');
        strongIndex += 1;
      });
    }

    return { html: wrap.innerHTML, items };
  },

  isTimelineOutlineVisible(projectId) {
    this.timelineOutlineVisible = this.timelineOutlineVisible || {};
    if (this.timelineOutlineVisible[projectId] === undefined) return true;
    return Boolean(this.timelineOutlineVisible[projectId]);
  },

  setTimelineOutlineVisible(projectId, visible) {
    this.timelineOutlineVisible = this.timelineOutlineVisible || {};
    this.timelineOutlineVisible[projectId] = Boolean(visible);
  },

  scrollTimelineToOutlineTarget(section, targetId) {
    if (!section || !targetId) return;
    const target =
      section.querySelector(`#${CSS.escape(targetId)}`) ||
      document.getElementById(targetId);
    if (!target) return;

    const main = section.querySelector('.project-timeline-main');
    const canScrollMain = main && main.scrollHeight > main.clientHeight + 2;

    if (canScrollMain) {
      const top =
        target.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 8;
      main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }

    section.querySelectorAll('.project-timeline-outline-item').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.target === targetId);
    });
  },

  expandProjectTimelineSection(section) {
    const wrap = section?.querySelector('.project-collapse');
    if (!wrap || !wrap.classList.contains('is-collapsed')) return false;
    const topBtn = section.querySelector('.project-collapse-toggle-top');
    const bottomBtn = section.querySelector('.project-collapse-toggle-bottom');
    wrap.classList.add('is-expanded');
    wrap.classList.remove('is-collapsed');
    section.classList.add('is-timeline-expanded');
    topBtn?.classList.remove('hidden');
    bottomBtn?.classList.add('hidden');
    topBtn?.setAttribute('aria-expanded', 'true');
    bottomBtn?.setAttribute('aria-expanded', 'true');
    return true;
  },

  renderTimelineOutlineEyeIcon(visible) {
    // visible=true：睁眼（点击隐藏）；false：闭眼（点击展开）
    if (visible) {
      return `<svg class="project-outline-eye-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
      </svg>`;
    }
    return `<svg class="project-outline-eye-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M3.3 2.6 2 3.9l3.1 3.1C3.1 8.2 1.5 9.9.8 12c1.7 3.9 6 7 11.2 7 1.8 0 3.5-.4 5-1.1l2.9 2.9 1.3-1.3L3.3 2.6zM12 17c-3.7 0-6.9-2-8.6-5 .7-1.3 1.8-2.5 3.1-3.3l1.7 1.7A5 5 0 0 0 12 17zm0-10a5 5 0 0 1 4.9 4l2.3 2.3c.5-.7.9-1.5 1.2-2.3C18.9 7 14.7 5 12 5c-.7 0-1.4.1-2 .2L11.5 7c.2 0 .3-.1.5-.1z"/>
    </svg>`;
  },

  renderProjectTimelineOutline(items, projectId, visible) {
    if (!items.length) return '';
    const title = visible ? '隐藏大纲' : '展开大纲';
    return `
      <aside class="project-timeline-outline ${visible ? '' : 'is-collapsed'}" aria-label="时间线大纲">
        <div class="project-timeline-outline-head">
          <div class="project-timeline-outline-title">大纲</div>
          <button type="button" class="project-outline-eye-btn btn-timeline-outline-toggle" data-project-id="${projectId}" title="${title}" aria-label="${title}">
            ${this.renderTimelineOutlineEyeIcon(visible)}
          </button>
        </div>
        ${
          visible
            ? `<nav class="project-timeline-outline-nav">
          ${items
            .map(
              (item) => `
            <button type="button" class="project-timeline-outline-item level-${item.level}" data-target="${this.escapeHtml(item.id)}" title="${this.escapeHtml(item.text)}">
              ${this.escapeHtml(item.text)}
            </button>`
            )
            .join('')}
        </nav>`
            : ''
        }
      </aside>`;
  },

  renderProjectTimelineViewSection(html, projectId, comments = null) {
    const { html: markedHtml, items } = this.buildProjectTimelineOutline(html, projectId);
    const outlineVisible = this.isTimelineOutlineVisible(projectId) && items.length > 0;
    const bodyComments = comments || Store.getProjectBodyComments(projectId);
    const richHtml = this.applyProjectBodyComments(markedHtml, bodyComments, 'timeline');

    return `
      <section class="project-view-section project-timeline-section ${outlineVisible ? 'has-outline' : 'outline-hidden'}" data-collapse-key="timeline-${projectId}" data-project-id="${projectId}">
        <div class="project-section-title-row">
          <h5 class="project-view-section-title">时间线梳理</h5>
          <div class="project-section-title-actions">
            <button type="button" class="project-collapse-toggle project-collapse-toggle-top hidden" aria-expanded="false">收起下文</button>
            ${this.renderProjectTimelineHelpBtn()}
          </div>
        </div>
        <div class="project-collapse is-collapsed">
          <div class="project-collapse-body">
            <div class="project-timeline-layout">
              ${this.renderProjectTimelineOutline(items, projectId, outlineVisible)}
              <div class="project-timeline-main">
                <div class="project-view-rich ql-editor" data-comment-field="timeline">${richHtml}</div>
              </div>
            </div>
          </div>
          <div class="project-collapse-footer">
            <button type="button" class="project-collapse-toggle project-collapse-toggle-bottom hidden" aria-expanded="false">展示全文</button>
          </div>
        </div>
      </section>`;
  },

  bindProjectTimelineOutline() {
    document.querySelectorAll('.btn-timeline-outline-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        const next = !this.isTimelineOutlineVisible(projectId);
        this.setTimelineOutlineVisible(projectId, next);
        this.render();
      });
    });

    document.querySelectorAll('.project-timeline-outline-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = btn.closest('.project-timeline-section');
        const targetId = btn.dataset.target;
        if (!section || !targetId) return;

        const didExpand = this.expandProjectTimelineSection(section);
        const jump = () => this.scrollTimelineToOutlineTarget(section, targetId);
        if (didExpand) {
          // 等展开后的独立滚轴布局生效再跳转
          requestAnimationFrame(() => requestAnimationFrame(jump));
        } else {
          jump();
        }
      });
    });
  },

  bindProjectCollapses() {
    const maxCollapsed = 280;
    document.querySelectorAll('.project-timeline-section').forEach((section) => {
      const wrap = section.querySelector('.project-collapse');
      const body = wrap?.querySelector('.project-collapse-body');
      const topBtn = section.querySelector('.project-collapse-toggle-top');
      const bottomBtn = section.querySelector('.project-collapse-toggle-bottom');
      if (!wrap || !body || !topBtn || !bottomBtn) return;

      wrap.classList.add('is-collapsed');
      wrap.classList.remove('is-expanded');
      section.classList.remove('is-timeline-expanded');
      const needsToggle = body.scrollHeight > maxCollapsed + 8;
      if (!needsToggle) {
        wrap.classList.remove('is-collapsed', 'is-expanded');
        topBtn.classList.add('hidden');
        bottomBtn.classList.add('hidden');
        return;
      }

      const sync = (expanded) => {
        wrap.classList.toggle('is-expanded', expanded);
        wrap.classList.toggle('is-collapsed', !expanded);
        section.classList.toggle('is-timeline-expanded', expanded);
        topBtn.classList.toggle('hidden', !expanded);
        bottomBtn.classList.toggle('hidden', expanded);
        topBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        bottomBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      };

      sync(false);

      const onToggle = (e) => {
        e.stopPropagation();
        sync(!wrap.classList.contains('is-expanded'));
      };
      topBtn.addEventListener('click', onToggle);
      bottomBtn.addEventListener('click', onToggle);
    });
  },


  bindProjectBodyComments() {
    this.ensureProjectCommentFab();

    const onSelect = () => {
      if (this._commentPanelState?.mode === 'compose' || this._commentPanelState?.mode === 'edit') return;
      const pending = this.captureProjectBodySelection();
      if (!pending) {
        this.hideProjectCommentFab();
        return;
      }
      this._pendingBodyComment = pending;
      this.showProjectCommentFab(pending.rect);
    };

    document.querySelectorAll('.project-card.is-view .project-view-rich[data-comment-field]').forEach((rich) => {
      rich.addEventListener('mouseup', () => setTimeout(onSelect, 0));
    });

    document.querySelectorAll('.project-comment-mark[data-comment-id], .project-comment-bubble[data-comment-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const commentId = el.dataset.commentId;
        const projectId = el.closest('.project-card')?.dataset.id;
        if (!projectId || !commentId) return;
        this._activeBodyCommentId = commentId;
        this._commentPanelState = null;
        this.setProjectCommentSidebarOpen(projectId, true);
        this.render();
        setTimeout(() => this.alignProjectCommentSidebar(projectId), 0);
      });
    });

    document.querySelectorAll('.btn-collapse-project-comment-sidebar, .project-comment-sidebar.is-open > .project-comment-sidebar-head .project-comment-sidebar-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const projectId =
          btn.dataset.projectId || btn.closest('.project-comment-sidebar')?.dataset.projectId;
        if (!projectId) return;
        if (
          this._commentPanelState?.pending?.projectId === projectId ||
          this._commentPanelState?.projectId === projectId
        ) {
          this._commentPanelState = null;
        }
        this.setProjectCommentSidebarOpen(projectId, false);
        this._activeBodyCommentId = null;
        this.render();
      });
    });

    document.querySelectorAll('.project-comment-sidebar-rail-btn, .project-comment-sidebar-launcher').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        if (!projectId) return;
        this.setProjectCommentSidebarOpen(projectId, true);
        this.render();
        setTimeout(() => this.alignProjectCommentSidebar(projectId), 0);
      });
    });

    document.querySelectorAll('.project-comment-side-card').forEach((cardEl) => {
      cardEl.addEventListener('click', (e) => {
        if (e.target.closest('.project-comment-more-wrap')) return;
        if (e.target.closest('.btn-side-comment-collapse')) return;
        if (e.target.closest('.btn-side-comment-add-q')) return;
        if (cardEl.classList.contains('is-compose')) return;
        const commentId = cardEl.dataset.commentId;
        const projectId = cardEl.closest('.project-card')?.dataset.id;
        if (!projectId || !commentId) return;
        this._activeBodyCommentId = commentId;
        document.querySelectorAll(`.project-card[data-id="${projectId}"] .project-comment-mark`).forEach((m) => {
          m.classList.toggle('is-active', m.dataset.commentId === commentId);
        });
        document.querySelectorAll(`.project-card[data-id="${projectId}"] .project-comment-bubble`).forEach((b) => {
          b.classList.toggle('is-active', b.dataset.commentId === commentId);
        });
        document.querySelectorAll(`.project-card[data-id="${projectId}"] .project-comment-side-card`).forEach((c) => {
          c.classList.toggle('is-active', c.dataset.commentId === commentId);
        });
        document
          .querySelector(`.project-card[data-id="${projectId}"] .project-comment-mark[data-comment-id="${commentId}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });

    document.querySelectorAll('.btn-side-comment-collapse').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardEl = btn.closest('.project-comment-side-card');
        const projectId = cardEl?.closest('.project-card')?.dataset.id;
        const commentId = cardEl?.dataset.commentId;
        if (!projectId || !commentId) return;
        const comment = Store.getProjectBodyComments(projectId).find((c) => c.id === commentId);
        if (!comment) return;
        Store.updateProjectBodyComment(projectId, commentId, { collapsed: !comment.collapsed });
        this.render();
      });
    });

    document.querySelectorAll('.btn-side-comment-add-q').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = btn.closest('.project-card')?.dataset.id;
        const commentId = btn.dataset.commentId || btn.closest('.project-comment-side-card')?.dataset.commentId;
        if (!projectId || !commentId) return;
        this._activeBodyCommentId = commentId;
        this.setProjectCommentSidebarOpen(projectId, true);
        this.openProjectBodyCommentBaguModal({
          mode: 'add-question',
          projectId,
          commentId,
        });
      });
    });

    document.querySelectorAll('.btn-side-comment-more').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.project-comment-more-wrap');
        document.querySelectorAll('.project-comment-menu').forEach((menu) => {
          if (!wrap.contains(menu)) menu.classList.add('hidden');
        });
        wrap.querySelector('.project-comment-menu')?.classList.toggle('hidden');
      });
    });

    document.querySelectorAll('.btn-side-comment-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.project-comment-more-wrap');
        const row = btn.closest('.project-comment-question-row');
        const cardEl = btn.closest('.project-comment-side-card');
        const projectId = cardEl?.closest('.project-card')?.dataset.id;
        const commentId =
          wrap?.dataset.commentId || row?.dataset.commentId || cardEl?.dataset.commentId;
        const questionId = wrap?.dataset.questionId || row?.dataset.questionId;
        const comment = Store.getProjectBodyComments(projectId).find((c) => c.id === commentId);
        const question = comment?.questions?.find((q) => q.id === questionId);
        if (!comment || !question) return;
        this._activeBodyCommentId = commentId;
        this.setProjectCommentSidebarOpen(projectId, true);
        const bagu = question.baguId ? Store.getRecord('core', 'bagu', question.baguId) : null;
        this.openProjectBodyCommentBaguModal(
          {
            mode: 'edit',
            projectId,
            commentId,
            questionId,
          },
          bagu || { title: question.text || '' }
        );
      });
    });

    document.querySelectorAll('.btn-side-comment-view').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.project-comment-more-wrap');
        const row = btn.closest('.project-comment-question-row');
        const cardEl = btn.closest('.project-comment-side-card');
        const projectId = cardEl?.closest('.project-card')?.dataset.id;
        const commentId =
          wrap?.dataset.commentId || row?.dataset.commentId || cardEl?.dataset.commentId;
        const questionId = wrap?.dataset.questionId || row?.dataset.questionId;
        const comment = Store.getProjectBodyComments(projectId).find((c) => c.id === commentId);
        const question = comment?.questions?.find((q) => q.id === questionId);
        const record = question?.baguId ? Store.getRecord('core', 'bagu', question.baguId) : null;
        if (!record) {
          alert('请先完善答案：可点「编辑」写入，或到八股题库补充后关联。');
          return;
        }
        this.openBaguAnswerModal('core', 'bagu', record, {
          linkProject: { deptId: 'core', moduleId: 'project', projectId },
        });
      });
    });

    document.querySelectorAll('.btn-side-comment-move-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const wrap = btn.closest('.project-comment-more-wrap');
        const row = btn.closest('.project-comment-question-row');
        const projectId = btn.closest('.project-card')?.dataset.id;
        const commentId = wrap?.dataset.commentId || row?.dataset.commentId;
        const questionId = wrap?.dataset.questionId || row?.dataset.questionId;
        if (!projectId || !commentId || !questionId) return;
        Store.moveProjectBodyCommentQuestion(projectId, commentId, questionId, -1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-side-comment-move-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const wrap = btn.closest('.project-comment-more-wrap');
        const row = btn.closest('.project-comment-question-row');
        const projectId = btn.closest('.project-card')?.dataset.id;
        const commentId = wrap?.dataset.commentId || row?.dataset.commentId;
        const questionId = wrap?.dataset.questionId || row?.dataset.questionId;
        if (!projectId || !commentId || !questionId) return;
        Store.moveProjectBodyCommentQuestion(projectId, commentId, questionId, 1);
        this.render();
      });
    });

    document.querySelectorAll('.btn-side-comment-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.project-comment-more-wrap');
        const row = btn.closest('.project-comment-question-row');
        const cardEl = btn.closest('.project-comment-side-card');
        const projectId = cardEl?.closest('.project-card')?.dataset.id;
        const commentId =
          wrap?.dataset.commentId || row?.dataset.commentId || cardEl?.dataset.commentId;
        const questionId = wrap?.dataset.questionId || row?.dataset.questionId;
        const ok = await this.confirmDelete(
          '确定删除这道相关面试题吗？删除后将移入回收箱，满 30 天后自动清除。'
        );
        if (!ok) return;
        const removed = Store.deleteProjectBodyCommentQuestion(projectId, commentId, questionId);
        if (removed?.question?.baguId) this.unlinkBaguFromProject(projectId, removed.question.baguId);
        if (removed?.removedGroup && this._activeBodyCommentId === commentId) {
          this._activeBodyCommentId = null;
        }
        this._commentPanelState = null;
        this.updateRecycleBinNav();
        this.render();
      });
    });

    document.querySelectorAll('.btn-side-comment-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._commentPanelState = null;
        this.render();
      });
    });

    document.querySelectorAll('.btn-side-comment-send').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardEl = btn.closest('.project-comment-side-card');
        const input = cardEl?.querySelector('.project-side-comment-input');
        const bankEl = cardEl?.querySelector('.project-side-comment-bank');
        const text = String(input?.value || '').trim();
        const bank = bankEl?.value || this.defaultBaguBankForProjectComment();
        if (!text) {
          input?.focus();
          return;
        }
        const state = this._commentPanelState;
        if (state?.mode === 'compose') {
          const bagu = Store.addRecord('core', 'bagu', {
            title: text,
            bank,
            difficulty: '中等',
            category: '',
            tags: '',
            approach: '',
            answer: '',
            followUp: '',
          });
          this.linkBaguToProject(state.pending.projectId, bagu.id);
          const created = Store.addProjectBodyComment(state.pending.projectId, {
            ...state.pending,
            text,
            baguId: bagu.id,
          });
          this._commentPanelState = null;
          this._activeBodyCommentId = created?.id || null;
          this.setProjectCommentSidebarOpen(state.pending.projectId, true);
          this.render();
          return;
        }
        if (state?.mode === 'add-question') {
          const bagu = Store.addRecord('core', 'bagu', {
            title: text,
            bank,
            difficulty: '中等',
            category: '',
            tags: '',
            approach: '',
            answer: '',
            followUp: '',
          });
          this.linkBaguToProject(state.projectId, bagu.id);
          Store.addProjectBodyCommentQuestion(state.projectId, state.commentId, {
            text,
            baguId: bagu.id,
          });
          this._commentPanelState = null;
          this._activeBodyCommentId = state.commentId;
          this.render();
          return;
        }
        if (state?.mode === 'edit') {
          const baguId =
            state.bagu?.id ||
            state.comment?.questions?.find((q) => q.id === state.questionId)?.baguId;
          if (baguId) Store.updateRecord('core', 'bagu', baguId, { title: text, bank });
          Store.updateProjectBodyCommentQuestion(state.projectId, state.commentId, state.questionId, {
            text,
          });
          this._commentPanelState = null;
          this._activeBodyCommentId = state.commentId;
          this.render();
        }
      });
    });

    if (!this._projectCommentDocBound) {
      this._projectCommentDocBound = true;
      document.addEventListener('mousedown', (e) => {
        if (e.target.closest('#projectCommentFab')) return;
        if (e.target.closest('.project-comment-more-wrap')) return;
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) this.hideProjectCommentFab();
          if (!e.target.closest('.project-comment-more-wrap')) {
            document.querySelectorAll('.project-comment-menu').forEach((menu) => menu.classList.add('hidden'));
          }
        }, 0);
      });
    }

    requestAnimationFrame(() => {
      document.querySelectorAll('.project-card.is-view.has-comment-sidebar').forEach((card) => {
        this.alignProjectCommentSidebar(card.dataset.id);
      });
    });
  },

  bindProjectPage(deptId, moduleId) {
    const records = Store.getSortedRecords(deptId, moduleId);
    this.mountProjectEditors(records);
    this.bindProjectRelatedBagu(deptId, moduleId);
    this.bindProjectBodyComments();
    this.bindProjectCollapses();
    this.bindProjectTimelineOutline();

    document.querySelectorAll('.btn-project-timeline-help').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openProjectTimelineHelp();
      });
    });

    document.querySelectorAll('.btn-project-desc-tips').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openProjectDescTips(btn.dataset.projectId);
      });
    });

    document.getElementById('btnAddProject')?.addEventListener('click', () => {
      RichEditor.syncAll();
      document.querySelectorAll('.project-card.is-edit').forEach((card) => this.saveProjectCard(card));
      const sort = Store.getModuleSort(deptId, moduleId);
      if (sort.mode !== 'custom') Store.initCustomOrder(deptId, moduleId);
      const created = Store.addRecord(deptId, moduleId, {
        name: '',
        role: '',
        startDate: '',
        endDate: '',
        ongoing: true,
        description: '',
        timeline: '',
        relatedBaguIds: [],
        descTips: [],
        bodyComments: [],
      });
      this.setProjectEditing(created.id, true);
      this.render();
    });

    document.querySelectorAll('.project-card').forEach((card) => {
      const id = card.dataset.id;

      card.querySelector('.btn-project-edit')?.addEventListener('click', () => {
        document.querySelectorAll('.project-card.is-edit').forEach((c) => this.saveProjectCard(c));
        this.setProjectEditing(id, true);
        this.render();
      });

      card.querySelector('.btn-project-done')?.addEventListener('click', () => {
        this.saveProjectCard(card);
        this.setProjectEditing(id, false);
        this.render();
      });

      if (card.classList.contains('is-edit')) {
        const persist = () => this.saveProjectCard(card);

        card.querySelectorAll('.project-input').forEach((input) => {
          input.addEventListener('change', persist);
          input.addEventListener('blur', persist);
        });

        card.querySelector('[name="ongoing"]')?.addEventListener('change', (e) => {
          const endInput = card.querySelector('[name="endDate"]');
          if (endInput) endInput.disabled = e.target.checked;
          persist();
        });
      }

      card.querySelector('.btn-project-up')?.addEventListener('click', () => {
        document.querySelectorAll('.project-card.is-edit').forEach((c) => this.saveProjectCard(c));
        const sort = Store.getModuleSort(deptId, moduleId);
        if (sort.mode !== 'custom') Store.initCustomOrder(deptId, moduleId);
        Store.moveCustomRecord(deptId, moduleId, id, -1);
        this.render();
      });

      card.querySelector('.btn-project-down')?.addEventListener('click', () => {
        document.querySelectorAll('.project-card.is-edit').forEach((c) => this.saveProjectCard(c));
        const sort = Store.getModuleSort(deptId, moduleId);
        if (sort.mode !== 'custom') Store.initCustomOrder(deptId, moduleId);
        Store.moveCustomRecord(deptId, moduleId, id, 1);
        this.render();
      });

      card.querySelector('.btn-project-delete')?.addEventListener('click', () => {
        if (!confirm('确定删除这个项目经历？')) return;
        this.setProjectEditing(id, false);
        Store.deleteRecord(deptId, moduleId, id);
        this.render();
      });
    });
  },

  renderModulePage(deptId, moduleId) {
    const dept = getDepartment(deptId);
    const mod = getModule(deptId, moduleId);
    if (!mod || !dept) return '<div class="empty-state">模块不存在</div>';

    if (mod.recordView === 'leetcode') {
      return this.renderHandwritePage(deptId, moduleId, mod, dept);
    }

    if (mod.recordView === 'bagu') {
      return this.renderBaguPage(deptId, moduleId, mod, dept);
    }

    if (mod.recordView === 'interview') {
      return this.renderInterviewPage(deptId, moduleId, mod, dept);
    }

    if (mod.recordView === 'project') {
      return this.renderProjectPage(deptId, moduleId, mod, dept);
    }

    if (mod.recordView === 'habitChecklist' || mod.recordView === 'weekdayCheckin') {
      const nav =
        dept.layout === 'pages'
          ? this.renderModuleTabs(dept, moduleId)
          : `<button class="back-link" data-back-dept="${deptId}">← 返回 ${this.escapeHtml(dept.name)}</button>`;
      return `
      ${nav}
      <div class="module-page">
        <div class="module-page-head">
          <div class="module-page-intro">
            ${this.renderModuleIcon(mod, 'module-page-icon')}
            <div>
              <h3 class="module-page-title">${this.escapeHtml(mod.name)}</h3>
              <p class="module-page-desc">${this.escapeHtml(mod.desc)}</p>
            </div>
          </div>
          <button type="button" class="icon-btn btn-edit-module" title="编辑模块"
            data-dept="${deptId}" data-module="${moduleId}">✎</button>
        </div>
        ${this.renderHabitBody(deptId, moduleId, mod)}
      </div>`;
    }

    const records = Store.getSortedRecords(deptId, moduleId);
    const sortMode = Store.getModuleSort(deptId, moduleId).mode;

    const nav =
      dept.layout === 'pages'
        ? this.renderModuleTabs(dept, moduleId)
        : `<button class="back-link" data-back-dept="${deptId}">← 返回 ${this.escapeHtml(dept.name)}</button>`;

    return `
      ${nav}
      <div class="module-page">
        <div class="module-page-head">
          <div class="module-page-intro">
            ${this.renderModuleIcon(mod, 'module-page-icon')}
            <div>
              <h3 class="module-page-title">${this.escapeHtml(mod.name)}</h3>
              <p class="module-page-desc">${this.escapeHtml(mod.desc)}</p>
            </div>
          </div>
          <button type="button" class="icon-btn btn-edit-module" title="编辑模块"
            data-dept="${deptId}" data-module="${moduleId}">✎</button>
        </div>
        ${this.renderModuleToolbar(mod, dept)}
        <div class="record-list module-records">
          ${
            records.length
              ? records
                  .map((r) => this.renderRecordItem(mod, r, deptId, moduleId, sortMode))
                  .join('')
              : '<div class="empty-state empty-inline">还没有记录</div>'
          }
        </div>
      </div>
    `;
  },

  renderCards() {
    const cards = Store.getCards();
    if (!cards.length) {
      return '<div class="empty-state empty-cards">还没有卡片，在上方用自然语言添加</div>';
    }
    return cards
      .map((c) => {
        const done = Store.isCardDoneToday(c.id);
        const meta = TYPE_META[c.type] || TYPE_META.habit;
        const streak = (c.checkIns || []).filter((ci) => ci.done).length;
        const habitLine = c.habit ? `${c.habit.frequency === 'weekly' ? '每周' : '每天'} · ${c.habit.action}` : '';
        const goalLine = c.goal
          ? `${c.goal.target}${c.goal.deadline ? ' · 截止 ' + c.goal.deadline : ''}`
          : '';
        return `
          <div class="checkin-card ${done ? 'done' : ''}" data-card-id="${c.id}" style="--card-color:${c.color}">
            <div class="checkin-card-top">
              <span class="checkin-icon">${c.icon}</span>
              <span class="type-badge type-${c.type}">${meta.label}</span>
              <button class="btn-delete card-delete" data-card-id="${c.id}">×</button>
            </div>
            <h4 class="checkin-title">${c.title}</h4>
            ${habitLine ? `<p class="checkin-sub">${habitLine}</p>` : ''}
            ${goalLine && c.type !== 'habit' ? `<p class="checkin-sub goal-line">${goalLine}</p>` : ''}
            <div class="checkin-card-foot">
              <span class="dept-tag">${c.deptName}</span>
              <span class="streak">已打卡 ${streak} 次</span>
            </div>
            <button class="checkin-btn ${done ? 'checked' : ''}" data-card-id="${c.id}">
              ${done ? '✓ 今日已完成' : '打卡'}
            </button>
          </div>`;
      })
      .join('');
  },

  renderRecordItem(mod, record, deptId, moduleId, sortMode = null) {
    if (mod.expandableRecords) {
      return this.renderExpandableRecordItem(mod, record, deptId, moduleId, sortMode);
    }

    const fields = mod.fields
      .filter((f) => record[f.key] !== undefined && record[f.key] !== '')
      .map((f) => {
        let value = record[f.key];
        if (f.key === 'quality' && moduleId === 'sleep') {
          value = `${value}分`;
        }
        return `<span class="record-field"><span class="k">${f.label}</span>${this.escapeHtml(String(value))}</span>`;
      })
      .join('');

    const dateText =
      mod.dateMode === 'datetimeRange' || mod.dateMode === 'datetime'
        ? this.formatDateTimeDisplay(record.date, record)
        : formatDate(record.date);

    const actionAttrs =
      deptId && moduleId
        ? `data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}"`
        : '';

    const reorderBtns =
      !mod.recordMenu && sortMode === 'custom' && actionAttrs
        ? `<div class="record-reorder">
            <button type="button" class="icon-btn btn-record-up" ${actionAttrs} title="上移">↑</button>
            <button type="button" class="icon-btn btn-record-down" ${actionAttrs} title="下移">↓</button>
          </div>`
        : '';

    let actions = '';
    if (mod.recordMenu && actionAttrs) {
      actions = this.renderRecordMoreMenu(actionAttrs, {
        showOrder: true,
        customSort: sortMode === 'custom',
      });
    } else if (mod.editable && actionAttrs) {
      actions = `<div class="record-actions"><button type="button" class="btn-edit" ${actionAttrs}>编辑</button></div>`;
    } else if (actionAttrs) {
      actions = `<button class="btn-delete" ${actionAttrs}>删除</button>`;
    } else {
      actions = `<button class="btn-delete" data-id="${record.id}">删除</button>`;
    }

    return `
      <div class="record-item">
        <div class="date">${dateText}</div>
        <div class="record-fields">${fields || '<span class="record-field">（无详情）</span>'}</div>
        <div class="record-item-actions">
          ${reorderBtns}
          ${actions}
        </div>
      </div>`;
  },

  renderRecordMoreMenu(actionAttrs, options = {}) {
    const opts = typeof options === 'boolean' ? { showOrder: true, customSort: options } : options || {};
    const showOrder = opts.showOrder !== false;
    const customSort = Boolean(opts.customSort);
    return `
      <div class="record-more-wrap">
        <button type="button" class="icon-btn btn-record-more" ${actionAttrs} title="更多" aria-label="更多">⋯</button>
        <div class="record-more-dropdown hidden">
          <button type="button" class="record-more-option btn-edit" ${actionAttrs}>编辑</button>
          <button type="button" class="record-more-option btn-delete" ${actionAttrs}>删除</button>
          ${
            showOrder
              ? `<button type="button" class="record-more-option btn-record-order-toggle">调整顺序</button>
          <div class="record-more-order ${customSort ? '' : 'hidden'}">
            <button type="button" class="record-more-option btn-record-up" ${actionAttrs} data-init-custom="1">上移</button>
            <button type="button" class="record-more-option btn-record-down" ${actionAttrs} data-init-custom="1">下移</button>
          </div>`
              : ''
          }
        </div>
      </div>`;
  },

  renderExpandableRecordItem(mod, record, deptId, moduleId, sortMode = null) {
    this.expandedRecords = this.expandedRecords || new Set();
    const expanded = this.expandedRecords.has(record.id);
    const dateText =
      mod.dateMode === 'datetimeRange' || mod.dateMode === 'datetime'
        ? this.formatDateTimeDisplay(record.date, record)
        : formatDate(record.date);

    const company = this.escapeHtml(record.company || '未填公司');
    const role = record.role ? ` · ${this.escapeHtml(record.role)}` : '';
    const round = this.escapeHtml(record.round || '');
    const result = this.escapeHtml(record.result || '');
    const meta = [round, result].filter(Boolean).join(' · ');

    const detailRows = [
      { label: mod.dateLabel || '日期', value: dateText },
      ...mod.fields
        .filter((f) => record[f.key] !== undefined && record[f.key] !== '')
        .map((f) => ({
          label: f.label,
          value: f.type === 'textarea' ? record[f.key] : record[f.key],
          multiline: f.type === 'textarea',
        })),
    ]
      .map(
        (row) => `
        <div class="record-detail-row">
          <span class="k">${row.label}</span>
          <span class="v${row.multiline ? ' multiline' : ''}">${row.multiline ? this.formatChatContent(row.value) : this.escapeHtml(row.value)}</span>
        </div>`
      )
      .join('');

    const actionAttrs = `data-dept="${deptId}" data-module="${moduleId}" data-id="${record.id}"`;
    const reorderBtns =
      sortMode === 'custom'
        ? `
          <button type="button" class="icon-btn btn-record-up" ${actionAttrs} title="上移">↑</button>
          <button type="button" class="icon-btn btn-record-down" ${actionAttrs} title="下移">↓</button>`
        : '';

    return `
      <div class="record-accordion-item ${expanded ? 'expanded' : ''}" data-record-id="${record.id}">
        <button type="button" class="record-accordion-header">
          <div class="record-summary">
            <span class="record-summary-date">${dateText}</span>
            <span class="record-summary-main">${company}${role}</span>
            ${meta ? `<span class="record-summary-meta">${meta}</span>` : ''}
          </div>
          <div class="record-header-actions">
            ${reorderBtns}
            <span class="record-chevron">›</span>
          </div>
        </button>
        <div class="record-accordion-body">
          <div class="record-detail-grid">${detailRows}</div>
          <div class="record-accordion-actions">
            <button type="button" class="btn btn-ghost btn-sm btn-edit" ${actionAttrs}>编辑</button>
          </div>
        </div>
      </div>`;
  },

  bindRecordAccordions(containerSelector) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;

    this.expandedRecords = this.expandedRecords || new Set();

    root.querySelectorAll('.record-accordion-header').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.icon-btn')) return;
        const item = btn.closest('.record-accordion-item');
        const id = item.dataset.recordId;
        if (this.expandedRecords.has(id)) {
          this.expandedRecords.delete(id);
          item.classList.remove('expanded');
        } else {
          this.expandedRecords.add(id);
          item.classList.add('expanded');
        }
      });
    });
  },

  bindSortMenus(containerSelector) {
    const root = document.querySelector(containerSelector);
    if (!root) return;

    root.querySelectorAll('.btn-sort-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.sort-menu-wrap')?.querySelector('.sort-dropdown');
        const wasOpen = dropdown && !dropdown.classList.contains('hidden');
        document.querySelectorAll('.sort-dropdown').forEach((el) => el.classList.add('hidden'));
        if (dropdown && !wasOpen) dropdown.classList.remove('hidden');
      });
    });

    root.querySelectorAll('.sort-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { dept, module: moduleId, sort } = btn.dataset;
        const mod = getModule(dept, moduleId);
        if (sort === 'custom') {
          Store.initCustomOrder(dept, moduleId);
        } else {
          Store.setModuleSort(dept, moduleId, { mode: sort });
        }
        document.querySelectorAll('.sort-dropdown').forEach((el) => el.classList.add('hidden'));
        this.render();
      });
    });

    if (!this.sortMenuBound) {
      this.sortMenuBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.sort-dropdown').forEach((el) => el.classList.add('hidden'));
      });
    }
  },

  bindCustomReorder(containerSelector) {
    const root = document.querySelector(containerSelector);
    if (!root) return;

    root.querySelectorAll('.btn-record-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { dept, module: moduleId, id } = btn.dataset;
        if (btn.dataset.initCustom === '1') {
          const sort = Store.getModuleSort(dept, moduleId);
          if (sort.mode !== 'custom') Store.initCustomOrder(dept, moduleId);
        }
        Store.moveCustomRecord(dept, moduleId, id, -1);
        this.render();
      });
    });

    root.querySelectorAll('.btn-record-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { dept, module: moduleId, id } = btn.dataset;
        if (btn.dataset.initCustom === '1') {
          const sort = Store.getModuleSort(dept, moduleId);
          if (sort.mode !== 'custom') Store.initCustomOrder(dept, moduleId);
        }
        Store.moveCustomRecord(dept, moduleId, id, 1);
        this.render();
      });
    });
  },

  bindRecordMoreMenus(containerSelector) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;

    root.querySelectorAll('.btn-record-more').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.record-more-wrap')?.querySelector('.record-more-dropdown');
        const wasOpen = dropdown && !dropdown.classList.contains('hidden');
        document.querySelectorAll('.record-more-dropdown').forEach((el) => el.classList.add('hidden'));
        document.querySelectorAll('.sort-dropdown').forEach((el) => el.classList.add('hidden'));
        if (dropdown && !wasOpen) dropdown.classList.remove('hidden');
      });
    });

    root.querySelectorAll('.btn-record-order-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const orderPanel = btn.closest('.record-more-dropdown')?.querySelector('.record-more-order');
        if (!orderPanel) return;
        orderPanel.classList.toggle('hidden');
      });
    });

    if (!this.recordMoreMenuBound) {
      this.recordMoreMenuBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.record-more-dropdown').forEach((el) => el.classList.add('hidden'));
      });
    }
  },

  nowDateTimeLocal() {
    const d = new Date();
    d.setSeconds(0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  },

  toDateTimeLocalValue(record) {
    if (!record) return '';
    if (record.date?.includes('T')) return record.date.slice(0, 16);
    if (record.interviewDate && record.interviewTime) {
      return `${record.interviewDate}T${record.interviewTime.slice(0, 5)}`;
    }
    if (record.interviewDate) return `${record.interviewDate}T09:00`;
    if (record.date) return `${record.date}T09:00`;
    return '';
  },

  toEndTimeValue(record, startLocal = '') {
    if (record?.endTime) return record.endTime.slice(0, 5);
    const start = startLocal || this.toDateTimeLocalValue(record);
    if (!start) return '20:00';
    const d = new Date(start);
    d.setMinutes(d.getMinutes() + 30);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  formatDateTimeDisplay(dateStr, record = null) {
    let raw = dateStr;
    if (!raw?.includes('T') && record?.interviewDate) {
      raw = record.interviewTime
        ? `${record.interviewDate}T${record.interviewTime}`
        : `${record.interviewDate}T00:00`;
    }
    if (!raw) return '';
    const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const endTime = this.toEndTimeValue(record, raw.includes('T') ? raw.slice(0, 16) : '');
    return `${y}/${m}/${day} ${h}:${min} - ${endTime}`;
  },

  bindRecordActions(containerSelector) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;

    root.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const record = Store.getRecord(btn.dataset.dept, btn.dataset.module, btn.dataset.id);
        if (record) this.openModal(btn.dataset.dept, btn.dataset.module, record);
      });
    });

    root.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.dept || !btn.dataset.module) return;
        if (confirm('确定删除这条记录？')) {
          Store.deleteRecord(btn.dataset.dept, btn.dataset.module, btn.dataset.id);
          this.render();
        }
      });
    });
  },


  /* ===== 年历模块 ===== */
  getCalendarViewState() {
    const now = new Date();
    if (this.calendarYear == null) this.calendarYear = now.getFullYear();
    if (this.calendarMonth == null) this.calendarMonth = now.getMonth();
    this.calendarYear = Math.max(1970, Math.min(2100, Number(this.calendarYear) || now.getFullYear()));
    this.calendarMonth = Math.max(0, Math.min(11, this.calendarMonth));
    const year = this.calendarYear;
    const today = todayStr();
    if (!this.calendarViewDate) {
      this.calendarViewDate = today.startsWith(`${year}-`)
        ? today
        : `${year}-${String(this.calendarMonth + 1).padStart(2, '0')}-01`;
    }
    return { year, month: this.calendarMonth, viewDate: this.calendarViewDate };
  },

  formatCalendarMonthLabel(month) {
    return `${month + 1}月`;
  },

  formatCalendarRangeLabel(start, end) {
    if (!start) return '';
    if (!end || start === end) return start;
    return `${start} ~ ${end}`;
  },

  renderYearCalendar() {
    const { year, month, viewDate } = this.getCalendarViewState();
    const today = todayStr();
    const first = new Date(year, month, 1);
    const startWeekday = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      const day = prevDays - startWeekday + i + 1;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ dateStr, day, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, day: d, outside: false });
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length - (startWeekday + daysInMonth) + 1;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, day: d, outside: true });
    }

    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    const gridStart = cells[0]?.dateStr;
    const gridEnd = cells[cells.length - 1]?.dateStr;
    const themeId = Store.getCalendarTheme();
    const themeMeta =
      typeof getCalendarThemeMeta === 'function' ? getCalendarThemeMeta(themeId) : { id: themeId, name: '汇总' };
    const studyByDate = themeId === 'study' ? Store.getStudyActivityByDate(gridStart, gridEnd) : null;
    const sleepByDate = themeId === 'sleep' ? Store.getSleepActivityByDate(gridStart, gridEnd) : null;
    const washDays = themeId === 'wash' ? Store.getCalendarWashDays() : null;

    const renderThemeMark = (dateStr) => {
      if (themeId === 'summary' || themeId === 'sleep' || themeId === 'study') return '';
      if (themeId === 'wash' && washDays?.[dateStr]) {
        return `<span class="year-cal-theme-mark is-wash" title="已洗头">💧</span>`;
      }
      return '';
    };

    const renderStudyCellBody = (dateStr) => {
      if (themeId !== 'study') return '';
      const info = studyByDate?.get(dateStr);
      if (!info?.totalMins) return '';
      const dur = this.formatSleepDurationCompact(info.totalMins);
      if (!dur) return '';
      return `<span class="year-cal-study-dur" title="学习 ${this.escapeHtml(dur)}">${this.escapeHtml(dur)}</span>`;
    };

    const renderSleepCellBody = (dateStr) => {
      if (themeId !== 'sleep') return '';
      const info = sleepByDate?.get(dateStr);
      if (!info?.count) return '';
      const dur = this.formatSleepDurationCompact(info.totalMins);
      const tipParts = [];
      if (dur) tipParts.push(`总时长 ${dur}`);
      if (info.bedTime) tipParts.push(`入睡 ${info.bedTime}`);
      const y =
        info.bedMinutes != null ? this.sleepBedtimeToYPercent(info.bedMinutes) : null;
      return `
        ${
          dur
            ? `<span class="year-cal-sleep-dur" title="${this.escapeHtml(tipParts.join(' · '))}">${this.escapeHtml(dur)}</span>`
            : ''
        }
        ${
          y != null && info.bedTime
            ? `<span class="year-cal-sleep-bed" style="top:${y.toFixed(1)}%" title="入睡 ${this.escapeHtml(info.bedTime)}">${this.escapeHtml(info.bedTime)}</span>
               <span class="year-cal-sleep-dot" style="top:${y.toFixed(1)}%" title="入睡 ${this.escapeHtml(info.bedTime)}"></span>`
            : y != null
              ? `<span class="year-cal-sleep-dot" style="top:${y.toFixed(1)}%"></span>`
              : ''
        }`;
    };

    const gridTasks = Store.getCalendarTasks().filter(
      (t) => t.startDate <= gridEnd && t.endDate >= gridStart
    );
    const { laneById } = this.assignCalendarTaskLanes(gridTasks, viewDate);
    const maxBarLanes = 3;

    const weekRows = [];
    const showCalendarEvents = themeId === 'summary';
    for (let w = 0; w < cells.length; w += 7) {
      const weekCells = cells.slice(w, w + 7);
      const dayButtons = weekCells
        .map((cell) => {
          const inYear = cell.dateStr.startsWith(`${year}-`);
          const dayTasks = gridTasks.filter(
            (t) => t.startDate <= cell.dateStr && t.endDate >= cell.dateStr
          );
          const hasSubs = dayTasks.some((t) => Store.hasCalendarSubOnDate(t, cell.dateStr));
          const isSelected = viewDate === cell.dateStr;
          const isToday = cell.dateStr === today;
          const sleepInfo = themeId === 'sleep' ? sleepByDate?.get(cell.dateStr) : null;
          const sleepFill =
            sleepInfo?.totalMins > 0 ? this.sleepDurationToCellFill(sleepInfo.totalMins) : '';
          const classes = [
            'year-cal-day',
            cell.outside || !inYear ? 'is-outside' : '',
            isSelected ? 'is-selected' : '',
            isToday ? 'is-today' : '',
            showCalendarEvents && dayTasks.length ? 'has-tasks' : '',
            showCalendarEvents && hasSubs ? 'has-subs' : '',
            themeId === 'study' && studyByDate?.get(cell.dateStr)?.totalMins
              ? 'has-theme-mark is-study-day'
              : '',
            themeId === 'sleep' && sleepInfo?.count ? 'has-theme-mark is-sleep-day' : '',
            themeId === 'wash' && washDays?.[cell.dateStr] ? 'has-theme-mark' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const sleepStyle = sleepFill ? ` style="--sleep-fill:${sleepFill}"` : '';
          return `
            <button type="button" class="${classes}" data-date="${cell.dateStr}" title="${cell.dateStr}"${sleepStyle}>
              <span class="year-cal-day-num">${cell.day}</span>
              ${renderSleepCellBody(cell.dateStr)}
              ${renderStudyCellBody(cell.dateStr)}
              ${renderThemeMark(cell.dateStr)}
              ${showCalendarEvents && hasSubs ? '<span class="year-cal-day-sub-mark" title="有子事项记录"></span>' : ''}
            </button>`;
        })
        .join('');
      const events = showCalendarEvents
        ? this.renderCalendarWeekEvents(weekCells, gridTasks, laneById, maxBarLanes)
        : themeId === 'sleep'
          ? this.renderCalendarWeekSleepOverlay(weekCells, sleepByDate)
          : '';
      weekRows.push(
        `<div class="year-cal-week${themeId === 'sleep' ? ' is-sleep-view' : ''}">${dayButtons}${events}</div>`
      );
    }
    const dayCells = weekRows.join('');

    const dayTasks = Store.getCalendarTasksOnDate(viewDate);
    const taskList = dayTasks.length
      ? dayTasks
          .map((task, index) => {
            const range = this.formatCalendarTaskRange(task);
            const isTask = task.kind !== 'schedule';
            const canUp = index > 0;
            const canDown = index < dayTasks.length - 1;
            const daySubs = Store.getCalendarSubsOnDate(task, viewDate);
            const isRange = task.startDate !== task.endDate;
            const hasSubs = (task.subs || []).length > 0;
            const subList = daySubs.length
              ? `<ul class="year-cal-sub-list">
                  ${daySubs
                    .map(
                      (sub) => `
                    <li class="year-cal-sub ${sub.done ? 'is-done' : ''} kind-${sub.kind || 'task'}" data-task-id="${task.id}" data-sub-id="${sub.id}" style="${this.calendarItemStyle(sub)}">
                      ${
                        (sub.kind || 'task') !== 'schedule'
                          ? `<button type="button" class="year-cal-sub-check ${sub.done ? 'is-done' : ''}" title="${sub.done ? '标为未完成' : '标为完成'}">${sub.done ? '✓' : ''}</button>`
                          : ''
                      }
                      <span class="year-cal-sub-text">${this.escapeHtml(sub.text)}</span>
                      <button type="button" class="icon-btn btn-year-cal-sub-edit" title="编辑">✎</button>
                    </li>`
                    )
                    .join('')}
                </ul>`
              : '';
            return `
              <li class="year-cal-task ${task.done ? 'is-done' : ''} kind-${task.kind || 'task'} ${isRange ? 'is-range' : ''}" data-task-id="${task.id}" style="${this.calendarItemStyle(task)}">
                <div class="year-cal-task-row">
                  ${
                    isTask
                      ? `<button type="button" class="year-cal-task-check ${task.done ? 'is-done' : ''}" title="完成"></button>`
                      : ''
                  }
                  <div class="year-cal-task-main">
                    <span class="year-cal-task-text">${this.escapeHtml(task.text)}${
                      hasSubs ? `<span class="year-cal-task-subcount">${task.subs.length} 记</span>` : ''
                    }</span>
                    <span class="year-cal-task-range">${this.escapeHtml(range)}</span>
                  </div>
                  <span class="year-cal-task-reorder">
                    <button type="button" class="icon-btn btn-year-cal-up" title="上移" ${canUp ? '' : 'disabled'}>↑</button>
                    <button type="button" class="icon-btn btn-year-cal-down" title="下移" ${canDown ? '' : 'disabled'}>↓</button>
                  </span>
                  <button type="button" class="icon-btn btn-year-cal-edit" title="编辑">✎</button>
                </div>
                ${subList}
              </li>`;
          })
          .join('')
      : '<li class="year-cal-task-empty">这一天还没有事项</li>';

    const monthTasks = Store.getCalendarTasksForMonth(year, month);
    const monthTaskList = monthTasks.length
      ? monthTasks
          .map((task) => {
            const range = this.formatCalendarTaskRange(task);
            const kindLabel = this.calendarItemKindLabel(task.kind);
            const subCount = (task.subs || []).length;
            return `
              <li class="year-cal-month-task ${task.done ? 'is-done' : ''} kind-${task.kind || 'task'}" data-task-id="${task.id}" data-jump-date="${task.startDate}" style="${this.calendarItemStyle(task)}">
                <span class="year-cal-month-task-range">${this.escapeHtml(range)} · ${kindLabel}${subCount ? ` · ${subCount} 记` : ''}</span>
                <span class="year-cal-month-task-text">${this.escapeHtml(task.text)}</span>
              </li>`;
          })
          .join('')
      : '<li class="year-cal-month-task-empty">本月暂无事项</li>';

    const themeMenu = (typeof CALENDAR_THEMES !== 'undefined' ? CALENDAR_THEMES : [])
      .map(
        (t) => `
      <button type="button" class="year-cal-theme-option ${themeId === t.id ? 'is-active' : ''}" data-calendar-theme="${t.id}" role="menuitem">
        <span class="year-cal-theme-option-icon" aria-hidden="true">${t.icon || ''}</span>
        <span class="year-cal-theme-option-text">
          <strong>${this.escapeHtml(t.name)}</strong>
          <small>${this.escapeHtml(t.desc || '')}</small>
        </span>
        ${themeId === t.id ? '<span class="year-cal-theme-option-check">✓</span>' : ''}
      </button>`
      )
      .join('');

    const washOn = themeId === 'wash' && Store.isCalendarWashDay(viewDate);
    const themeDayExtra =
      themeId === 'wash'
        ? `<div class="year-cal-theme-day-action">
            <button type="button" class="btn btn-sm ${washOn ? 'btn-secondary' : 'btn-primary'} btn-year-cal-wash-toggle">
              ${washOn ? '✓ 今日已洗头（点此取消）' : '标记今日洗头'}
            </button>
          </div>`
        : themeId === 'sleep'
          ? (() => {
              const info = sleepByDate?.get(viewDate);
              const sleepList = Store.getRawRecords('living', 'sleep').filter(
                (r) => String(r.date || '').slice(0, 10) === viewDate
              );
              if (!sleepList.length) {
                return `<div class="year-cal-theme-day-hint">这一天还没有睡眠记录</div>`;
              }
              const dur = this.formatSleepDurationFromMinutes(info?.totalMins);
              const bed = info?.bedTime ? ` · 首个长睡眠入睡 ${info.bedTime}` : '';
              const rows = sleepList
                .map((r) => {
                  const kind = this.normalizeSleepType(r.sleepType) === 'nap' ? '小憩' : '长睡眠';
                  const one = this.formatSleepDuration(r.bedtime, r.wakeup) || '—';
                  return `<li class="year-cal-sleep-record"><span class="k">${kind}</span><span class="v">${this.escapeHtml(String(r.bedtime || '—'))} → ${this.escapeHtml(String(r.wakeup || '—'))} · ${this.escapeHtml(one)}</span></li>`;
                })
                .join('');
              return `
                <div class="year-cal-theme-day-hint">总时长 ${this.escapeHtml(dur || '—')}${this.escapeHtml(bed)}</div>
                <ul class="year-cal-sleep-record-list">${rows}</ul>`;
            })()
          : themeId === 'study'
            ? (() => {
                const info = studyByDate?.get(viewDate);
                const sleepList = Store.getRawRecords('living', 'study').filter(
                  (r) => String(r.date || '').slice(0, 10) === viewDate
                );
                if (!sleepList.length) {
                  return `<div class="year-cal-theme-day-hint">这一天还没有学习记录</div>`;
                }
                const dur = this.formatSleepDurationFromMinutes(info?.totalMins);
                const rows = sleepList
                  .map((r) => {
                    const one = this.formatStudyDurationLabel(this.calcStudyDurationMins(r));
                    const note = r.note ? ` · ${this.escapeHtml(String(r.note))}` : '';
                    return `<li class="year-cal-sleep-record"><span class="k">学习</span><span class="v">${this.escapeHtml(one)}${note}</span></li>`;
                  })
                  .join('');
                return `
                  <div class="year-cal-theme-day-hint">总时长 ${this.escapeHtml(dur || '—')}</div>
                  <ul class="year-cal-sleep-record-list">${rows}</ul>`;
              })()
            : '';

    const monthPanelHead =
      themeId === 'summary' ? '月度事项' : `月度 · ${themeMeta.name}`;
    const dayPanelTasks =
      themeId === 'summary'
        ? `<ul class="year-cal-task-list">${taskList}</ul>`
        : themeId === 'wash'
          ? ''
          : '';

    return `
      <section class="year-calendar mode-${this.escapeHtml(themeId)}" data-year="${year}" data-month="${month}" data-theme="${this.escapeHtml(themeId)}">
        <div class="year-cal-head">
          <div class="year-cal-year-switch">
            <button type="button" class="btn btn-ghost btn-sm btn-year-cal-year-prev" title="上一年">‹</button>
            <span class="year-cal-title">${this.formatCalendarYearLabel(year)}</span>
            <button type="button" class="btn btn-ghost btn-sm btn-year-cal-year-next" title="下一年">›</button>
          </div>
          <div class="year-cal-head-actions">
            <div class="year-cal-theme-wrap">
              <button type="button" class="icon-btn btn-year-cal-theme" title="切换视图：${this.escapeHtml(themeMeta.name)}" aria-haspopup="true" aria-expanded="false" aria-label="切换日历视图">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 6a1 1 0 0 1 1 1v1.07a7.002 7.002 0 0 1 2.9 1.2l.76-.76a1 1 0 1 1 1.41 1.41l-.76.76A7.002 7.002 0 0 1 18.93 13H20a1 1 0 1 1 0 2h-1.07a7.002 7.002 0 0 1-1.2 2.9l.76.76a1 1 0 0 1-1.41 1.41l-.76-.76A7.002 7.002 0 0 1 13 18.93V20a1 1 0 1 1-2 0v-1.07a7.002 7.002 0 0 1-2.9-1.2l-.76.76a1 1 0 0 1-1.41-1.41l.76-.76A7.002 7.002 0 0 1 5.07 15H4a1 1 0 1 1 0-2h1.07a7.002 7.002 0 0 1 1.2-2.9l-.76-.76a1 1 0 0 1 1.41-1.41l.76.76A7.002 7.002 0 0 1 11 8.07V7a1 1 0 0 1 1-1zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>
              </button>
              <div class="year-cal-theme-menu hidden" role="menu">
                <div class="year-cal-theme-menu-title">切换视图</div>
                ${themeMenu}
              </div>
            </div>
            <div class="year-cal-create-wrap">
              <button type="button" class="btn btn-primary btn-sm btn-year-cal-create" title="新增事项" aria-haspopup="true" aria-expanded="false">+</button>
              <div class="year-cal-create-menu hidden" role="menu">
                <button type="button" class="year-cal-create-option" data-kind="task" role="menuitem">新增任务</button>
                <button type="button" class="year-cal-create-option" data-kind="schedule" role="menuitem">新增日程</button>
              </div>
            </div>
          </div>
        </div>
        <div class="year-cal-body">
          <aside class="year-cal-side">
            <div class="year-cal-nav">
              <button type="button" class="btn btn-ghost btn-sm btn-year-cal-prev" title="上个月">‹</button>
              <span class="year-cal-month-label">${this.formatCalendarMonthLabel(month)}</span>
              <button type="button" class="btn btn-ghost btn-sm btn-year-cal-next" title="下个月">›</button>
            </div>
            <div class="year-cal-month-panel">
              <div class="year-cal-month-panel-head">${this.escapeHtml(monthPanelHead)}</div>
              <ul class="year-cal-month-task-list">${
                themeId === 'summary'
                  ? monthTaskList
                  : `<li class="year-cal-month-task-empty">${this.escapeHtml(themeMeta.name)}视图 · 点选日期查看当日详情</li>`
              }</ul>
            </div>
          </aside>
          <div class="year-cal-board">
            <div class="year-cal-weekdays">
              ${weekdays.map((w) => `<span>${w}</span>`).join('')}
            </div>
            <div class="year-cal-grid">${dayCells}</div>
          </div>
        </div>
        <div class="year-cal-day-panel">
          <div class="year-cal-day-panel-head">${this.escapeHtml(this.formatCalendarDayLabel(viewDate))} ${this.escapeHtml(this.formatCalendarWeekday(viewDate))} · ${this.escapeHtml(themeId === 'summary' ? '事项' : themeMeta.name)}</div>
          ${themeDayExtra}
          ${themeId === 'summary' ? `<ul class="year-cal-task-list">${taskList}</ul>` : ''}
        </div>
        <button type="button" class="year-cal-help-btn btn-year-cal-help" title="使用教程" aria-label="使用教程">?</button>
      </section>`;
  },

  bindYearCalendar() {
    const root = document.querySelector('.year-calendar');
    if (!root) return;

    const setMonth = (month) => {
      let y = this.calendarYear ?? new Date().getFullYear();
      let m = month;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      this.calendarYear = y;
      this.calendarMonth = m;
      this.render();
    };

    const setYear = (year) => {
      this.calendarYear = Math.max(1970, Math.min(2100, year));
      const day = String(this.calendarViewDate || '').slice(8, 10) || '01';
      const month = this.calendarMonth ?? 0;
      const last = new Date(this.calendarYear, month + 1, 0).getDate();
      const d = Math.min(Number(day) || 1, last);
      this.calendarViewDate = `${this.calendarYear}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      this.render();
    };

    root.querySelector('.btn-year-cal-year-prev')?.addEventListener('click', () => {
      setYear((this.calendarYear ?? new Date().getFullYear()) - 1);
    });
    root.querySelector('.btn-year-cal-year-next')?.addEventListener('click', () => {
      setYear((this.calendarYear ?? new Date().getFullYear()) + 1);
    });

    root.querySelector('.btn-year-cal-theme')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = root.querySelector('.year-cal-theme-menu');
      const btn = root.querySelector('.btn-year-cal-theme');
      if (!menu) return;
      const willOpen = menu.classList.contains('hidden');
      root.querySelector('.year-cal-create-menu')?.classList.add('hidden');
      root.querySelector('.btn-year-cal-create')?.setAttribute('aria-expanded', 'false');
      menu.classList.toggle('hidden', !willOpen);
      btn?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    root.querySelectorAll('.year-cal-theme-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.calendarTheme;
        root.querySelector('.year-cal-theme-menu')?.classList.add('hidden');
        root.querySelector('.btn-year-cal-theme')?.setAttribute('aria-expanded', 'false');
        if (!id || id === Store.getCalendarTheme()) return;
        Store.setCalendarTheme(id);
        this.render();
      });
    });

    root.querySelector('.btn-year-cal-wash-toggle')?.addEventListener('click', () => {
      const day = this.calendarViewDate || this.getCalendarViewState().viewDate;
      if (!day) return;
      Store.toggleCalendarWashDay(day);
      this.render();
    });

    root.querySelector('.btn-year-cal-prev')?.addEventListener('click', () => {
      setMonth((this.calendarMonth ?? 0) - 1);
    });
    root.querySelector('.btn-year-cal-next')?.addEventListener('click', () => {
      setMonth((this.calendarMonth ?? 0) + 1);
    });

    root.querySelector('.btn-year-cal-create')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = root.querySelector('.year-cal-create-menu');
      const btn = root.querySelector('.btn-year-cal-create');
      if (!menu) return;
      const willOpen = menu.classList.contains('hidden');
      root.querySelector('.year-cal-theme-menu')?.classList.add('hidden');
      root.querySelector('.btn-year-cal-theme')?.setAttribute('aria-expanded', 'false');
      menu.classList.toggle('hidden', !willOpen);
      btn?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    root.querySelectorAll('.year-cal-create-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kind = btn.dataset.kind === 'schedule' ? 'schedule' : 'task';
        root.querySelector('.year-cal-create-menu')?.classList.add('hidden');
        root.querySelector('.btn-year-cal-create')?.setAttribute('aria-expanded', 'false');
        if (!this.calendarViewDate) {
          const { year, month } = this.getCalendarViewState();
          this.calendarViewDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        }
        this.openYearCalendarTaskModal(null, { kind });
      });
    });

    if (!this._yearCalCreateOutsideBound) {
      this._yearCalCreateOutsideBound = true;
      document.addEventListener('click', (e) => {
        if (e.target.closest('.year-cal-create-wrap') || e.target.closest('.year-cal-theme-wrap')) return;
        document.querySelectorAll('.year-cal-create-menu, .year-cal-theme-menu').forEach((el) => el.classList.add('hidden'));
        document.querySelectorAll('.btn-year-cal-create, .btn-year-cal-theme').forEach((el) => el.setAttribute('aria-expanded', 'false'));
      });
    }

    root.querySelectorAll('.year-cal-day').forEach((btn) => {
      btn.addEventListener('click', () => {
        const date = btn.dataset.date;
        if (!date) return;
        this.setCalendarToDate(date);
        this.render();
      });
    });

    root.querySelectorAll('.year-cal-month-task[data-jump-date]').forEach((el) => {
      el.addEventListener('click', () => {
        const date = el.dataset.jumpDate;
        if (!date) return;
        this.setCalendarToDate(date);
        this.render();
      });
    });

    root.querySelectorAll('.year-cal-task-check').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.year-cal-task')?.dataset.taskId;
        if (!id) return;
        Store.toggleCalendarTask(id);
        this.render();
      });
    });

    root.querySelectorAll('.btn-year-cal-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        const id = btn.closest('.year-cal-task')?.dataset.taskId;
        const day = this.calendarViewDate || this.getCalendarViewState().viewDate;
        if (!id || !day) return;
        if (!Store.reorderCalendarTaskOnDate(day, id, -1)) return;
        this.render();
      });
    });

    root.querySelectorAll('.btn-year-cal-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        const id = btn.closest('.year-cal-task')?.dataset.taskId;
        const day = this.calendarViewDate || this.getCalendarViewState().viewDate;
        if (!id || !day) return;
        if (!Store.reorderCalendarTaskOnDate(day, id, 1)) return;
        this.render();
      });
    });

    root.querySelectorAll('.btn-year-cal-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.year-cal-task')?.dataset.taskId;
        if (!id) return;
        const task = Store.getCalendarTasks().find((t) => t.id === id);
        if (!task) return;
        this.openYearCalendarTaskModal(task);
      });
    });

    root.querySelectorAll('.year-cal-sub-check').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.year-cal-sub');
        const taskId = row?.dataset.taskId;
        const subId = row?.dataset.subId;
        if (!taskId || !subId) return;
        Store.toggleCalendarSub(taskId, subId);
        this.render();
      });
    });

    root.querySelectorAll('.btn-year-cal-sub-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.year-cal-sub');
        const taskId = row?.dataset.taskId;
        const subId = row?.dataset.subId;
        if (!taskId || !subId) return;
        const parent = Store.getCalendarTasks().find((t) => t.id === taskId);
        const sub = parent?.subs?.find((s) => s.id === subId);
        if (!parent || !sub) return;
        this.openYearCalendarSubModal(parent, sub);
      });
    });

    root.querySelector('.btn-year-cal-help')?.addEventListener('click', () => {
      this.openYearCalendarHelp();
    });
  },

  openYearCalendarHelp() {
    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = '年历 · 使用教程';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="year-cal-help-guide">
        <ol>
          <li><strong>切换年份</strong>：点击标题两侧 ‹ ›，显示为「xxxx年」。</li>
          <li><strong>切换月份</strong>：点击左侧 ‹ ›，显示为「xx月」；下方展示本月计划，点击可跳到对应日期。</li>
          <li><strong>查看某天事项</strong>：点击日历上的某一天，下方会显示该日事项（任务与日程）。</li>
          <li><strong>新增事项</strong>：点右上角「+」，选择「新增任务」或「新增日程」，可自定义高亮颜色。</li>
          <li><strong>跨天事项</strong>：开始与结束日期不同时，日历上会以连续色条高亮；标题在色条中居中显示一次。</li>
          <li><strong>编辑 / 删除</strong>：在事项列表点 ✎ 可修改类型（任务 / 日程）、标题、日期、颜色等；编辑弹窗底部可删除（进入回收箱）。任务可勾选完成。</li>
        </ol>
      </div>`;
    form.onsubmit = null;
    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.add('hidden');
    document.getElementById('modalCancel').textContent = '关闭';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  formatCalendarDayLabel(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = String(dateStr).split('-');
    return `${y}年${Number(m)}月${Number(d)}日`;
  },

  formatCalendarWeekday(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
    return `周${week[day]}`;
  },

  formatCalendarShortDate(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[2]}-${m[3]} ${this.formatCalendarWeekday(dateStr)}`;
  },

  formatCalendarTaskRange(task) {
    if (!task?.startDate) return '';
    if (!task.endDate || task.startDate === task.endDate) {
      return this.formatCalendarShortDate(task.startDate);
    }
    return `${this.formatCalendarShortDate(task.startDate)} ~ ${this.formatCalendarShortDate(task.endDate)}`;
  },


  openYearCalendarTaskModal(existingTask = null, options = {}) {
    const isEdit = Boolean(existingTask?.id);
    const { year, viewDate } = this.getCalendarViewState();
    const defaultDate =
      viewDate && /^\d{4}-\d{2}-\d{2}$/.test(viewDate) ? viewDate : `${year}-01-01`;
    const startValue = isEdit ? existingTask.startDate : defaultDate;
    const endValue = isEdit ? existingTask.endDate || existingTask.startDate : defaultDate;
    const titleValue = isEdit ? existingTask.text || '' : '';
    const doneValue = isEdit ? Boolean(existingTask.done) : false;
    let kindValue =
      isEdit
        ? existingTask.kind === 'schedule'
          ? 'schedule'
          : 'task'
        : options.kind === 'schedule'
          ? 'schedule'
          : 'task';
    let colorValue = isEdit
      ? existingTask.color || this.calendarItemDefaultColor(kindValue)
      : options.color || this.calendarItemDefaultColor(kindValue);
    const presets = this.calendarColorPresets();
    const kindLabel = this.calendarItemKindLabel(kindValue);

    this.resetModalFooter();
    document.getElementById('modalTitle').textContent = isEdit
      ? `编辑${kindLabel}`
      : `新增${kindLabel}`;
    const form = document.getElementById('recordForm');
    const syncDoneVisibility = () => {
      const doneRow = document.getElementById('yearCalTaskDoneRow');
      if (!doneRow) return;
      doneRow.classList.toggle('hidden', kindValue !== 'task');
    };
    const renderColorSwatches = () =>
      presets
        .map(
          (c) =>
            `<button type="button" class="year-cal-color-swatch ${
              c.toUpperCase() === colorValue.toUpperCase() ? 'is-active' : ''
            }" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="颜色 ${c}"></button>`
        )
        .join('');

    form.innerHTML = `
      <div class="form-group">
        <label>类型</label>
        <div class="year-cal-kind-switch">
          <button type="button" class="year-cal-kind-btn ${kindValue === 'task' ? 'is-active' : ''}" data-kind="task">任务</button>
          <button type="button" class="year-cal-kind-btn ${kindValue === 'schedule' ? 'is-active' : ''}" data-kind="schedule">日程</button>
        </div>
      </div>
      <div class="form-group">
        <label>标题</label>
        <input type="text" name="title" id="yearCalTaskTitle" maxlength="120" required placeholder="输入事项标题…" value="${this.escapeHtml(titleValue)}">
      </div>
      <div class="form-group">
        <label>开始日期</label>
        <input type="date" name="startDate" id="yearCalTaskStart" value="${startValue}" required>
      </div>
      <div class="form-group">
        <label>结束日期</label>
        <input type="date" name="endDate" id="yearCalTaskEnd" value="${endValue}" required>
      </div>
      <div class="form-group">
        <label>高亮颜色</label>
        <div class="year-cal-color-row">
          <div class="year-cal-color-swatches" id="yearCalColorSwatches">${renderColorSwatches()}</div>
          <input type="color" id="yearCalTaskColor" value="${colorValue}" title="自定义颜色">
        </div>
      </div>
      <div class="form-group form-check ${kindValue === 'task' && isEdit ? '' : 'hidden'}" id="yearCalTaskDoneRow">
        <label><input type="checkbox" id="yearCalTaskDone" ${doneValue ? 'checked' : ''}> 已完成</label>
      </div>
      <p class="form-hint">任务与日程可随时互换。结束日期可与开始日期相同，也可选择更晚的日期作为时间段。</p>
      ${
        isEdit
          ? `<div class="form-delete-zone">
        <button type="button" class="btn btn-danger-ghost" id="btnDeleteYearCalTask">删除这个事项</button>
      </div>`
          : ''
      }`;

    const updateTitle = () => {
      document.getElementById('modalTitle').textContent = isEdit
        ? `编辑${this.calendarItemKindLabel(kindValue)}`
        : `新增${this.calendarItemKindLabel(kindValue)}`;
    };

    form.querySelectorAll('.year-cal-kind-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        kindValue = btn.dataset.kind === 'schedule' ? 'schedule' : 'task';
        form.querySelectorAll('.year-cal-kind-btn').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.kind === kindValue);
        });
        const wasDefault =
          colorValue.toUpperCase() === this.calendarItemDefaultColor('task') ||
          colorValue.toUpperCase() === this.calendarItemDefaultColor('schedule');
        if (wasDefault) {
          colorValue = this.calendarItemDefaultColor(kindValue);
          const colorInput = document.getElementById('yearCalTaskColor');
          if (colorInput) colorInput.value = colorValue;
          const wrap = document.getElementById('yearCalColorSwatches');
          if (wrap) wrap.innerHTML = renderColorSwatches();
          bindSwatches();
        }
        syncDoneVisibility();
        updateTitle();
      });
    });

    const bindSwatches = () => {
      form.querySelectorAll('.year-cal-color-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
          colorValue = Store.normalizeCalendarItemColor(btn.dataset.color, kindValue);
          const colorInput = document.getElementById('yearCalTaskColor');
          if (colorInput) colorInput.value = colorValue;
          form.querySelectorAll('.year-cal-color-swatch').forEach((b) => {
            b.classList.toggle(
              'is-active',
              (b.dataset.color || '').toUpperCase() === colorValue.toUpperCase()
            );
          });
        });
      });
    };
    bindSwatches();

    document.getElementById('yearCalTaskColor')?.addEventListener('input', (e) => {
      colorValue = Store.normalizeCalendarItemColor(e.target.value, kindValue);
      form.querySelectorAll('.year-cal-color-swatch').forEach((b) => {
        b.classList.toggle(
          'is-active',
          (b.dataset.color || '').toUpperCase() === colorValue.toUpperCase()
        );
      });
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const title = String(document.getElementById('yearCalTaskTitle')?.value || '').trim();
        let startDate = String(document.getElementById('yearCalTaskStart')?.value || '').slice(0, 10);
        let endDate = String(document.getElementById('yearCalTaskEnd')?.value || '').slice(0, 10);
        const color = Store.normalizeCalendarItemColor(
          document.getElementById('yearCalTaskColor')?.value || colorValue,
          kindValue
        );
        if (!title) {
          document.getElementById('yearCalTaskTitle')?.focus();
          return;
        }
        if (!startDate || !endDate) return;
        if (endDate < startDate) [startDate, endDate] = [endDate, startDate];
        if (isEdit) {
          const done =
            kindValue === 'task' ? Boolean(document.getElementById('yearCalTaskDone')?.checked) : false;
          const saved = Store.updateCalendarTask(existingTask.id, {
            text: title,
            startDate,
            endDate,
            kind: kindValue,
            color,
            done,
          });
          if (!saved) {
            alert('保存失败，请重试。');
            return;
          }
        } else {
          const saved = Store.addCalendarTask({
            text: title,
            startDate,
            endDate,
            kind: kindValue,
            color,
          });
          if (!saved) {
            alert('添加失败，请重试。');
            return;
          }
        }
        this.setCalendarToDate(startDate);
        this.closeModal();
        this.render();
      } catch (err) {
        console.error(err);
        alert('保存失败，请刷新页面后重试。');
      }
    };

    document.getElementById('btnDeleteYearCalTask')?.addEventListener('click', async () => {
      const ok = await this.confirmDelete(
        '确定删除这个事项吗？删除后将移入回收箱，满 30 天后自动清除。'
      );
      if (!ok) return;
      Store.deleteCalendarTask(existingTask.id);
      this.closeModal();
      this.updateRecycleBinNav();
      this.render();
    });

    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.remove('hidden');
    document.getElementById('modalSave').textContent = isEdit ? '保存' : '添加';
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('yearCalTaskTitle')?.focus(), 0);
  },

  formatCalendarYearLabel(year) {
    return `${year}年`;
  },

  setCalendarToDate(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    this.calendarViewDate = dateStr;
    this.calendarYear = Number(m[1]);
    this.calendarMonth = Number(m[2]) - 1;
  },

  formatCalendarWeekday(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
    return `周${week[day]}`;
  },

  formatCalendarShortDate(dateStr) {
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[2]}-${m[3]} ${this.formatCalendarWeekday(dateStr)}`;
  },

  formatCalendarTaskRange(task) {
    if (!task?.startDate) return '';
    if (!task.endDate || task.startDate === task.endDate) {
      return this.formatCalendarShortDate(task.startDate);
    }
    return `${this.formatCalendarShortDate(task.startDate)} ~ ${this.formatCalendarShortDate(task.endDate)}`;
  },

  /** 为月历任务分配轨道；优先按 orderDate（当天事项列表）顺序决定上下层 */
  assignCalendarTaskLanes(tasks, orderDate = '') {
    const preferredIds = orderDate
      ? Store.getCalendarTasksOnDate(orderDate).map((t) => String(t.id))
      : [];
    const preferredRank = new Map(preferredIds.map((id, i) => [id, i]));
    const dayOrders = Store.getCalendarDayOrders();

    const fallbackRank = (task) => {
      const order = dayOrders[task.startDate];
      if (!Array.isArray(order)) return Number.MAX_SAFE_INTEGER;
      const i = order.indexOf(task.id);
      return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
    };

    const sorted = [...(tasks || [])].sort((a, b) => {
      const ida = String(a.id);
      const idb = String(b.id);
      const pa = preferredRank.has(ida);
      const pb = preferredRank.has(idb);
      if (pa && pb) return preferredRank.get(ida) - preferredRank.get(idb);
      if (pa !== pb) return pa ? -1 : 1;
      const fa = fallbackRank(a);
      const fb = fallbackRank(b);
      if (fa !== fb) return fa - fb;
      const s = String(a.startDate).localeCompare(String(b.startDate));
      if (s) return s;
      const len = String(b.endDate).localeCompare(String(a.endDate));
      if (len) return len;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });

    const laneEnds = [];
    const laneById = new Map();
    sorted.forEach((task) => {
      let lane = laneEnds.findIndex((end) => end < task.startDate);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(task.endDate);
      } else {
        laneEnds[lane] = task.endDate;
      }
      laneById.set(task.id, lane);
    });
    return { laneById, laneCount: laneEnds.length };
  },

  getCalendarBarSegmentClass(task, dateStr, colIndex) {
    const isRangeStart = dateStr === task.startDate;
    const isRangeEnd = dateStr === task.endDate;
    const isWeekStart = colIndex === 0;
    const isWeekEnd = colIndex === 6;
    const start = isRangeStart || isWeekStart;
    const end = isRangeEnd || isWeekEnd;
    if (start && end) return 'is-single';
    if (start) return 'is-start';
    if (end) return 'is-end';
    return 'is-mid';
  },

  renderCalendarDayBars(dayTasks, dateStr, colIndex, laneById, maxLanes = 3) {
    const byLane = new Map();
    (dayTasks || []).forEach((task) => {
      const lane = laneById.get(task.id);
      if (lane == null || lane >= maxLanes) return;
      byLane.set(lane, task);
    });
    const overflow = (dayTasks || []).filter((t) => (laneById.get(t.id) ?? 99) >= maxLanes).length;
    const rows = [];
    for (let lane = 0; lane < maxLanes; lane++) {
      const task = byLane.get(lane);
      if (!task) {
        rows.push('<span class="year-cal-bar is-spacer" aria-hidden="true"></span>');
        continue;
      }
      const seg = this.getCalendarBarSegmentClass(task, dateStr, colIndex);
      const label = this.escapeHtml(task.text || '');
      rows.push(
        `<span class="year-cal-bar ${seg} ${task.done ? 'is-done' : ''}" title="${label}"><span class="year-cal-bar-text">${label}</span></span>`
      );
    }
    return `<span class="year-cal-bars">${rows.join('')}</span>`;
  },

  /** 某一周内，任务色条的列起止（仅渲染一段，标题居中一次） */
  getCalendarWeekEventSegments(weekCells, tasks, laneById, maxLanes = 3) {
    const segments = [];
    (tasks || []).forEach((task) => {
      const lane = laneById.has(task.id) ? laneById.get(task.id) : Number.MAX_SAFE_INTEGER;
      let startCol = -1;
      let endCol = -1;
      weekCells.forEach((cell, i) => {
        if (cell.dateStr >= task.startDate && cell.dateStr <= task.endDate) {
          if (startCol === -1) startCol = i;
          endCol = i;
        }
      });
      if (startCol === -1) return;
      segments.push({
        task,
        lane,
        startCol: startCol + 1,
        span: endCol - startCol + 1,
        multi: endCol > startCol,
      });
    });
    // 必须先按列起点排序再贪心分配，否则右侧事项先占道会把左侧不重叠事项挤到下一层
    segments.sort((a, b) => a.startCol - b.startCol || a.lane - b.lane);
    const laneEnds = [];
    segments.forEach((seg) => {
      const segEnd = seg.startCol + seg.span - 1;
      let local = laneEnds.findIndex((end) => end < seg.startCol);
      if (local === -1) {
        local = laneEnds.length;
        laneEnds.push(segEnd);
      } else {
        laneEnds[local] = Math.max(laneEnds[local], segEnd);
      }
      seg.lane = local;
    });
    return segments.filter((s) => s.lane < maxLanes).sort((a, b) => a.lane - b.lane || a.startCol - b.startCol);
  },

  renderCalendarWeekEvents(weekCells, tasks, laneById, maxLanes = 3) {
    const segments = this.getCalendarWeekEventSegments(weekCells, tasks, laneById, maxLanes);
    if (!segments.length) {
      return '<div class="year-cal-week-events" aria-hidden="true"></div>';
    }
    const events = segments
      .map(({ task, lane, startCol, span, multi }) => {
        const label = this.escapeHtml(task.text || '');
        return `<div class="year-cal-event ${multi ? 'is-multi' : 'is-single'} ${
          task.done ? 'is-done' : ''
        } kind-${task.kind || 'task'}" style="--start:${startCol};--span:${span};--lane:${lane};${this.calendarItemStyle(task)}" title="${label}"><span class="year-cal-event-text">${label}</span></div>`;
      })
      .join('');
    return `<div class="year-cal-week-events">${events}</div>`;
  },

  calendarItemKindLabel(kind) {
    return kind === 'schedule' ? '日程' : '任务';
  },

  calendarItemDefaultColor(kind) {
    return kind === 'schedule' ? '#3B82F6' : '#F59E0B';
  },

  calendarColorPresets() {
    return ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#F43F5E', '#0D9488', '#64748B', '#EC4899'];
  },

  hexToRgba(hex, alpha = 0.45) {
    const normalized = Store.normalizeCalendarItemColor(hex);
    const m = normalized.match(/^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i);
    if (!m) return `rgba(245, 158, 11, ${alpha})`;
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
  },

  darkenHex(hex, amount = 0.45) {
    const normalized = Store.normalizeCalendarItemColor(hex);
    const m = normalized.match(/^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i);
    if (!m) return '#78350F';
    const channel = (v) => Math.max(0, Math.round(parseInt(v, 16) * (1 - amount)));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(channel(m[1]))}${toHex(channel(m[2]))}${toHex(channel(m[3]))}`;
  },

  calendarItemStyle(item) {
    const color = item?.color || this.calendarItemDefaultColor(item?.kind);
    return `--item-color:${color};--item-bg:${this.hexToRgba(color, 0.42)};--item-text:${this.darkenHex(color, 0.42)};`;
  },

  openYearCalendarSubModal(parentTask, existingSub = null) {
    if (!parentTask?.id) return;
    const isEdit = Boolean(existingSub?.id);
    const { viewDate } = this.getCalendarViewState();
    const rangeStart = parentTask.startDate;
    const rangeEnd = parentTask.endDate || parentTask.startDate;
    const dateInit = isEdit
      ? existingSub.date
      : viewDate && viewDate >= rangeStart && viewDate <= rangeEnd
        ? viewDate
        : rangeStart;
    const titleInit = isEdit ? existingSub.text || '' : '';
    const doneInit = isEdit ? Boolean(existingSub.done) : false;
    let kindValue = isEdit
      ? existingSub.kind === 'schedule'
        ? 'schedule'
        : 'task'
      : 'task';
    let colorValue = Store.normalizeCalendarItemColor(
      isEdit ? existingSub.color : null,
      kindValue
    );
    const presets = this.calendarColorPresets();

    this.resetModalFooter();
    const form = document.getElementById('recordForm');

    const updateTitle = () => {
      document.getElementById('modalTitle').textContent = isEdit
        ? `编辑子${this.calendarItemKindLabel(kindValue)}`
        : `新增子${this.calendarItemKindLabel(kindValue)}`;
    };

    const syncDoneVisibility = () => {
      const doneRow = document.getElementById('yearCalTaskDoneRow');
      if (!doneRow) return;
      doneRow.classList.toggle('hidden', !(isEdit && kindValue === 'task'));
    };

    const renderColorSwatches = () =>
      presets
        .map(
          (c) =>
            `<button type="button" class="year-cal-color-swatch ${
              c.toUpperCase() === String(colorValue).toUpperCase() ? 'is-active' : ''
            }" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="颜色 ${c}"></button>`
        )
        .join('');

    updateTitle();
    form.innerHTML = `
      <p class="form-hint">所属事项：${this.escapeHtml(parentTask.text)}（${this.escapeHtml(
        this.formatCalendarShortDate(rangeStart)
      )} ~ ${this.escapeHtml(this.formatCalendarShortDate(rangeEnd))}）</p>
      <div class="form-group">
        <label>类型</label>
        <div class="year-cal-kind-switch">
          <button type="button" class="year-cal-kind-btn ${kindValue === 'task' ? 'is-active' : ''}" data-kind="task">任务</button>
          <button type="button" class="year-cal-kind-btn ${kindValue === 'schedule' ? 'is-active' : ''}" data-kind="schedule">日程</button>
        </div>
      </div>
      <div class="form-group">
        <label>标题</label>
        <input type="text" name="title" id="yearCalTaskTitle" maxlength="120" required placeholder="输入子事项标题…" value="${this.escapeHtml(titleInit)}">
      </div>
      <div class="form-group">
        <label>日期</label>
        <input type="date" name="startDate" id="yearCalTaskStart" value="${dateInit}" min="${rangeStart}" max="${rangeEnd}" required>
      </div>
      <div class="form-group">
        <label>高亮颜色</label>
        <div class="year-cal-color-row">
          <div class="year-cal-color-swatches" id="yearCalColorSwatches">${renderColorSwatches()}</div>
          <input type="color" id="yearCalTaskColor" value="${colorValue}" title="自定义颜色">
        </div>
      </div>
      <div class="form-group form-check ${isEdit && kindValue === 'task' ? '' : 'hidden'}" id="yearCalTaskDoneRow">
        <label><input type="checkbox" id="yearCalTaskDone" ${doneInit ? 'checked' : ''}> 已完成</label>
      </div>
      <p class="form-hint">子事项同样可选任务或日程，日期需落在主事项区间内。</p>
      ${
        isEdit
          ? `<div class="form-delete-zone">
        <button type="button" class="btn btn-danger-ghost" id="btnDeleteYearCalSub">删除这个子事项</button>
      </div>`
          : ''
      }`;

    form.querySelectorAll('.year-cal-kind-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        kindValue = btn.dataset.kind === 'schedule' ? 'schedule' : 'task';
        form.querySelectorAll('.year-cal-kind-btn').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.kind === kindValue);
        });
        const wasDefault =
          String(colorValue).toUpperCase() === this.calendarItemDefaultColor('task') ||
          String(colorValue).toUpperCase() === this.calendarItemDefaultColor('schedule');
        if (wasDefault) {
          colorValue = this.calendarItemDefaultColor(kindValue);
          const colorInput = document.getElementById('yearCalTaskColor');
          if (colorInput) colorInput.value = colorValue;
          const wrap = document.getElementById('yearCalColorSwatches');
          if (wrap) wrap.innerHTML = renderColorSwatches();
          bindSwatches();
        }
        syncDoneVisibility();
        updateTitle();
      });
    });

    const bindSwatches = () => {
      form.querySelectorAll('.year-cal-color-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
          colorValue = Store.normalizeCalendarItemColor(btn.dataset.color, kindValue);
          const colorInput = document.getElementById('yearCalTaskColor');
          if (colorInput) colorInput.value = colorValue;
          form.querySelectorAll('.year-cal-color-swatch').forEach((b) => {
            b.classList.toggle(
              'is-active',
              (b.dataset.color || '').toUpperCase() === String(colorValue).toUpperCase()
            );
          });
        });
      });
    };
    bindSwatches();

    document.getElementById('yearCalTaskColor')?.addEventListener('input', (e) => {
      colorValue = Store.normalizeCalendarItemColor(e.target.value, kindValue);
      form.querySelectorAll('.year-cal-color-swatch').forEach((b) => {
        b.classList.toggle(
          'is-active',
          (b.dataset.color || '').toUpperCase() === String(colorValue).toUpperCase()
        );
      });
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const title = String(document.getElementById('yearCalTaskTitle')?.value || '').trim();
        const date = String(document.getElementById('yearCalTaskStart')?.value || '').slice(0, 10);
        const color = Store.normalizeCalendarItemColor(
          document.getElementById('yearCalTaskColor')?.value || colorValue,
          kindValue
        );
        if (!title) {
          document.getElementById('yearCalTaskTitle')?.focus();
          return;
        }
        if (!date || date < rangeStart || date > rangeEnd) {
          document.getElementById('yearCalTaskStart')?.focus();
          return;
        }
        const payload = {
          text: title,
          date,
          kind: kindValue,
          color,
          done: kindValue === 'task' ? Boolean(document.getElementById('yearCalTaskDone')?.checked) : false,
        };
        const saved = isEdit
          ? Store.updateCalendarSub(parentTask.id, existingSub.id, payload)
          : Store.addCalendarSub(parentTask.id, payload);
        if (!saved) {
          alert('保存失败，请检查日期是否在主事项区间内后重试。');
          document.getElementById('yearCalTaskStart')?.focus();
          return;
        }
        this.setCalendarToDate(date);
        this.closeModal();
        this.render();
      } catch (err) {
        console.error(err);
        alert('保存失败，请刷新页面后重试。');
      }
    };

    document.getElementById('btnDeleteYearCalSub')?.addEventListener('click', async () => {
      const ok = await this.confirmDelete('确定删除这个子事项吗？');
      if (!ok) return;
      Store.deleteCalendarSub(parentTask.id, existingSub.id);
      this.closeModal();
      this.render();
    });

    document.getElementById('modal')?.classList.remove('modal-rich', 'modal-bagu-answers');
    document.getElementById('modalSave')?.classList.remove('hidden');
    document.getElementById('modalSave').textContent = isEdit ? '保存' : '添加';
    document.getElementById('modalCancel').textContent = '取消';
    document.getElementById('btnBaguAnswerEdit')?.classList.add('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('yearCalTaskTitle')?.focus(), 0);
  },

  bindHome() {
    document.getElementById('btnChatSend')?.addEventListener('click', () => this.handleChatSend());
    document.getElementById('btnAssistantSettings')?.addEventListener('click', () => this.openAssistantModal());
    document.getElementById('btnChatCollapse')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !Store.isChatCollapsed();
      Store.setChatCollapsed(next);
      this.render();
    });

    const chatInput = document.getElementById('chatInput');
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleChatSend();
      }
    });
    chatInput?.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    this.scrollChatToBottom();
    this.bindHomeCardActions();
    this.bindPlanPanels();
    this.bindYearCalendar();
    if (!Store.isChatCollapsed()) this.updateChatLlmStatus();
    else {
      const el = document.getElementById('chatLlmStatus');
      if (el) {
        el.textContent = '已收起 · 点击右侧展开';
        el.classList.remove('chat-llm-error');
      }
    }

    document.querySelectorAll('.dept-card').forEach((el) => {
      el.addEventListener('click', () => {
        const dept = getDepartment(el.dataset.dept);
        if (dept?.layout === 'pages' && dept.modules[0]) {
          this.navigate('module', { deptId: dept.id, moduleId: dept.modules[0].id });
        } else {
          this.navigate('dept', { deptId: el.dataset.dept });
        }
      });
    });
  },

  bindDept(deptId) {
    const dept = getDepartment(deptId);
    if (dept?.layout === 'accordion') {
      this.bindDeptAccordion(deptId);
      return;
    }

    document.querySelectorAll('.module-card').forEach((el) => {
      el.addEventListener('click', () =>
        this.navigate('module', { deptId: el.dataset.dept, moduleId: el.dataset.module })
      );
    });
  },

  bindDeptAccordion(deptId) {
    const expandedSet = this.getDeptExpanded(deptId);

    const toggleItem = (item) => {
      if (!item) return;
      const moduleId = item.dataset.module;
      if (expandedSet.has(moduleId)) {
        expandedSet.delete(moduleId);
        item.classList.remove('expanded');
      } else {
        expandedSet.add(moduleId);
        item.classList.add('expanded');
      }
      // 同步生活模块展开按钮文案
      const collapseBtn = item.querySelector('.accordion-collapse-btn');
      if (collapseBtn) {
        const open = item.classList.contains('expanded');
        collapseBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        collapseBtn.title = open ? '收起' : '展开';
        const label = collapseBtn.querySelector('.chat-collapse-label');
        const chevron = collapseBtn.querySelector('.chat-collapse-chevron');
        if (label) label.textContent = open ? '收起' : '展开';
        if (chevron) chevron.textContent = open ? '‹' : '›';
      }
    };

    document.querySelectorAll('.accordion-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleItem(btn.closest('.accordion-item'));
      });
    });

    document.querySelectorAll('.accordion-collapse-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleItem(btn.closest('.accordion-item'));
      });
    });

    document.querySelectorAll('.btn-add-record').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.module === 'sleep') {
          this.openSleepTypePicker(btn.dataset.dept, btn.dataset.module);
          return;
        }
        this.openModal(btn.dataset.dept, btn.dataset.module);
      });
    });

    document.querySelectorAll('.btn-edit-module').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModuleEditModal(btn.dataset.dept, btn.dataset.module);
      });
    });

    this.bindSortMenus('.accordion-list');
    this.bindCustomReorder('.accordion-list');
    this.bindRecordMoreMenus('.accordion-list');
    this.bindRecordAccordions('.accordion-list');
    this.bindRecordActions('.accordion-list');
    this.bindSleepViews('.accordion-list');
    this.bindStudyViews('.accordion-list');
    this.bindHabitChecklist();
    this.bindWeekdayCheckin();
  },

  bindHabitChecklist() {
    document.querySelectorAll('.habit-checklist').forEach((panel) => {
      const deptId = panel.dataset.dept;
      const moduleId = panel.dataset.module;
      const mod = getModule(deptId, moduleId);
      const checklist = mod?.habitChecklist || [];

      panel.querySelectorAll('.habit-check').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('[data-habit-label]');
          if (!item) return;
          Store.toggleHabitCheck(deptId, moduleId, item.dataset.habitLabel, checklist);
          this.render();
        });
      });
    });
  },

  bindWeekdayCheckin() {
    document.querySelectorAll('.weekday-checkin').forEach((panel) => {
      const deptId = panel.dataset.dept;
      const moduleId = panel.dataset.module;

      panel.querySelectorAll('.weekday-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const day = btn.dataset.weekday;
          if (!day) return;
          Store.toggleWeekdayCheck(deptId, moduleId, day, WEEKDAY_LABELS);
          this.render();
        });
      });
    });
  },

  bindModulePage(deptId, moduleId) {
    const mod = getModule(deptId, moduleId);

    document.querySelectorAll('.module-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.module !== moduleId) {
          this.navigate('module', { deptId: btn.dataset.dept, moduleId: btn.dataset.module });
        } else if (mod?.recordView === 'bagu' && this.route.baguBank) {
          this.navigate('module', { deptId, moduleId });
        }
      });
    });

    if (mod?.recordView === 'leetcode') {
      this.bindHandwritePage(deptId, moduleId);
      return;
    }

    if (mod?.recordView === 'bagu') {
      this.bindBaguPage(deptId, moduleId);
      return;
    }

    if (mod?.recordView === 'interview') {
      this.bindInterviewPage(deptId, moduleId);
      return;
    }

    if (mod?.recordView === 'project') {
      this.bindProjectPage(deptId, moduleId);
      return;
    }

    if (mod?.recordView === 'habitChecklist' || mod?.recordView === 'weekdayCheckin') {
      document.querySelector('[data-back-dept]')?.addEventListener('click', (e) => {
        this.navigate('dept', { deptId: e.target.dataset.backDept });
      });
      document.querySelectorAll('.btn-edit-module').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openModuleEditModal(btn.dataset.dept, btn.dataset.module);
        });
      });
      this.bindHabitChecklist();
      this.bindWeekdayCheckin();
      return;
    }

    document.querySelector('[data-back-dept]')?.addEventListener('click', (e) => {
      this.navigate('dept', { deptId: e.target.dataset.backDept });
    });

    document.querySelectorAll('.btn-add-record').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModal(btn.dataset.dept, btn.dataset.module);
      });
    });

    document.querySelectorAll('.btn-edit-module').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModuleEditModal(btn.dataset.dept, btn.dataset.module);
      });
    });

    this.bindSortMenus('.module-page');
    this.bindCustomReorder('.module-page');
    this.bindRecordMoreMenus('.module-page');
    this.bindRecordAccordions('.module-page');
    this.bindRecordActions('.module-page');
  },

  bindModule(deptId, moduleId) {
    this.bindModulePage(deptId, moduleId);
  },

  bindBaguClassify(bankId) {
    const btn = document.getElementById('btnBaguClassify');
    const input = document.getElementById('baguTitleInput');
    const hint = document.getElementById('baguClassifyHint');
    if (!btn || !input) return;

    const form = document.getElementById('recordForm');
    const bank = getBaguBank(bankId) || getBaguBank(form?.elements?.bank?.value || '');

    const setHint = (text, cls = '') => {
      if (!hint) return;
      hint.textContent = text;
      hint.className = `form-hint lc-lookup-hint ${cls}`.trim();
    };

    const fillField = (name, value) => {
      const el = form?.elements?.[name];
      if (!el || value === null || value === undefined || value === '') return;
      el.value = value;
    };

    const runClassify = async () => {
      const title = String(input.value || '').trim();
      if (!title) {
        setHint('请先填写题目', 'is-error');
        input.focus();
        return;
      }

      const currentBankId = bank?.id || form?.elements?.bank?.value || bankId || '';
      const currentBank = getBaguBank(currentBankId) || bank;

      btn.disabled = true;
      input.disabled = true;
      setHint('正在识别分类与难度…');
      try {
        const res = await fetch('/api/bagu/classify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            bankId: currentBankId,
            bankName: currentBank?.name || '',
            categories: currentBank?.categories || [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '识别失败');

        fillField('category', data.category);
        fillField('difficulty', data.difficulty);
        fillField('tags', data.tags);
        fillField('learnOrder', data.learnOrder);

        const src = data.source === 'llm' ? 'LLM' : '规则引擎';
        setHint(`识别成功（${src}）· ${data.category || '未分类'} · ${data.difficulty || '中等'} · 学习序 ${data.learnOrder}`, 'is-ok');
      } catch (err) {
        setHint(err.message || '识别失败，请稍后重试', 'is-error');
      } finally {
        btn.disabled = false;
        input.disabled = false;
      }
    };

    btn.addEventListener('click', runClassify);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runClassify();
      }
    });
  },

  async runBaguSmartSort(deptId, moduleId, bankId) {
    const bank = getBaguBank(bankId);
    const records = Store.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    if (!records.length) {
      alert('当前题库还没有题目');
      return;
    }
    if (!confirm(`将对「${bank?.name || bankId}」共 ${records.length} 道题自动分类，并按难度/学习曲线重排。是否继续？`)) {
      return;
    }

    const btn = document.querySelector('.btn-bagu-smart-sort');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '排序中…';
    }

    try {
      const res = await fetch('/api/bagu/smart-sort', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId,
          bankName: bank?.name || '',
          categories: bank?.categories || [],
          questions: records.map((r) => ({ id: r.id, title: r.title || '' })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '智能排序失败');

      Store.applyBaguSmartOrder(deptId, moduleId, bankId, data.items || []);
      this.baguDraft = null;
      this.baguEditing = null;
      try {
        await Store.flushSave();
      } catch {
        /* local ok */
      }
      this.render();
      alert(`已完成智能排序（${(data.items || [])[0]?.source === 'llm' ? 'LLM' : '规则引擎'}）`);
    } catch (err) {
      alert(err.message || '智能排序失败');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '智能排序';
      }
    }
  },

  bindLeetcodeLookup() {
    const form = document.getElementById('recordForm');
    const btn = document.getElementById('btnLcLookup');
    const input = document.getElementById('lcNumberInput');
    const hint = document.getElementById('lcLookupHint');
    if (!btn || !input || !form) return;

    const setHint = (text, type = '') => {
      if (!hint) return;
      hint.textContent = text;
      hint.classList.remove('is-error', 'is-ok');
      if (type) hint.classList.add(type);
    };

    const fillField = (name, value) => {
      const el = form.elements[name];
      if (!el || value === null || value === undefined || value === '') return;
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = value;
      }
    };

    const runLookup = async () => {
      const lcNumber = String(input.value || '').trim();
      if (!lcNumber) {
        setHint('请先输入力扣题号', 'is-error');
        input.focus();
        return;
      }
      btn.disabled = true;
      input.disabled = true;
      setHint('正在识别题目信息…');
      try {
        const res = await fetch('/api/leetcode/lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lcNumber }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '识别失败');

        fillField('lcNumber', data.lcNumber);
        fillField('title', data.title);
        fillField('difficulty', data.difficulty);
        fillField('dataStructure', data.dataStructure);
        fillField('method', data.method);
        fillField('hot100', data.hot100);
        if (data.codetopFreq != null) fillField('codetopFreq', data.codetopFreq);
        if (data.note) fillField('note', data.note);

        const parts = [];
        if (data.source?.hot100) parts.push('Hot 100');
        if (data.source?.codetop && data.codetopFreq != null) parts.push(`CodeTop ${data.codetopFreq} 次`);
        setHint(parts.length ? `识别成功 · ${parts.join(' · ')}` : '识别成功', 'is-ok');
      } catch (err) {
        setHint(err.message || '识别失败，请稍后重试', 'is-error');
      } finally {
        btn.disabled = false;
        input.disabled = false;
      }
    };

    btn.addEventListener('click', runLookup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runLookup();
      }
    });
  },

  openModal(deptId, moduleId, existingData = null, options = {}) {
    const mod = getModule(deptId, moduleId);
    if (!mod) return;
    if (mod.recordView === 'habitChecklist' || mod.recordView === 'weekdayCheckin') return;

    this._sleepModalOptions = options || {};
    this.resetModalFooter();

    const isEdit = Boolean(existingData?.id);
    const isLeetcode = mod.recordView === 'leetcode';
    const isBagu = mod.recordView === 'bagu';
    const isInterview = mod.recordView === 'interview';
    if (isBagu && existingData) {
      existingData = this.normalizeBaguEditRecord(existingData);
    }
    const interviewSection = options.interviewSection || 'upcoming';
    const interviewDefaults =
      isInterview && !isEdit ? this.interviewSectionDateDefaults(interviewSection) : null;

    const titleText = isEdit
      ? `编辑${isLeetcode || isBagu ? '题目' : isInterview ? '面试' : mod.name}`
      : isLeetcode || isBagu
        ? '添加题目'
        : isInterview
          ? interviewSection === 'past'
            ? '添加复盘'
            : '添加面试'
          : mod.name;
    this.setModalTitle(mod, titleText);
    const isDateTimeRange = mod.dateMode === 'datetimeRange';
    const isDateTime = mod.dateMode === 'datetime';
    const dateLabel = mod.dateLabel || '日期';
    const dateValue = isDateTimeRange || isDateTime
      ? this.toDateTimeLocalValue(existingData) || interviewDefaults?.date || this.nowDateTimeLocal()
      : existingData?.date || todayStr();
    const endTimeValue = isDateTimeRange
      ? this.toEndTimeValue(existingData, dateValue) || interviewDefaults?.endTime || ''
      : '';
    const presetBank = existingData?.bank || this.route.baguBank || '';
    const fields = mod.fields || [];
    const hasRichEditor = fields.some((f) => f.type === 'richtext');
    const modal = document.getElementById('modal');
    modal?.classList.toggle('modal-rich', hasRichEditor);
    modal?.classList.toggle('modal-bagu-answers', isBagu && hasRichEditor);

    const form = document.getElementById('recordForm');
    const dateFieldHtml = isLeetcode || isBagu
      ? ''
      : isDateTimeRange
        ? `
      <div class="form-group">
        <label>${dateLabel}</label>
        <div class="datetime-range-row">
          <input type="datetime-local" name="date" value="${dateValue}" required>
          <span class="range-sep">-</span>
          <input type="time" name="endTime" value="${endTimeValue}" required>
        </div>
      </div>`
        : `
      <div class="form-group">
        <label>${dateLabel}</label>
        <input type="${isDateTime ? 'datetime-local' : 'date'}" name="date" value="${dateValue}" required>
      </div>`;

    const fieldDefault = (f) => {
      if (existingData?.[f.key] != null && existingData[f.key] !== '') return existingData[f.key];
      if (isInterview && !isEdit && interviewSection === 'past' && f.key === 'result') return '通过';
      return f.default ?? '';
    };
    form.innerHTML = `
      ${dateFieldHtml}
      ${fields
        .map((f) => {
          const val = fieldDefault(f);
          if (isBagu && f.key === 'title') {
            const learnOrderVal = existingData?.learnOrder ?? '';
            return `
              <div class="form-group">
                <label>${f.label}</label>
                <div class="lc-lookup-row">
                  <input type="text" name="title" id="baguTitleInput" value="${this.escapeHtml(String(val))}"
                    ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}
                    ${f.required ? 'required' : ''}>
                  <button type="button" class="btn btn-secondary" id="btnBaguClassify">自动识别</button>
                </div>
                <input type="hidden" name="learnOrder" id="baguLearnOrderInput" value="${this.escapeHtml(String(learnOrderVal))}">
                <p class="form-hint lc-lookup-hint" id="baguClassifyHint">输入题目后点「自动识别」，将填充分类、难度、标签，并按学习曲线排序</p>
              </div>`;
          }
          if (isLeetcode && f.key === 'lcNumber') {
            return `
              <div class="form-group">
                <label>${f.label}</label>
                <div class="lc-lookup-row">
                  <input type="${f.type}" name="${f.key}" id="lcNumberInput" value="${val}"
                    ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}
                    ${f.min !== undefined ? `min="${f.min}"` : ''}
                    ${f.required ? 'required' : ''}>
                  <button type="button" class="btn btn-secondary" id="btnLcLookup">自动识别</button>
                </div>
                <p class="form-hint lc-lookup-hint" id="lcLookupHint">输入题号后点「自动识别」，将填充题名、难度、标签与思路</p>
              </div>`;
          }
          if (f.type === 'checkbox') {
            const checked = existingData ? Boolean(existingData[f.key]) : Boolean(f.default);
            return `
              <div class="form-group form-check">
                <label><input type="checkbox" name="${f.key}" ${checked ? 'checked' : ''}> ${f.label}</label>
              </div>`;
          }
          if (f.type === 'bagu-links') return '';
          if (f.type === 'select') {
            if (isBagu && f.key === 'bank' && presetBank && !isEdit) {
              return `<input type="hidden" name="${f.key}" value="${this.escapeHtml(presetBank)}">`;
            }
            const selectOptions =
              isBagu && f.key === 'bank' && typeof baguBankSelectOptions === 'function'
                ? baguBankSelectOptions()
                : f.options || [];
            const optionsHtml = selectOptions
              .map((o) => {
                const value = typeof o === 'object' && o !== null ? o.value : o;
                const label = typeof o === 'object' && o !== null ? o.label : o;
                const selected = String(val) === String(value) ? 'selected' : '';
                return `<option value="${this.escapeHtml(String(value))}" ${selected}>${this.escapeHtml(String(label))}</option>`;
              })
              .join('');
            return `
              <div class="form-group">
                <label>${f.label}</label>
                <select name="${f.key}" ${f.required ? 'required' : ''}>${optionsHtml}</select>
              </div>`;
          }
          if (f.type === 'bagu-category') {
            const bankForCategory = getBaguBank(presetBank || existingData?.bank || '');
            const categories = bankForCategory?.categories || [];
            if (categories.length) {
              const optionsHtml = [
                `<option value="">请选择分类</option>`,
                ...categories.map((c) => {
                  const selected = String(val) === String(c) ? 'selected' : '';
                  return `<option value="${this.escapeHtml(c)}" ${selected}>${this.escapeHtml(c)}</option>`;
                }),
              ].join('');
              return `
                <div class="form-group">
                  <label>${f.label}</label>
                  <select name="${f.key}">${optionsHtml}</select>
                </div>`;
            }
            return `
              <div class="form-group">
                <label>${f.label}</label>
                <input type="text" name="${f.key}" value="${this.escapeHtml(String(val))}"
                  placeholder="如 索引、事务与锁">
              </div>`;
          }
          if (f.type === 'richtext') {
            const placeholders = {
              approach: '先讲结论，再分点展开，最后补充注意点…',
              answer: '完整参考答案，可含标题、列表、代码块…',
              followUp: '面试官可能追问的问题与简要答法…',
            };
            const ph = placeholders[f.key] || '支持标题、列表、代码块、高亮…';
            return `
              <div class="form-group form-group-rich">
                <label>${f.label}</label>
                <input type="hidden" name="${f.key}" id="richEditorInput-${f.key}">
                <div class="rich-editor-shell">
                  <div class="rich-editor-host" id="richEditorHost-${f.key}" data-placeholder="${this.escapeHtml(ph)}"></div>
                </div>
              </div>`;
          }
          if (f.type === 'textarea') {
            return `
              <div class="form-group">
                <label>${f.label}</label>
                <textarea name="${f.key}" ${f.required ? 'required' : ''}>${this.escapeHtml(String(val))}</textarea>
              </div>`;
          }
          return `
            <div class="form-group">
              <label>${f.label}</label>
              <input type="${f.type}" name="${f.key}" value="${val}"
                ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}
                ${f.min !== undefined ? `min="${f.min}"` : ''}
                ${f.max !== undefined ? `max="${f.max}"` : ''}
                ${f.step !== undefined ? `step="${f.step}"` : ''}
                ${f.required ? 'required' : ''}>
            </div>`;
        })
        .join('')}
      ${isEdit && (mod.editable || isLeetcode || isBagu) ? `
        <div class="form-delete-zone">
          <button type="button" class="btn btn-danger-ghost" id="btnDeleteRecord">删除这条记录</button>
        </div>` : ''}
    `;

    document.getElementById('btnDeleteRecord')?.addEventListener('click', () => {
      if (confirm('确定删除这条记录？')) {
        Store.deleteRecord(deptId, moduleId, existingData.id);
        if (isBagu) this.unlinkBaguFromAllProjects(existingData.id);
        if (isBagu && this.route.baguBank && this.isBaguEditing(deptId, moduleId, this.route.baguBank)) {
          this.syncBaguDraftWithRecords(deptId, moduleId, this.route.baguBank);
        }
        this.closeModal();
        this.render();
      }
    });

    if (isLeetcode) {
      this.bindLeetcodeLookup();
    }

    if (isBagu) {
      this.bindBaguClassify(presetBank || existingData?.bank || '');
    }

    if (hasRichEditor) {
      RichEditor.destroyAll();
      fields
        .filter((f) => f.type === 'richtext')
        .forEach((f) => {
          const initial = existingData?.[f.key] ?? '';
          const host = document.getElementById(`richEditorHost-${f.key}`);
          const placeholder = host?.dataset?.placeholder || undefined;
          RichEditor.mount(`richEditorHost-${f.key}`, `richEditorInput-${f.key}`, initial, {
            placeholder,
          });
        });
    }

    form.onsubmit = (e) => {
      e.preventDefault();
      if (hasRichEditor) RichEditor.syncAll();
      const fd = new FormData(form);
      const entry = {};
      for (const [k, v] of fd.entries()) {
        if (v !== '') entry[k] = v;
      }
      fields.forEach((f) => {
        if (f.type === 'checkbox') entry[f.key] = fd.get(f.key) === 'on';
      });
      if (entry.learnOrder != null && entry.learnOrder !== '') {
        const n = Number(entry.learnOrder);
        if (Number.isFinite(n)) entry.learnOrder = n;
        else delete entry.learnOrder;
      }
      if (isLeetcode && !isEdit) entry.done = false;
      if (isBagu && !isEdit) entry.done = false;
      let savedId = existingData?.id || null;
      if (isEdit) {
        Store.updateRecord(deptId, moduleId, existingData.id, entry);
        savedId = existingData.id;
      } else {
        const created = Store.addRecord(deptId, moduleId, entry);
        savedId = created?.id || null;
        if (isBagu && options.linkProject?.projectId && !options.linkBodyComment) {
          this.linkBaguToProject(options.linkProject.projectId, created.id);
        }
      }
      if (isBagu && options.linkBodyComment && savedId) {
        this._bodyCommentModalSaved = true;
        this.applyLinkBodyCommentAfterBaguSave(options, entry, savedId, isEdit);
      }
      if (isLeetcode && this.isHandwriteEditing(deptId, moduleId)) {
        this.syncHandwriteDraftWithRecords(deptId, moduleId);
      }
      if (isBagu && this.route.baguBank && this.isBaguEditing(deptId, moduleId, this.route.baguBank)) {
        this.syncBaguDraftWithRecords(deptId, moduleId, this.route.baguBank);
      }
      this.closeModal();
      this.render();
    };

    
    if (moduleId === 'sleep') {
      const formEl = document.getElementById('recordForm');
      const opts = this._sleepModalOptions || {};
      const sleepType = this.normalizeSleepType(
        opts.sleepType || existingData?.sleepType || 'long'
      );
      if (formEl && !formEl.querySelector('input[name="sleepType"]')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'sleepType';
        hidden.value = sleepType;
        formEl.appendChild(hidden);
      }
      const hoursInput = formEl?.querySelector('input[name="hours"]');
      const qualityInput = formEl?.querySelector('input[name="quality"]');
      if (hoursInput) {
        hoursInput.readOnly = true;
        hoursInput.placeholder = '自动计算';
      }
      if (qualityInput) {
        qualityInput.readOnly = true;
        qualityInput.placeholder = '自动计算';
        qualityInput.min = '0';
        qualityInput.max = '100';
      }
      this.bindSleepAutoCalc(formEl);
    }

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  openModuleEditModal(deptId, moduleId) {
    const mod = getModule(deptId, moduleId);
    const defaults = getModuleDefaults(deptId, moduleId);
    if (!mod || !defaults) return;

    document.getElementById('modalTitle').textContent = `${mod.icon} 编辑模块`;
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="form-group">
        <label>名称</label>
        <input type="text" id="moduleNameInput" maxlength="12" required>
      </div>
      <div class="form-group">
        <label>图标（emoji）</label>
        <input type="text" id="moduleIconInput" maxlength="4" placeholder="📚">
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" id="moduleDescInput" maxlength="40" placeholder="简短说明">
      </div>
      <p class="settings-hint">修改保存在本地，可随时恢复默认。</p>
      <div class="form-delete-zone" style="margin-top:16px;padding-top:16px">
        <button type="button" class="btn btn-danger-ghost" id="btnResetModuleMeta">恢复默认</button>
      </div>
    `;

    document.getElementById('moduleNameInput').value = mod.name;
    document.getElementById('moduleIconInput').value = mod.icon;
    document.getElementById('moduleDescInput').value = mod.desc;

    document.getElementById('btnResetModuleMeta').addEventListener('click', () => {
      if (confirm('恢复该模块的默认名称、图标和描述？')) {
        Store.resetModuleMeta(deptId, moduleId);
        this.closeModal();
        this.render();
      }
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('moduleNameInput').value.trim();
      const icon = document.getElementById('moduleIconInput').value.trim() || defaults.icon;
      const desc = document.getElementById('moduleDescInput').value.trim();
      if (!name) return;

      if (name === defaults.name && icon === defaults.icon && desc === defaults.desc) {
        Store.resetModuleMeta(deptId, moduleId);
      } else {
        Store.saveModuleMeta(deptId, moduleId, { name, icon, desc });
      }
      this.closeModal();
      this.render();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  openDeptEditModal(deptId) {
    const dept = getDeptBase(deptId);
    const defaults = getDepartmentDefaults(deptId);
    if (!dept || !defaults) return;

    document.getElementById('modalTitle').textContent = `${dept.order} 编辑部门`;
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="form-group">
        <label>编号</label>
        <input type="text" id="deptOrderInput" maxlength="4" placeholder="01" required>
      </div>
      <div class="form-group">
        <label>名称</label>
        <input type="text" id="deptNameInput" maxlength="12" required>
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" id="deptDescInput" maxlength="40" placeholder="部门简介">
      </div>
      <p class="settings-hint">修改保存在本地，可随时恢复默认。</p>
      <div class="form-delete-zone" style="margin-top:16px;padding-top:16px">
        <button type="button" class="btn btn-danger-ghost" id="btnResetDeptMeta">恢复默认</button>
      </div>
    `;

    document.getElementById('deptOrderInput').value = dept.order;
    document.getElementById('deptNameInput').value = dept.name;
    document.getElementById('deptDescInput').value = dept.desc;

    document.getElementById('btnResetDeptMeta').addEventListener('click', () => {
      if (confirm('恢复该部门的默认编号、名称和描述？')) {
        Store.resetDeptMeta(deptId);
        this.closeModal();
        this.renderNav();
        this.render();
      }
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const order = document.getElementById('deptOrderInput').value.trim();
      const name = document.getElementById('deptNameInput').value.trim();
      const desc = document.getElementById('deptDescInput').value.trim();
      if (!order || !name) return;

      if (order === defaults.order && name === defaults.name && desc === defaults.desc) {
        Store.resetDeptMeta(deptId);
      } else {
        Store.saveDeptMeta(deptId, { order, name, desc });
      }
      this.closeModal();
      this.renderNav();
      this.render();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  openTopbarWidgetEditModal(widgetKey) {
    const defaults = TOPBAR_WIDGET_DEFAULTS[widgetKey];
    if (!defaults) return;

    const saved = Store.getTopbarWidgetStyle(widgetKey);
    const title = widgetKey === 'northStar' ? '北极星' : '最近面试';

    document.getElementById('modalTitle').textContent = `🎨 ${title} · 颜色`;
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="form-group">
        <label>渐变起始色</label>
        <input type="color" id="widgetColorFrom" value="${saved.colorFrom || defaults.colorFrom}">
      </div>
      <div class="form-group">
        <label>渐变结束色</label>
        <input type="color" id="widgetColorTo" value="${saved.colorTo || defaults.colorTo}">
      </div>
      ${
        widgetKey === 'interview'
          ? `
      <div class="form-group">
        <label>紧急状态起始色</label>
        <input type="color" id="widgetUrgentFrom" value="${saved.urgentFrom || defaults.urgentFrom}">
      </div>
      <div class="form-group">
        <label>紧急状态结束色</label>
        <input type="color" id="widgetUrgentTo" value="${saved.urgentTo || defaults.urgentTo}">
      </div>`
          : ''
      }
      <div class="widget-color-preview topbar-widget" id="widgetColorPreview">预览效果</div>
      <p class="settings-hint">修改保存在本地，可随时恢复默认。</p>
      <div class="form-delete-zone" style="margin-top:16px;padding-top:16px">
        <button type="button" class="btn btn-danger-ghost" id="btnResetWidgetStyle">恢复默认</button>
      </div>
    `;

    const preview = document.getElementById('widgetColorPreview');
    const fromInput = document.getElementById('widgetColorFrom');
    const toInput = document.getElementById('widgetColorTo');
    const urgentFromInput = document.getElementById('widgetUrgentFrom');
    const urgentToInput = document.getElementById('widgetUrgentTo');

    const syncPreview = () => {
      preview.style.background = `linear-gradient(135deg, ${fromInput.value}, ${toInput.value})`;
    };

    fromInput.addEventListener('input', syncPreview);
    toInput.addEventListener('input', syncPreview);
    syncPreview();

    document.getElementById('btnResetWidgetStyle').addEventListener('click', () => {
      if (confirm(`恢复${title}的默认颜色？`)) {
        Store.resetTopbarWidgetStyle(widgetKey);
        this.closeModal();
        this.applyTopbarWidgetStyles();
      }
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const partial = {
        colorFrom: fromInput.value,
        colorTo: toInput.value,
      };
      if (widgetKey === 'interview') {
        partial.urgentFrom = urgentFromInput.value;
        partial.urgentTo = urgentToInput.value;
      }

      const isDefault =
        partial.colorFrom === defaults.colorFrom &&
        partial.colorTo === defaults.colorTo &&
        (widgetKey !== 'interview' ||
          (partial.urgentFrom === defaults.urgentFrom && partial.urgentTo === defaults.urgentTo));

      if (isDefault) {
        Store.resetTopbarWidgetStyle(widgetKey);
      } else {
        Store.saveTopbarWidgetStyle(widgetKey, partial);
      }
      this.closeModal();
      this.applyTopbarWidgetStyles();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  renderProfile() {
    const profile = Store.getProfile();
    const nameEl = document.getElementById('profileName');
    const imgEl = document.getElementById('profileAvatarImg');
    const fallbackEl = document.getElementById('profileAvatarFallback');
    const signatureTextEl = document.getElementById('profileSignatureText');
    if (!nameEl) return;

    const username = profile.username?.trim() || 'CEO';
    nameEl.textContent = username;

    const signature = profile.signature?.trim() || '个人公司';
    if (signatureTextEl) signatureTextEl.textContent = signature;

    if (profile.avatar) {
      imgEl.src = profile.avatar;
      imgEl.classList.remove('hidden');
      fallbackEl.textContent = username.charAt(0).toUpperCase();
      fallbackEl.classList.add('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
      fallbackEl.textContent = username.charAt(0).toUpperCase();
      fallbackEl.classList.remove('hidden');
    }
  },

  async compressAvatar(file) {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    if (file.size > 2 * 1024 * 1024) throw new Error('图片不能超过 2MB');

    const bitmap = await createImageBitmap(file);
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const min = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - min) / 2;
    const sy = (bitmap.height - min) / 2;
    ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  },

  openProfileModal() {
    const profile = Store.getProfile();
    this.profileDraft = {
      username: profile.username || 'CEO',
      avatar: profile.avatar || null,
      signature: profile.signature ?? '个人公司',
    };

    document.getElementById('modalTitle').textContent = '👤 个人资料';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <div class="profile-preview">
        <span class="profile-avatar" id="modalProfileAvatar">
          <img id="modalProfileAvatarImg" class="profile-avatar-img ${this.profileDraft.avatar ? '' : 'hidden'}" alt=""
            ${this.profileDraft.avatar ? `src="${this.profileDraft.avatar}"` : ''}>
          <span class="profile-avatar-fallback ${this.profileDraft.avatar ? 'hidden' : ''}" id="modalProfileAvatarFallback">
            ${(this.profileDraft.username || 'C').charAt(0).toUpperCase()}
          </span>
        </span>
        <div class="profile-upload-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btnPickAvatar">上传头像</button>
          <button type="button" class="btn btn-ghost btn-sm ${this.profileDraft.avatar ? '' : 'hidden'}" id="btnRemoveAvatar">移除头像</button>
        </div>
        <input type="file" id="avatarFileInput" accept="image/*" hidden>
      </div>
      <div class="form-group">
        <label>用户名</label>
        <input type="text" name="username" id="profileUsernameInput" maxlength="20" placeholder="你的名字" required>
      </div>
      <div class="form-group">
        <label>个性签名</label>
        <input type="text" id="profileSignatureInput" maxlength="30" placeholder="写一句个性签名">
      </div>
    `;

    const usernameInput = document.getElementById('profileUsernameInput');
    const signatureInput = document.getElementById('profileSignatureInput');
    usernameInput.value = this.profileDraft.username;
    signatureInput.value = this.profileDraft.signature;
    const imgEl = document.getElementById('modalProfileAvatarImg');
    const fallbackEl = document.getElementById('modalProfileAvatarFallback');
    const removeBtn = document.getElementById('btnRemoveAvatar');

    const syncPreview = () => {
      const name = usernameInput.value.trim() || 'CEO';
      if (this.profileDraft.avatar) {
        imgEl.src = this.profileDraft.avatar;
        imgEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
      } else {
        imgEl.classList.add('hidden');
        fallbackEl.textContent = name.charAt(0).toUpperCase();
        fallbackEl.classList.remove('hidden');
      }
      removeBtn.classList.toggle('hidden', !this.profileDraft.avatar);
    };

    usernameInput.addEventListener('input', syncPreview);

    document.getElementById('btnPickAvatar').addEventListener('click', () => {
      document.getElementById('avatarFileInput').click();
    });

    document.getElementById('avatarFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        this.profileDraft.avatar = await this.compressAvatar(file);
        syncPreview();
      } catch (err) {
        alert(err.message || '头像上传失败');
      }
      e.target.value = '';
    });

    removeBtn.addEventListener('click', () => {
      this.profileDraft.avatar = null;
      syncPreview();
    });

    form.onsubmit = (e) => {
      e.preventDefault();
      const username = usernameInput.value.trim() || 'CEO';
      const signature = signatureInput.value.trim() || '个人公司';
      Store.saveProfile({
        username,
        avatar: this.profileDraft.avatar,
        signature,
      });
      this.renderProfile();
      this.closeModal();
    };

    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  openSettingsModal() {
    const s = NLP.getSettings();
    document.getElementById('modalTitle').textContent = '⚙️ LLM 设置';
    const form = document.getElementById('recordForm');
    form.innerHTML = `
      <p class="settings-hint">通过本地服务转发连接 Kimi，避免浏览器跨域问题。保存后可在聊天区看到连接状态。</p>
      <div class="form-group">
        <label>API Base URL</label>
        <input type="text" name="baseUrl" value="${s.baseUrl}" placeholder="https://api.moonshot.cn/v1">
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" name="apiKey" value="${s.apiKey}" placeholder="sk-...">
      </div>
      <div class="form-group">
        <label>模型</label>
        <input type="text" name="model" value="${s.model}" placeholder="kimi-k3">
      </div>
      <div class="form-group form-check">
        <label><input type="checkbox" name="preferLLM" ${s.preferLLM ? 'checked' : ''}> 优先使用 LLM</label>
      </div>
      <p class="settings-hint" id="llmTestResult"></p>
      <button type="button" class="btn btn-ghost btn-sm" id="btnTestLLM">测试连接</button>
    `;
    document.getElementById('btnTestLLM')?.addEventListener('click', async () => {
      const fd = new FormData(form);
      const resultEl = document.getElementById('llmTestResult');
      resultEl.textContent = '测试中…';
      try {
        const res = await fetch('/api/llm/test', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: fd.get('baseUrl'),
            apiKey: fd.get('apiKey'),
            model: fd.get('model'),
            preferLLM: fd.get('preferLLM') === 'on',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '连接失败');
        resultEl.textContent = `✅ 已连上 ${data.model}（${data.baseUrl}）`;
      } catch (err) {
        resultEl.textContent = `❌ ${err.message}`;
      }
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      NLP.saveSettings({
        baseUrl: fd.get('baseUrl'),
        apiKey: fd.get('apiKey'),
        model: fd.get('model'),
        preferLLM: fd.get('preferLLM') === 'on',
      });
      await Store._persistFile(Store.load());
      this.closeModal();
      alert('设置已保存');
      if (this.route.view === 'home') {
        this.render();
      }
    };
    document.getElementById('modalOverlay').classList.remove('hidden');
  },

  closeModal() {
    RichEditor.destroyAll();
    document.getElementById('modal')?.classList.remove('modal-rich');
    document.getElementById('modal')?.classList.remove('modal-bagu-answers');
    this.resetModalFooter();
    document.getElementById('modalOverlay').classList.add('hidden');

    // 取消八股弹窗时，清掉划词草稿高亮
    const clearComposeDraft =
      !this._bodyCommentModalSaved && this._commentPanelState?.mode === 'compose';
    if (clearComposeDraft) {
      this._commentPanelState = null;
      this._pendingBodyComment = null;
    }
    this._bodyCommentModalSaved = false;

    if (this._projectDescTipsOpen) {
      this._projectDescTipsOpen = false;
      this._projectDescTipsProjectId = null;
      if (this.route?.view === 'module') {
        const mod = getModule(this.route.deptId, this.route.moduleId);
        if (mod?.recordView === 'project') {
          this.mountProjectEditors(Store.getSortedRecords(this.route.deptId, this.route.moduleId));
        }
      }
    } else if (clearComposeDraft && this.route?.view === 'module') {
      const mod = getModule(this.route.deptId, this.route.moduleId);
      if (mod?.recordView === 'project') this.render();
    }
  },

  bindGlobal() {
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') this.closeModal();
    });

    document.getElementById('btnProfile')?.addEventListener('click', () => this.openProfileModal());
    document.getElementById('btnSettings').addEventListener('click', () => this.openSettingsModal());
    document.getElementById('btnRecycleBin')?.addEventListener('click', () => this.navigate('recycle'));

    document.getElementById('btnHeaderBgUpload')?.addEventListener('click', () => {
      document.getElementById('headerBgFileInput')?.click();
    });

    document.getElementById('btnHeaderBgRemove')?.addEventListener('click', () => {
      const key = this.getHeaderBackgroundKey();
      if (!key) return;
      if (confirm('移除当前页的背景图？')) {
        Store.removeHeaderBackground(key);
        this.applyHeaderBackground();
      }
    });

    document.getElementById('headerBgFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const key = this.getHeaderBackgroundKey();
      if (!file || !key) return;
      try {
        const dataUrl = await this.processHeaderBackground(file);
        Store.saveHeaderBackground(key, dataUrl);
        this.applyHeaderBackground();
      } catch (err) {
        alert(err.message || '背景图处理失败');
      }
      e.target.value = '';
    });

    document.querySelector('.topbar-right')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-edit-topbar-widget');
      if (!btn) return;
      e.stopPropagation();
      this.openTopbarWidgetEditModal(btn.dataset.widget);
    });

    document.getElementById('btnExport').addEventListener('click', () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `opc-data-${todayStr()}.json`;
      a.click();
    });

    document.getElementById('btnImport').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      localStorage.removeItem('opc_dashboard_data');
      window.location.href = '/';
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJSON(reader.result);
          alert('导入成功');
          this.renderProfile();
          this.render();
        } catch {
          alert('导入失败，文件格式不对');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  },

  updateDate() {
    document.getElementById('todayDate').textContent = formatDate(todayStr());
    const cd = getNorthStarCountdown();
    const el = document.getElementById('northStarCountdown');
    el.textContent = cd.label;
    el.classList.toggle('overdue', cd.overdue);
    el.classList.toggle('urgent', !cd.overdue && cd.days <= 7);
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await App.ensureAuth();
  if (!auth) return;
  await Store.init();
  if (!Store.isFileSync()) {
    window.location.href = '/?login=1';
    return;
  }
  App.init();
});
