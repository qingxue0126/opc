const STORAGE_KEY = 'opc_dashboard_data';

const Store = {
  _cache: null,
  _fileSync: false,
  _saveTimer: null,
  _ready: null,

  init() {
    if (!this._ready) this._ready = this._bootstrap();
    return this._ready;
  },

  isFileSync() {
    return this._fileSync;
  },

  async _bootstrap() {
    try {
      const res = await fetch('/api/data', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = '/';
        return;
      }
      if (!res.ok) throw new Error('api unavailable');
      const fileData = await res.json();
      const localRaw = localStorage.getItem(STORAGE_KEY);
      const localData = localRaw ? JSON.parse(localRaw) : null;

      this._fileSync = true;

      if (this._hasUserData(fileData)) {
        this._cache = this.migrate({ ...fileData });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
      } else if (localData && this._hasUserData(localData)) {
        this._cache = this.migrate({ ...localData });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
        await this._persistFile(this._cache);
      } else {
        this._cache = this.migrate({ ...this._emptyData(), ...fileData });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
      }
    } catch {
      this._fileSync = false;
      this._cache = null;
    }
  },

  _emptyData() {
    return { records: {}, cards: [], settings: {}, chatMessages: [] };
  },

  _hasUserData(data) {
    if (!data) return false;
    if (Object.keys(data.records || {}).length > 0) return true;
    if ((data.cards || []).length > 0) return true;
    if (data.settings && Object.keys(data.settings).length > 0) return true;
    if ((data.chatMessages || []).length > 0) return true;
    return false;
  },

  async _persistFile(data) {
    if (!this._fileSync) return;
    const res = await fetch('/api/data', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.status === 401) window.location.href = '/';
  },

  load() {
    try {
      if (this._cache) return this.migrate(JSON.parse(JSON.stringify(this._cache)));
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : this._emptyData();
      return this.migrate(data);
    } catch {
      return this._emptyData();
    }
  },

  save(data) {
    this._cache = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (this._fileSync) {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this._persistFile(data).catch(() => {});
      }, 300);
    }
  },

  flushSave() {
    if (!this._cache) return Promise.resolve();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
    if (!this._fileSync) return Promise.resolve();
    clearTimeout(this._saveTimer);
    return this._persistFile(this._cache);
  },

  migrate(data) {
    if (!data.records) return data;

    let changed = false;
    const records = { ...data.records };

    for (const key of Object.keys(data.records)) {
      if (key === 'core.learn') {
        const newKey = 'core.bagu';
        records[newKey] = [...(records[newKey] || []), ...data.records[key]];
        delete records[key];
        changed = true;
      } else if (key.startsWith('wellness.') || key.startsWith('appearance.')) {
        const newKey = key.replace(/^(wellness|appearance)\./, 'living.');
        records[newKey] = [...(records[newKey] || []), ...data.records[key]];
        delete records[key];
        changed = true;
      } else if (key.startsWith('life.')) {
        const newKey = key.replace(/^life\./, 'experience.');
        records[newKey] = [...(records[newKey] || []), ...data.records[key]];
        delete records[key];
        changed = true;
      }
    }

    if (data.settings?.recordSort) {
      const recordSort = { ...data.settings.recordSort };
      for (const key of Object.keys(recordSort)) {
        let newKey = null;
        if (key === 'core.learn') {
          newKey = 'core.bagu';
        } else if (key.startsWith('wellness.') || key.startsWith('appearance.')) {
          newKey = key.replace(/^(wellness|appearance)\./, 'living.');
        } else if (key.startsWith('life.')) {
          newKey = key.replace(/^life\./, 'experience.');
        }
        if (newKey) {
          recordSort[newKey] = recordSort[key];
          delete recordSort[key];
          changed = true;
        }
      }
      data.settings = { ...data.settings, recordSort };
    }

    if (data.settings?.moduleMeta?.['core.learn']) {
      data.settings = { ...data.settings };
      data.settings.moduleMeta = { ...data.settings.moduleMeta };
      if (!data.settings.moduleMeta['core.bagu']) {
        data.settings.moduleMeta['core.bagu'] = data.settings.moduleMeta['core.learn'];
      }
      delete data.settings.moduleMeta['core.learn'];
      changed = true;
    }

    // 睡眠质量：旧版 1–5 分 → 满分 100（×20）
    const sleepKey = 'living.sleep';
    if (Array.isArray(records[sleepKey])) {
      records[sleepKey] = records[sleepKey].map((r) => {
        if (!r || r.quality == null || r.quality === '') return r;
        const n = Number(r.quality);
        if (!Number.isFinite(n)) return r;
        if (n > 0 && n <= 5 && !r._qualityScaled) {
          changed = true;
          return { ...r, quality: String(Math.round(n * 20)), _qualityScaled: true };
        }
        return r;
      });
    }


    data.settings = data.settings || {};
    if (!Array.isArray(data.settings.recycleBin)) {
      data.settings.recycleBin = [];
    }
    if (!Array.isArray(data.settings.calendarTasks)) {
      data.settings.calendarTasks = [];
    }
    if (!data.settings.calendarDayOrders || typeof data.settings.calendarDayOrders !== 'object') {
      data.settings.calendarDayOrders = {};
    }
    if (!data.settings.calendarTheme || data.settings.calendarTheme === 'default') {
      data.settings.calendarTheme = 'summary';
      changed = true;
    }
    if (!data.settings.calendarWashDays || typeof data.settings.calendarWashDays !== 'object') {
      data.settings.calendarWashDays = {};
      changed = true;
    }
    if (!Array.isArray(data.settings.customBaguBanks)) {
      data.settings.customBaguBanks = [];
      changed = true;
    }
    if (typeof this._purgeExpiredRecycleBin === 'function') {
      if (this._purgeExpiredRecycleBin(data)) {
        changed = true;
      }
    }

    if (changed) {
      data.records = records;
      this.save(data);
    }

    return data;
  },

  recordKey(deptId, moduleId) {
    return `${deptId}.${moduleId}`;
  },

  getRecords(deptId, moduleId) {
    const data = this.load();
    const key = this.recordKey(deptId, moduleId);
    return (data.records[key] || []).sort((a, b) => b.date.localeCompare(a.date));
  },

  getRawRecords(deptId, moduleId) {
    const data = this.load();
    return data.records[this.recordKey(deptId, moduleId)] || [];
  },

  moduleSortKey(deptId, moduleId) {
    return `${deptId}.${moduleId}`;
  },

  getModuleSort(deptId, moduleId) {
    const key = this.moduleSortKey(deptId, moduleId);
    const saved = this.getSettings().recordSort?.[key];
    return { mode: saved?.mode || 'default', customOrder: saved?.customOrder || [] };
  },

  setModuleSort(deptId, moduleId, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.recordSort = data.settings.recordSort || {};
    const key = this.moduleSortKey(deptId, moduleId);
    data.settings.recordSort[key] = { ...this.getModuleSort(deptId, moduleId), ...partial };
    this.save(data);
  },

  parseRecordDateTime(record) {
    let raw = record?.date;
    if (!raw) return 0;
    if (!raw.includes('T') && record.interviewDate) {
      raw = record.interviewTime
        ? `${record.interviewDate}T${record.interviewTime}`
        : `${record.interviewDate}T00:00`;
    }
    const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  },

  getSortedRecords(deptId, moduleId) {
    const list = [...this.getRawRecords(deptId, moduleId)];

    // 睡眠：固定按日期由近到远，不支持自定义排序
    if (moduleId === 'sleep') {
      return list.sort((a, b) => {
        const da = String(b.date || '').localeCompare(String(a.date || ''));
        if (da) return da;
        const ta = String(b.bedtime || '').localeCompare(String(a.bedtime || ''));
        if (ta) return ta;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
    }

    const { mode, customOrder } = this.getModuleSort(deptId, moduleId);

    if (mode === 'time') {
      return list.sort((a, b) => this.parseRecordDateTime(a) - this.parseRecordDateTime(b));
    }

    if (mode === 'custom') {
      const order = customOrder.length ? customOrder : list.map((r) => r.id);
      const rank = new Map(order.map((id, i) => [id, i]));
      return list.sort((a, b) => {
        const ia = rank.has(a.id) ? rank.get(a.id) : 9999;
        const ib = rank.has(b.id) ? rank.get(b.id) : 9999;
        return ia - ib;
      });
    }

    return list.sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
  },

  initCustomOrder(deptId, moduleId) {
    const ids = this.getSortedRecords(deptId, moduleId).map((r) => r.id);
    this.setModuleSort(deptId, moduleId, { mode: 'custom', customOrder: ids });
  },

  moveCustomRecord(deptId, moduleId, recordId, delta) {
    const sort = this.getModuleSort(deptId, moduleId);
    const list = this.getRawRecords(deptId, moduleId);
    let order = sort.customOrder.length ? [...sort.customOrder] : list.map((r) => r.id);
    const idx = order.indexOf(recordId);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    this.setModuleSort(deptId, moduleId, { mode: 'custom', customOrder: order });
  },

  syncCustomOrderAfterChange(deptId, moduleId) {
    const sort = this.getModuleSort(deptId, moduleId);
    if (sort.mode !== 'custom') return;
    const list = this.getRawRecords(deptId, moduleId);
    const ids = new Set(list.map((r) => r.id));
    const order = sort.customOrder.filter((id) => ids.has(id));
    list.forEach((r) => {
      if (!order.includes(r.id)) order.unshift(r.id);
    });
    this.setModuleSort(deptId, moduleId, { customOrder: order });
  },

  isHandwriteModule(deptId, moduleId) {
    const mod = getModule(deptId, moduleId);
    return mod?.recordView === 'leetcode';
  },

  isBaguModule(deptId, moduleId) {
    const mod = getModule(deptId, moduleId);
    return mod?.recordView === 'bagu';
  },

  handwriteSortKey(deptId, moduleId) {
    return `${deptId}.${moduleId}`;
  },

  getHandwriteSort(deptId, moduleId) {
    const key = this.handwriteSortKey(deptId, moduleId);
    const saved = this.getSettings().handwriteSort?.[key];
    return {
      mode: saved?.mode || 'default',
      methodOrder: saved?.methodOrder || [],
      questionOrder: saved?.questionOrder || {},
    };
  },

  setHandwriteSort(deptId, moduleId, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.handwriteSort = data.settings.handwriteSort || {};
    const key = this.handwriteSortKey(deptId, moduleId);
    data.settings.handwriteSort[key] = { ...this.getHandwriteSort(deptId, moduleId), ...partial };
    this.save(data);
  },

  _handwriteMethodKey(record) {
    return record.method || '未分类';
  },

  _defaultHandwriteRecordSort(a, b) {
    const na = Number(a.lcNumber);
    const nb = Number(b.lcNumber);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (Number.isFinite(na) && !Number.isFinite(nb)) return -1;
    if (!Number.isFinite(na) && Number.isFinite(nb)) return 1;
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
  },

  _defaultHandwriteMethodSort(methods) {
    return [...methods].sort((a, b) => {
      const ia = HANDWRITE_METHOD_ORDER.indexOf(a);
      const ib = HANDWRITE_METHOD_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  },

  _buildDefaultHandwriteLayout(records) {
    const groups = new Map();
    records.forEach((record) => {
      const key = this._handwriteMethodKey(record);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    groups.forEach((list, method) => {
      groups.set(method, [...list].sort((a, b) => this._defaultHandwriteRecordSort(a, b)));
    });
    const methodOrder = this._defaultHandwriteMethodSort([...groups.keys()]);
    const questionOrder = {};
    methodOrder.forEach((method) => {
      questionOrder[method] = (groups.get(method) || []).map((r) => r.id);
    });
    return { methodOrder, questionOrder };
  },

  initHandwriteCustomOrder(deptId, moduleId) {
    const records = this.getRawRecords(deptId, moduleId);
    const layout = this._buildDefaultHandwriteLayout(records);
    this.setHandwriteSort(deptId, moduleId, {
      mode: 'custom',
      methodOrder: layout.methodOrder,
      questionOrder: layout.questionOrder,
    });
  },

  syncHandwriteSortAfterChange(deptId, moduleId) {
    const sort = this.getHandwriteSort(deptId, moduleId);
    if (sort.mode !== 'custom') return;

    const records = this.getRawRecords(deptId, moduleId);
    const groups = new Map();
    records.forEach((record) => {
      const method = this._handwriteMethodKey(record);
      if (!groups.has(method)) groups.set(method, []);
      groups.get(method).push(record.id);
    });

    let methodOrder = sort.methodOrder.filter((method) => groups.has(method));
    [...groups.keys()].forEach((method) => {
      if (!methodOrder.includes(method)) methodOrder.push(method);
    });

    const questionOrder = {};
    groups.forEach((allIds, method) => {
      const existing = (sort.questionOrder[method] || []).filter((id) => allIds.includes(id));
      allIds.forEach((id) => {
        if (!existing.includes(id)) existing.push(id);
      });
      questionOrder[method] = existing;
    });

    this.setHandwriteSort(deptId, moduleId, { methodOrder, questionOrder });
  },

  moveHandwriteMethod(deptId, moduleId, method, delta) {
    const sort = this.getHandwriteSort(deptId, moduleId);
    if (sort.mode !== 'custom') return;

    let methodOrder = sort.methodOrder.length
      ? [...sort.methodOrder]
      : [...this._buildDefaultHandwriteLayout(this.getRawRecords(deptId, moduleId)).methodOrder];
    const idx = methodOrder.indexOf(method);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= methodOrder.length) return;
    [methodOrder[idx], methodOrder[next]] = [methodOrder[next], methodOrder[idx]];
    this.setHandwriteSort(deptId, moduleId, { methodOrder });
  },

  moveHandwriteRecord(deptId, moduleId, method, recordId, delta) {
    const sort = this.getHandwriteSort(deptId, moduleId);
    if (sort.mode !== 'custom') return;

    const questionOrder = { ...sort.questionOrder };
    let order = [...(questionOrder[method] || [])];
    if (!order.length) {
      order = this.getRawRecords(deptId, moduleId)
        .filter((r) => this._handwriteMethodKey(r) === method)
        .sort((a, b) => this._defaultHandwriteRecordSort(a, b))
        .map((r) => r.id);
    }
    const idx = order.indexOf(recordId);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    questionOrder[method] = order;
    this.setHandwriteSort(deptId, moduleId, { questionOrder });
  },

  baguSortKey(deptId, moduleId, bankId) {
    return `${deptId}.${moduleId}.${bankId}`;
  },

  _baguCategoryKey(record) {
    return (record.category && String(record.category).trim()) || '未分类';
  },

  _defaultBaguRecordSort(a, b) {
    const la = Number.isFinite(Number(a.learnOrder)) ? Number(a.learnOrder) : 50;
    const lb = Number.isFinite(Number(b.learnOrder)) ? Number(b.learnOrder) : 50;
    if (la !== lb) return la - lb;
    const diffRank = { 简单: 0, 中等: 1, 困难: 2 };
    const da = diffRank[a.difficulty] ?? 1;
    const db = diffRank[b.difficulty] ?? 1;
    if (da !== db) return da - db;
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
  },

  _defaultBaguCategorySort(categories, bankId) {
    const bank = typeof getBaguBank === 'function' ? getBaguBank(bankId) : null;
    const preferred = bank?.categories || [];
    return [...categories].sort((a, b) => {
      if (a === '未分类') return 1;
      if (b === '未分类') return -1;
      const ia = preferred.indexOf(a);
      const ib = preferred.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  },

  _buildDefaultBaguLayout(records, bankId) {
    const groups = new Map();
    records.forEach((record) => {
      const key = this._baguCategoryKey(record);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    groups.forEach((list, category) => {
      groups.set(category, [...list].sort((a, b) => this._defaultBaguRecordSort(a, b)));
    });
    const categoryOrder = this._defaultBaguCategorySort([...groups.keys()], bankId);
    const questionOrder = {};
    categoryOrder.forEach((category) => {
      questionOrder[category] = (groups.get(category) || []).map((r) => r.id);
    });
    return { categoryOrder, questionOrder };
  },

  getBaguSort(deptId, moduleId, bankId) {
    const key = this.baguSortKey(deptId, moduleId, bankId);
    const saved = this.getSettings().baguSort?.[key];
    // 兼容旧版扁平 order
    if (saved?.order?.length && !saved?.categoryOrder?.length) {
      return { mode: saved.mode || 'default', categoryOrder: [], questionOrder: {} };
    }
    return {
      mode: saved?.mode || 'default',
      categoryOrder: saved?.categoryOrder || [],
      questionOrder: saved?.questionOrder || {},
    };
  },

  setBaguSort(deptId, moduleId, bankId, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.baguSort = data.settings.baguSort || {};
    const key = this.baguSortKey(deptId, moduleId, bankId);
    const next = { ...this.getBaguSort(deptId, moduleId, bankId), ...partial };
    delete next.order;
    data.settings.baguSort[key] = next;
    this.save(data);
  },

  _normalizeCustomBaguBank(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    if (!id || !name) return null;
    const categories = Array.isArray(raw.categories)
      ? raw.categories.map((c) => String(c || '').trim()).filter(Boolean)
      : String(raw.categories || '')
          .split(/[,，]/)
          .map((c) => c.trim())
          .filter(Boolean);
    return {
      id,
      name,
      desc: String(raw.desc || '').trim(),
      iconSrc: String(raw.iconSrc || '').trim(),
      categories,
      custom: true,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  },

  getCustomBaguBanks() {
    const list = this.getSettings().customBaguBanks;
    if (!Array.isArray(list)) return [];
    return list.map((b) => this._normalizeCustomBaguBank(b)).filter(Boolean);
  },

  getCustomBaguBank(bankId) {
    if (!bankId) return null;
    return this.getCustomBaguBanks().find((b) => b.id === bankId) || null;
  },

  /** 题库名称是否已被占用（内置 + 自定义；编辑时可排除自身） */
  isBaguBankNameTaken(name, excludeId = null) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return false;
    const builtins =
      typeof BAGU_QUESTION_BANKS !== 'undefined' && Array.isArray(BAGU_QUESTION_BANKS)
        ? BAGU_QUESTION_BANKS
        : [];
    if (builtins.some((b) => String(b.name || '').trim().toLowerCase() === normalized)) {
      return true;
    }
    return this.getCustomBaguBanks().some(
      (b) => b.id !== excludeId && String(b.name || '').trim().toLowerCase() === normalized
    );
  },

  addCustomBaguBank(payload = {}) {
    const name = String(payload.name || '').trim();
    if (!name) return null;
    if (this.isBaguBankNameTaken(name)) return null;
    const entry = this._normalizeCustomBaguBank({
      id: `custom_${crypto.randomUUID()}`,
      name,
      desc: payload.desc,
      iconSrc: payload.iconSrc,
      categories: payload.categories,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!entry) return null;
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.customBaguBanks = this.getCustomBaguBanks();
    data.settings.customBaguBanks.push(entry);
    this.save(data);
    return entry;
  },

  updateCustomBaguBank(bankId, partial = {}) {
    if (!bankId) return null;
    const data = this.load();
    data.settings = data.settings || {};
    const list = this.getCustomBaguBanks();
    const idx = list.findIndex((b) => b.id === bankId);
    if (idx === -1) return null;
    const nextName =
      partial.name != null ? String(partial.name || '').trim() : list[idx].name;
    if (nextName && this.isBaguBankNameTaken(nextName, bankId)) return null;
    const next = this._normalizeCustomBaguBank({
      ...list[idx],
      ...partial,
      id: bankId,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return null;
    list[idx] = next;
    data.settings.customBaguBanks = list;
    this.save(data);
    return next;
  },

  deleteCustomBaguBank(bankId, { deleteQuestions = true } = {}) {
    if (!bankId || !this.getCustomBaguBank(bankId)) return false;
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.customBaguBanks = this.getCustomBaguBanks().filter((b) => b.id !== bankId);
    if (data.settings.baguSort) {
      const prefix = `core.bagu.${bankId}`;
      // baguSortKey is dept.module.bank
      Object.keys(data.settings.baguSort).forEach((key) => {
        if (key.endsWith(`.${bankId}`) || key === `core.bagu.${bankId}`) {
          delete data.settings.baguSort[key];
        }
      });
    }
    if (deleteQuestions) {
      const key = this.recordKey('core', 'bagu');
      const records = data.records?.[key] || [];
      data.records = data.records || {};
      data.records[key] = records.filter((r) => r.bank !== bankId);
    }
    this.save(data);
    return true;
  },

  countBaguQuestionsInBank(bankId) {
    if (!bankId) return 0;
    return this.getRawRecords('core', 'bagu').filter((r) => r.bank === bankId).length;
  },

  syncBaguSortAfterChange(deptId, moduleId, bankId, recordId = null) {
    const sort = this.getBaguSort(deptId, moduleId, bankId);
    if (sort.mode !== 'custom') return;

    const records = this.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    const groups = new Map();
    records.forEach((record) => {
      const category = this._baguCategoryKey(record);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(record);
    });

    let categoryOrder = (sort.categoryOrder || []).filter((category) => groups.has(category));
    [...groups.keys()].forEach((category) => {
      if (!categoryOrder.includes(category)) categoryOrder.push(category);
    });

    const questionOrder = {};
    groups.forEach((list, category) => {
      const allIds = list.map((r) => r.id);
      let existing = (sort.questionOrder?.[category] || []).filter((id) => allIds.includes(id));
      const missing = list.filter((r) => !existing.includes(r.id));
      if (missing.length) {
        const sortedMissing = [...missing].sort((a, b) => this._defaultBaguRecordSort(a, b));
        sortedMissing.forEach((record) => {
          const insertAt = existing.findIndex((id) => {
            const other = list.find((r) => r.id === id);
            return other && this._defaultBaguRecordSort(record, other) < 0;
          });
          if (insertAt === -1) existing.push(record.id);
          else existing.splice(insertAt, 0, record.id);
        });
      }
      questionOrder[category] = existing;
    });

    this.setBaguSort(deptId, moduleId, bankId, { categoryOrder, questionOrder });
  },

  /**
   * 按学习曲线重建题库顺序（分类顺序用题库预设，组内按 learnOrder/难度）
   */
  applyBaguSmartOrder(deptId, moduleId, bankId, classifiedItems) {
    const byId = new Map((classifiedItems || []).map((it) => [it.id, it]));
    const data = this.load();
    const key = this.recordKey(deptId, moduleId);
    const list = data.records[key] || [];
    const now = new Date().toISOString();

    list.forEach((record, idx) => {
      if (record.bank !== bankId) return;
      const patch = byId.get(record.id);
      if (!patch) return;
      list[idx] = {
        ...record,
        category: patch.category || record.category,
        difficulty: patch.difficulty || record.difficulty,
        learnOrder: patch.learnOrder,
        tags: patch.tags != null && patch.tags !== '' ? patch.tags : record.tags,
        updatedAt: now,
      };
    });

    this.save(data);
    const refreshed = this.getRawRecords(deptId, moduleId).filter((r) => r.bank === bankId);
    const layout = this._buildDefaultBaguLayout(refreshed, bankId);
    this.setBaguSort(deptId, moduleId, bankId, {
      mode: 'custom',
      categoryOrder: layout.categoryOrder,
      questionOrder: layout.questionOrder,
    });
  },

  getTodayHabitRecord(deptId, moduleId) {
    const today = todayStr();
    return this.getRawRecords(deptId, moduleId).find((r) => (r.date || '').slice(0, 10) === today) || null;
  },

  toggleHabitCheck(deptId, moduleId, label, checklist = []) {
    let record = this.getTodayHabitRecord(deptId, moduleId);
    if (!record) {
      const checks = {};
      checklist.forEach((item) => {
        checks[item] = item === label;
      });
      return this.addRecord(deptId, moduleId, { date: todayStr(), checks });
    }
    const checks = { ...(record.checks || {}) };
    checks[label] = !checks[label];
    return this.updateRecord(deptId, moduleId, record.id, { checks });
  },

  getHabitProgress(record, checklist = []) {
    if (!checklist.length) return { done: 0, total: 0 };
    const done = checklist.filter((label) => Boolean(record?.checks?.[label])).length;
    return { done, total: checklist.length };
  },

  isHabitDoneToday(deptId, moduleId, checklist = []) {
    const { done, total } = this.getHabitProgress(this.getTodayHabitRecord(deptId, moduleId), checklist);
    return total > 0 && done === total;
  },

  getWeekCheckinRecord(deptId, moduleId, weekKey = this.weekKey()) {
    return (
      this.getRawRecords(deptId, moduleId).find(
        (r) => r.weekKey === weekKey || (r.date || '') === weekKey
      ) || null
    );
  },

  toggleWeekdayCheck(deptId, moduleId, dayLabel, weekdays = WEEKDAY_LABELS) {
    const weekKey = this.weekKey();
    let record = this.getWeekCheckinRecord(deptId, moduleId, weekKey);
    if (!record) {
      const days = {};
      weekdays.forEach((d) => {
        days[d] = d === dayLabel;
      });
      return this.addRecord(deptId, moduleId, { date: weekKey, weekKey, days });
    }
    const days = { ...(record.days || {}) };
    days[dayLabel] = !days[dayLabel];
    return this.updateRecord(deptId, moduleId, record.id, { days, weekKey });
  },

  getWeekdayProgress(record, weekdays = WEEKDAY_LABELS) {
    if (!weekdays.length) return { done: 0, total: 0 };
    const done = weekdays.filter((d) => Boolean(record?.days?.[d])).length;
    return { done, total: weekdays.length };
  },

  isWeekdayCheckedToday(deptId, moduleId) {
    const label = todayWeekdayLabel();
    const record = this.getWeekCheckinRecord(deptId, moduleId);
    return Boolean(record?.days?.[label]);
  },

  addRecord(deptId, moduleId, entry) {
    const data = this.load();
    const key = this.recordKey(deptId, moduleId);
    if (!data.records[key]) data.records[key] = [];
    const record = {
      id: crypto.randomUUID(),
      date: entry.date || todayStr(),
      createdAt: new Date().toISOString(),
      ...entry,
    };
    data.records[key].unshift(record);
    this.save(data);
    this.syncCustomOrderAfterChange(deptId, moduleId);
    if (this.isHandwriteModule(deptId, moduleId)) this.syncHandwriteSortAfterChange(deptId, moduleId);
    if (this.isBaguModule(deptId, moduleId) && record.bank) {
      this.syncBaguSortAfterChange(deptId, moduleId, record.bank, record.id);
    }
    return record;
  },

  deleteRecord(deptId, moduleId, recordId) {
    const existing = this.getRecord(deptId, moduleId, recordId);
    const data = this.load();
    const key = this.recordKey(deptId, moduleId);
    data.records[key] = (data.records[key] || []).filter((r) => r.id !== recordId);
    this.save(data);
    this.syncCustomOrderAfterChange(deptId, moduleId);
    if (this.isHandwriteModule(deptId, moduleId)) this.syncHandwriteSortAfterChange(deptId, moduleId);
    if (this.isBaguModule(deptId, moduleId) && existing?.bank) {
      this.syncBaguSortAfterChange(deptId, moduleId, existing.bank);
    }
  },

  getRecord(deptId, moduleId, recordId) {
    return this.getRecords(deptId, moduleId).find((r) => r.id === recordId) || null;
  },

  updateRecord(deptId, moduleId, recordId, entry) {
    const data = this.load();
    const key = this.recordKey(deptId, moduleId);
    const list = data.records[key] || [];
    const idx = list.findIndex((r) => r.id === recordId);
    if (idx === -1) return null;
    const existing = list[idx];
    list[idx] = {
      ...existing,
      ...entry,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.save(data);
    if (this.isHandwriteModule(deptId, moduleId)) this.syncHandwriteSortAfterChange(deptId, moduleId);
    if (this.isBaguModule(deptId, moduleId)) {
      const bankId = list[idx].bank || existing.bank;
      if (bankId) this.syncBaguSortAfterChange(deptId, moduleId, bankId);
      if (existing.bank && list[idx].bank && existing.bank !== list[idx].bank) {
        this.syncBaguSortAfterChange(deptId, moduleId, existing.bank);
      }
    }
    return list[idx];
  },

  getTodayRecords() {
    const today = todayStr();
    const all = getAllModules();
    const result = [];
    for (const m of all) {
      const records = this.getRecords(m.deptId, m.id);
      const todayRec = records.find((r) => r.date === today);
      if (todayRec) {
        result.push({ module: m, record: todayRec });
      }
    }
    return result;
  },

  getStats() {
    const data = this.load();
    let total = 0;
    let todayCount = 0;
    const today = todayStr();
    for (const list of Object.values(data.records)) {
      total += list.length;
      todayCount += list.filter((r) => r.date === today).length;
    }
    const cards = data.cards || [];
    const cardsDoneToday = cards.filter((c) => c.checkIns?.some((ci) => ci.date === today && ci.done)).length;
    return { total, todayCount, cardsTotal: cards.length, cardsDoneToday };
  },

  getCards() {
    return (this.load().cards || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addCard(card) {
    const data = this.load();
    data.cards = data.cards || [];
    data.cards.unshift(card);
    this.save(data);
    return card;
  },

  updateCard(card) {
    const data = this.load();
    const idx = (data.cards || []).findIndex((c) => c.id === card.id);
    if (idx === -1) return null;
    data.cards[idx] = card;
    this.save(data);
    return card;
  },

  deleteCard(cardId) {
    const data = this.load();
    data.cards = (data.cards || []).filter((c) => c.id !== cardId);
    this.save(data);
  },

  toggleCardCheckIn(cardId, date = todayStr()) {
    const data = this.load();
    const card = (data.cards || []).find((c) => c.id === cardId);
    if (!card) return;
    card.checkIns = card.checkIns || [];
    const existing = card.checkIns.find((ci) => ci.date === date);
    if (existing) {
      existing.done = !existing.done;
    } else {
      card.checkIns.push({ date, done: true });
    }
    this.save(data);
    return card;
  },

  isCardDoneToday(cardId) {
    const card = this.getCards().find((c) => c.id === cardId);
    return card?.checkIns?.some((ci) => ci.date === todayStr() && ci.done) || false;
  },

  getProfile() {
    const defaults = { username: 'CEO', avatar: null, signature: '个人公司' };
    return { ...defaults, ...(this.getSettings().profile || {}) };
  },

  saveProfile(partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.profile = { ...this.getProfile(), ...partial };
    this.save(data);
  },

  getAssistant() {
    const defaults = {
      name: '时间喵',
      avatar: null,
      persona: '一只软萌的时间管理小猫，住在 OPC 仪表盘里，最喜欢陪用户聊天和记习惯',
      tone: '温柔可爱、简短活泼，偶尔在句尾加「喵～」，像朋友一样自然',
    };
    return { ...defaults, ...(this.getSettings().assistant || {}) };
  },

  saveAssistant(partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.assistant = { ...this.getAssistant(), ...partial };
    this.save(data);
  },

  isChatCollapsed() {
    return Boolean(this.getSettings().chatCollapsed);
  },

  setChatCollapsed(collapsed) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.chatCollapsed = Boolean(collapsed);
    this.save(data);
  },

  isPlanChildrenCollapsed(itemId) {
    if (!itemId) return false;
    return Boolean(this.getSettings().planChildrenCollapsed?.[itemId]);
  },

  setPlanChildrenCollapsed(itemId, collapsed) {
    if (!itemId) return;
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.planChildrenCollapsed = data.settings.planChildrenCollapsed || {};
    if (collapsed) data.settings.planChildrenCollapsed[itemId] = true;
    else delete data.settings.planChildrenCollapsed[itemId];
    this.save(data);
  },

  togglePlanChildrenCollapsed(itemId) {
    const next = !this.isPlanChildrenCollapsed(itemId);
    this.setPlanChildrenCollapsed(itemId, next);
    return next;
  },

  getHeaderBackground(key) {
    return this.getSettings().headerBackgrounds?.[key] || null;
  },

  saveHeaderBackground(key, dataUrl) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.headerBackgrounds = data.settings.headerBackgrounds || {};
    data.settings.headerBackgrounds[key] = dataUrl;
    this.save(data);
  },

  removeHeaderBackground(key) {
    const data = this.load();
    if (!data.settings?.headerBackgrounds) return;
    delete data.settings.headerBackgrounds[key];
    this.save(data);
  },

  getTopbarWidgetStyle(widgetKey) {
    return this.getSettings().topbarWidgets?.[widgetKey] || {};
  },

  saveTopbarWidgetStyle(widgetKey, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.topbarWidgets = data.settings.topbarWidgets || {};
    const current = data.settings.topbarWidgets[widgetKey] || {};
    const next = { ...current, ...partial };
    Object.keys(next).forEach((k) => {
      if (next[k] === '' || next[k] == null) delete next[k];
    });
    if (Object.keys(next).length) {
      data.settings.topbarWidgets[widgetKey] = next;
    } else {
      delete data.settings.topbarWidgets[widgetKey];
    }
    this.save(data);
  },

  resetTopbarWidgetStyle(widgetKey) {
    const data = this.load();
    if (!data.settings?.topbarWidgets) return;
    delete data.settings.topbarWidgets[widgetKey];
    this.save(data);
  },

  getChatMessages() {
    const data = this.load();
    if (!data.chatMessages?.length) {
      data.chatMessages = [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            '喵～你好呀！我是时间喵 🐱\n\n我可以陪你闲聊，也可以帮你记习惯和目标，比如：\n· 「每天学 2 小时」\n· 「把睡觉改成 10 点」\n· 「今天好累啊」\n\n点点我的头像，可以改我的人设和语气哦～',
          createdAt: new Date().toISOString(),
        },
      ];
      this.save(data);
    }
    return data.chatMessages;
  },

  addChatMessage(message) {
    const data = this.load();
    data.chatMessages = data.chatMessages || [];
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...message,
    };
    data.chatMessages.push(entry);
    this.save(data);
    return entry;
  },

  getSettings() {
    return this.load().settings || {};
  },

  weekKey(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNo =
      1 +
      Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
      );
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  },

  weekRangeLabel(weekKey) {
    const m = String(weekKey || '').match(/^(\d{4})-W(\d{2})$/);
    if (!m) return weekKey || '';
    const year = Number(m[1]);
    const week = Number(m[2]);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const monday = new Date(simple);
    if (dow <= 4) monday.setDate(simple.getDate() - simple.getDay() + 1);
    else monday.setDate(simple.getDate() + 8 - simple.getDay());
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) =>
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    return `${fmt(monday)} - ${fmt(sunday)}`;
  },

  getPlanItems(type, key) {
    const plans = this.getSettings().plans || {};
    const bucket = plans[type] || {};
    return Array.isArray(bucket[key]) ? bucket[key].map((item) => ({ ...item })) : [];
  },

  getProjectDescTips(projectId) {
    if (!projectId) return [];
    const project = this.getRecord('core', 'project', projectId);
    const tips = project?.descTips;
    return Array.isArray(tips)
      ? tips.map((tip) => ({
          id: tip.id,
          text: String(tip.text || ''),
          createdAt: tip.createdAt || '',
        }))
      : [];
  },

  setProjectDescTips(projectId, tips) {
    if (!projectId) return;
    this.updateRecord('core', 'project', projectId, {
      descTips: Array.isArray(tips) ? tips : [],
    });
  },

  addProjectDescTip(projectId, text) {
    const html = String(text || '').trim();
    if (!projectId || !html || html === '<p><br></p>' || html === '<p></p>') return null;
    const tips = this.getProjectDescTips(projectId);
    const tip = {
      id: crypto.randomUUID(),
      text: html,
      createdAt: new Date().toISOString(),
    };
    tips.push(tip);
    this.setProjectDescTips(projectId, tips);
    return tip;
  },

  updateProjectDescTip(projectId, tipId, text) {
    const html = String(text || '').trim();
    if (!projectId || !tipId || !html || html === '<p><br></p>' || html === '<p></p>') return null;
    const tips = this.getProjectDescTips(projectId).map((tip) =>
      tip.id === tipId ? { ...tip, text: html, updatedAt: new Date().toISOString() } : tip
    );
    this.setProjectDescTips(projectId, tips);
    return tips.find((t) => t.id === tipId) || null;
  },

  deleteProjectDescTip(projectId, tipId) {
    if (!projectId || !tipId) return;
    this.setProjectDescTips(
      projectId,
      this.getProjectDescTips(projectId).filter((tip) => tip.id !== tipId)
    );
  },

  getProjectBodyComments(projectId) {
    if (!projectId) return [];
    const project = this.getRecord('core', 'project', projectId);
    const list = project?.bodyComments;
    if (!Array.isArray(list)) return [];
    return list.map((c) => this.normalizeProjectBodyComment(c));
  },

  normalizeProjectBodyComment(c = {}) {
    let questions = Array.isArray(c.questions)
      ? c.questions
          .map((q) => ({
            id: q.id || crypto.randomUUID(),
            text: String(q.text || '').trim(),
            baguId: q.baguId || null,
            createdAt: q.createdAt || '',
            updatedAt: q.updatedAt || '',
          }))
          .filter((q) => q.text || q.baguId)
      : null;

    if (!questions) {
      const legacyText = String(c.text || '').trim();
      if (legacyText || c.baguId) {
        questions = [
          {
            id: c.questionId || `${c.id || 'q'}-main`,
            text: legacyText,
            baguId: c.baguId || null,
            createdAt: c.createdAt || '',
            updatedAt: c.updatedAt || '',
          },
        ];
      } else {
        questions = [];
      }
    }

    const first = questions[0] || null;
    return {
      id: c.id,
      field: c.field === 'timeline' ? 'timeline' : 'description',
      quote: String(c.quote || ''),
      prefix: String(c.prefix || ''),
      suffix: String(c.suffix || ''),
      questions,
      collapsed: Boolean(c.collapsed),
      createdAt: c.createdAt || '',
      updatedAt: c.updatedAt || '',
      text: first?.text || '',
      baguId: first?.baguId || null,
    };
  },

  serializeProjectBodyComment(comment) {
    const normalized = this.normalizeProjectBodyComment(comment);
    return {
      id: normalized.id,
      field: normalized.field,
      quote: normalized.quote,
      prefix: normalized.prefix,
      suffix: normalized.suffix,
      questions: normalized.questions.map((q) => ({
        id: q.id,
        text: q.text,
        baguId: q.baguId || null,
        createdAt: q.createdAt || '',
        updatedAt: q.updatedAt || '',
      })),
      collapsed: Boolean(normalized.collapsed),
      createdAt: normalized.createdAt || '',
      updatedAt: normalized.updatedAt || '',
    };
  },

  setProjectBodyComments(projectId, comments) {
    if (!projectId) return;
    this.updateRecord('core', 'project', projectId, {
      bodyComments: (Array.isArray(comments) ? comments : []).map((c) =>
        this.serializeProjectBodyComment(c)
      ),
    });
  },

  findMatchingBodyComment(projectId, pending) {
    const quote = String(pending?.quote || '').trim();
    if (!projectId || !quote) return null;
    const field = pending.field === 'timeline' ? 'timeline' : 'description';
    return (
      this.getProjectBodyComments(projectId).find(
        (c) =>
          c.field === field &&
          c.quote === quote &&
          String(c.prefix || '') === String(pending.prefix || '').slice(-40) &&
          String(c.suffix || '') === String(pending.suffix || '').slice(0, 40)
      ) || null
    );
  },

  addProjectBodyComment(projectId, payload) {
    const text = String(payload?.text || '').trim();
    const quote = String(payload?.quote || '').trim();
    if (!projectId || !quote || !text) return null;

    const existing = payload.commentId
      ? this.getProjectBodyComments(projectId).find((c) => c.id === payload.commentId)
      : this.findMatchingBodyComment(projectId, payload);

    if (existing) {
      return this.addProjectBodyCommentQuestion(projectId, existing.id, {
        text,
        baguId: payload.baguId || null,
      });
    }

    const question = {
      id: crypto.randomUUID(),
      text,
      baguId: payload.baguId || null,
      createdAt: new Date().toISOString(),
    };
    const comment = {
      id: crypto.randomUUID(),
      field: payload.field === 'timeline' ? 'timeline' : 'description',
      quote,
      prefix: String(payload.prefix || '').slice(-40),
      suffix: String(payload.suffix || '').slice(0, 40),
      questions: [question],
      collapsed: false,
      createdAt: new Date().toISOString(),
    };
    const comments = this.getProjectBodyComments(projectId);
    comments.push(comment);
    this.setProjectBodyComments(projectId, comments);
    return { ...comment, question };
  },

  addProjectBodyCommentQuestion(projectId, commentId, payload = {}) {
    const text = String(payload.text || '').trim();
    if (!projectId || !commentId || !text) return null;
    const comments = this.getProjectBodyComments(projectId);
    const idx = comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return null;
    const question = {
      id: crypto.randomUUID(),
      text,
      baguId: payload.baguId || null,
      createdAt: new Date().toISOString(),
    };
    const next = {
      ...comments[idx],
      questions: [...comments[idx].questions, question],
      collapsed: false,
      updatedAt: new Date().toISOString(),
    };
    comments[idx] = next;
    this.setProjectBodyComments(projectId, comments);
    return { ...next, question };
  },

  updateProjectBodyComment(projectId, commentId, partial = {}) {
    if (!projectId || !commentId) return null;
    const comments = this.getProjectBodyComments(projectId).map((c) => {
      if (c.id !== commentId) return c;
      const next = { ...c, updatedAt: new Date().toISOString() };
      if (Object.prototype.hasOwnProperty.call(partial, 'collapsed')) {
        next.collapsed = Boolean(partial.collapsed);
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'quote')) {
        next.quote = String(partial.quote || '');
      }
      if (
        Object.prototype.hasOwnProperty.call(partial, 'text') ||
        Object.prototype.hasOwnProperty.call(partial, 'baguId')
      ) {
        const questions = [...(next.questions || [])];
        if (!questions.length) {
          questions.push({
            id: crypto.randomUUID(),
            text: '',
            baguId: null,
            createdAt: new Date().toISOString(),
          });
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'text')) {
          questions[0] = { ...questions[0], text: String(partial.text || '').trim() };
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'baguId')) {
          questions[0] = { ...questions[0], baguId: partial.baguId || null };
        }
        questions[0].updatedAt = new Date().toISOString();
        next.questions = questions;
      }
      return next;
    });
    const updated = comments.find((c) => c.id === commentId);
    if (!updated) return null;
    this.setProjectBodyComments(projectId, comments);
    return updated;
  },

  updateProjectBodyCommentQuestion(projectId, commentId, questionId, partial = {}) {
    if (!projectId || !commentId || !questionId) return null;
    let updatedQuestion = null;
    const comments = this.getProjectBodyComments(projectId).map((c) => {
      if (c.id !== commentId) return c;
      const questions = c.questions.map((q) => {
        if (q.id !== questionId) return q;
        const next = { ...q, updatedAt: new Date().toISOString() };
        if (Object.prototype.hasOwnProperty.call(partial, 'text')) {
          next.text = String(partial.text || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'baguId')) {
          next.baguId = partial.baguId || null;
        }
        updatedQuestion = next;
        return next;
      });
      return { ...c, questions, updatedAt: new Date().toISOString() };
    });
    if (!updatedQuestion || !updatedQuestion.text) return null;
    this.setProjectBodyComments(projectId, comments);
    return updatedQuestion;
  },

  moveProjectBodyCommentQuestion(projectId, commentId, questionId, direction) {
    if (!projectId || !commentId || !questionId) return null;
    const comments = this.getProjectBodyComments(projectId);
    const idx = comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return null;
    const questions = [...comments[idx].questions];
    const qIdx = questions.findIndex((q) => q.id === questionId);
    if (qIdx === -1) return null;
    const target = direction < 0 ? qIdx - 1 : qIdx + 1;
    if (target < 0 || target >= questions.length) return comments[idx];
    [questions[qIdx], questions[target]] = [questions[target], questions[qIdx]];
    comments[idx] = {
      ...comments[idx],
      questions,
      updatedAt: new Date().toISOString(),
    };
    this.setProjectBodyComments(projectId, comments);
    return comments[idx];
  },

  deleteProjectBodyCommentQuestion(projectId, commentId, questionId) {
    if (!projectId || !commentId || !questionId) return null;
    const comments = this.getProjectBodyComments(projectId);
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return null;
    const question = comment.questions.find((q) => q.id === questionId) || null;
    if (!question) return null;

    if (comment.questions.length <= 1) {
      const removed = this.deleteProjectBodyComment(projectId, commentId);
      return removed ? { comment: removed, question, removedGroup: true } : null;
    }

    const data = this.load();
    const key = this.recordKey('core', 'project');
    const project = (data.records[key] || []).find((p) => p.id === projectId);
    if (!project) return null;
    this._pushRecycleItem(data, {
      kind: 'bodyComment',
      title: question.text ? `相关面试题 · ${question.text}` : '相关面试题',
      payload: {
        projectId,
        commentId,
        question: JSON.parse(JSON.stringify(question)),
        relinkBagu: Boolean(question.baguId),
        mode: 'question',
      },
    });
    const nextComments = comments.map((c) =>
      c.id === commentId
        ? {
            ...c,
            questions: c.questions.filter((q) => q.id !== questionId),
            updatedAt: new Date().toISOString(),
          }
        : c
    );
    project.bodyComments = nextComments.map((c) => this.serializeProjectBodyComment(c));
    this.save(data);
    return { comment: nextComments.find((c) => c.id === commentId), question, removedGroup: false };
  },

  deleteProjectBodyComment(projectId, commentId) {
    if (!projectId || !commentId) return null;
    const comments = this.getProjectBodyComments(projectId);
    const target = comments.find((c) => c.id === commentId) || null;
    if (!target) return null;
    const data = this.load();
    const key = this.recordKey('core', 'project');
    const project = (data.records[key] || []).find((p) => p.id === projectId);
    if (!project) return null;
    const titleText = target.questions?.[0]?.text || target.text || '';
    this._pushRecycleItem(data, {
      kind: 'bodyComment',
      title: titleText ? `相关面试题 · ${titleText}` : '相关面试题',
      payload: {
        projectId,
        comment: JSON.parse(JSON.stringify(this.serializeProjectBodyComment(target))),
        relinkBagu: target.questions.some((q) => q.baguId),
        mode: 'group',
      },
    });
    project.bodyComments = (Array.isArray(project.bodyComments) ? project.bodyComments : [])
      .map((c) => this.normalizeProjectBodyComment(c))
      .filter((c) => c.id !== commentId)
      .map((c) => this.serializeProjectBodyComment(c));
    this.save(data);
    return target;
  },

  setPlanItems(type, key, items) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.plans = data.settings.plans || {};
    data.settings.plans[type] = data.settings.plans[type] || {};
    data.settings.plans[type][key] = items;
    this.save(data);
  },

  addPlanItem(type, key, text) {
    const items = this.getPlanItems(type, key);
    items.push({
      id: crypto.randomUUID(),
      text: String(text || '').trim(),
      done: false,
      createdAt: new Date().toISOString(),
      children: [],
    });
    this.setPlanItems(type, key, items);
    return items;
  },

  findPlanItem(items, itemId) {
    const list = Array.isArray(items) ? items : [];
    for (const item of list) {
      if (item.id === itemId) return { item, parent: null, list };
      const children = Array.isArray(item.children) ? item.children : [];
      for (const child of children) {
        if (child.id === itemId) return { item: child, parent: item, list: children };
      }
    }
    return null;
  },

  addPlanSubItem(type, key, parentId, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || !parentId) return null;
    const items = this.getPlanItems(type, key);
    const parent = items.find((item) => item.id === parentId);
    if (!parent) return null;
    if (!Array.isArray(parent.children)) parent.children = [];
    const child = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
      createdAt: new Date().toISOString(),
    };
    parent.children.push(child);
    this.setPlanItems(type, key, items);
    return child;
  },

  addPlanSubRef(type, key, parentId, kind, refId) {
    const mod = this.planRefModule(kind);
    if (!mod || !parentId || !refId) return null;
    const items = this.getPlanItems(type, key);
    const parent = items.find((item) => item.id === parentId);
    if (!parent) return null;
    if (!Array.isArray(parent.children)) parent.children = [];
    const exists = parent.children.some((child) => {
      const k = child.refKind || (child.interviewId ? 'interview' : null);
      const id = child.refId || child.interviewId;
      return k === kind && id === refId;
    });
    if (exists) return null;
    const record = this.getRecord(mod.deptId, mod.moduleId, refId);
    if (!record) return null;
    const child = {
      id: crypto.randomUUID(),
      text: this.formatPlanRefText(kind, record),
      done: false,
      createdAt: new Date().toISOString(),
      refKind: kind,
      refId,
    };
    if (kind === 'interview') child.interviewId = refId;
    parent.children.push(child);
    this.setPlanItems(type, key, items);
    return child;
  },

  planItemAsChild(item) {
    if (!item) return null;
    const child = {
      id: item.id,
      text: String(item.text || ''),
      done: Boolean(item.done),
      createdAt: item.createdAt || new Date().toISOString(),
    };
    const kind = item.refKind || (item.interviewId ? 'interview' : null);
    const refId = item.refId || item.interviewId;
    if (kind && refId) {
      child.refKind = kind;
      child.refId = refId;
      if (kind === 'interview') child.interviewId = refId;
    }
    return child;
  },

  removePlanItemFromTree(items, itemId) {
    const idx = items.findIndex((item) => item.id === itemId);
    if (idx >= 0) {
      const [removed] = items.splice(idx, 1);
      return removed;
    }
    for (const item of items) {
      if (!Array.isArray(item.children)) continue;
      const childIdx = item.children.findIndex((c) => c.id === itemId);
      if (childIdx >= 0) {
        const [removed] = item.children.splice(childIdx, 1);
        return removed;
      }
    }
    return null;
  },

  /** 将某条待办（或其子待办）挂到另一条顶级待办下；原有子待办一并并入 */
  movePlanItemUnder(type, key, itemId, parentId) {
    if (!itemId || !parentId || itemId === parentId) return false;
    const items = this.getPlanItems(type, key);
    const parent = items.find((item) => item.id === parentId);
    if (!parent) return false;

    const removed = this.removePlanItemFromTree(items, itemId);
    if (!removed) return false;

    if (!Array.isArray(parent.children)) parent.children = [];
    const nestedChildren = Array.isArray(removed.children) ? removed.children : [];
    parent.children.push(this.planItemAsChild(removed), ...nestedChildren.map((c) => ({ ...c })));
    this.setPlanItems(type, key, items);
    return true;
  },

  /** 子待办提升为顶级待办 */
  promotePlanSubItem(type, key, itemId) {
    const items = this.getPlanItems(type, key);
    const found = this.findPlanItem(items, itemId);
    if (!found?.parent) return false;
    found.parent.children = (found.parent.children || []).filter((c) => c.id !== itemId);
    items.push({
      ...found.item,
      children: Array.isArray(found.item.children) ? found.item.children : [],
    });
    this.setPlanItems(type, key, items);
    return true;
  },

  /** 同级上移/下移：delta 为 -1 或 1 */
  movePlanItemOrder(type, key, itemId, delta) {
    const step = Number(delta);
    if (!itemId || !step) return false;
    const items = this.getPlanItems(type, key);
    const found = this.findPlanItem(items, itemId);
    if (!found) return false;
    const list = found.parent ? found.parent.children || [] : items;
    const idx = list.findIndex((item) => item.id === itemId);
    const next = idx + step;
    if (idx < 0 || next < 0 || next >= list.length) return false;
    const [moved] = list.splice(idx, 1);
    list.splice(next, 0, moved);
    this.setPlanItems(type, key, items);
    return true;
  },

  interviewDateKey(record) {
    const raw = this.toInterviewStartLocal(record);
    return raw ? raw.slice(0, 10) : '';
  },

  toInterviewStartLocal(record) {
    if (!record) return '';
    if (record.date?.includes('T')) return record.date.slice(0, 16);
    if (record.interviewDate && record.interviewTime) {
      return `${record.interviewDate}T${String(record.interviewTime).slice(0, 5)}`;
    }
    if (record.interviewDate) return `${record.interviewDate}T09:00`;
    if (record.date) return `${String(record.date).slice(0, 10)}T09:00`;
    return '';
  },

  formatInterviewPlanText(record) {
    if (!record) return '面试';
    const parts = [record.company, record.role, record.round].map((v) => String(v || '').trim()).filter(Boolean);
    return parts.join(' · ') || '面试';
  },

  formatBaguPlanText(record) {
    if (!record) return '面试题';
    const bank = typeof getBaguBank === 'function' ? getBaguBank(record.bank) : null;
    const title = String(record.title || '').trim() || '未命名题目';
    return bank?.name ? `${title}（${bank.name}）` : title;
  },

  formatHandwritePlanText(record) {
    if (!record) return '算法题';
    const num = record.lcNumber ? `${record.lcNumber}. ` : '';
    const title = String(record.title || '').trim() || '未命名题目';
    return `${num}${title}`;
  },

  formatProjectPlanText(record) {
    if (!record) return '项目经历';
    const name = String(record.name || record.project || '').trim() || '未命名项目';
    const role = String(record.role || '').trim();
    return role ? `${name} · ${role}` : name;
  },

  formatPlanRefText(kind, record) {
    if (kind === 'interview') return this.formatInterviewPlanText(record);
    if (kind === 'bagu') return this.formatBaguPlanText(record);
    if (kind === 'handwrite') return this.formatHandwritePlanText(record);
    if (kind === 'project') return this.formatProjectPlanText(record);
    return String(record?.title || record?.name || '引用项');
  },

  planRefModule(kind) {
    if (kind === 'interview') return { deptId: 'core', moduleId: 'interview', label: '面试' };
    if (kind === 'bagu') return { deptId: 'core', moduleId: 'bagu', label: '面试题' };
    if (kind === 'handwrite') return { deptId: 'core', moduleId: 'handwrite', label: '算法题' };
    if (kind === 'project') return { deptId: 'core', moduleId: 'project', label: '项目经历' };
    return null;
  },

  resolvePlanItem(item) {
    const resolved = { ...item };
    resolved.children = Array.isArray(item?.children)
      ? item.children.map((child) => {
          const resolvedChild = this.resolvePlanItem({ ...child, children: [] });
          resolvedChild.children = [];
          return resolvedChild;
        })
      : [];
    const kind =
      item?.refKind ||
      (item?.interviewId ? 'interview' : null);
    const refId = item?.refId || item?.interviewId;
    if (!kind || !refId) return resolved;

    const mod = this.planRefModule(kind);
    resolved.refKind = kind;
    resolved.refId = refId;
    if (kind === 'interview') resolved.interviewId = refId;
    resolved.refLabel = mod?.label || kind;

    if (!mod) {
      resolved.refAlive = false;
      return resolved;
    }

    const record = this.getRecord(mod.deptId, mod.moduleId, refId);
    if (record) {
      resolved.text = this.formatPlanRefText(kind, record);
      resolved.refAlive = true;
      if (kind === 'interview') resolved.refMeta = this.interviewDateKey(record);
      if (kind === 'bagu') {
        const bank = typeof getBaguBank === 'function' ? getBaguBank(record.bank) : null;
        resolved.refMeta = [bank?.name, record.difficulty].filter(Boolean).join(' · ');
      }
      if (kind === 'handwrite') {
        resolved.refMeta = [record.difficulty, record.method].filter(Boolean).join(' · ');
      }
      if (kind === 'project') {
        resolved.refMeta = [record.role, record.ongoing ? '至今' : record.endDate].filter(Boolean).join(' · ');
      }
    } else {
      resolved.refAlive = false;
    }
    return resolved;
  },

  getPlanRefIds(type, key, kind) {
    return new Set(
      this.getPlanItems(type, key)
        .filter((item) => {
          const k = item.refKind || (item.interviewId ? 'interview' : null);
          return k === kind;
        })
        .map((item) => item.refId || item.interviewId)
        .filter(Boolean)
    );
  },

  getPlanInterviewRefIds(type, key) {
    return this.getPlanRefIds(type, key, 'interview');
  },

  addPlanRefs(type, key, kind, ids) {
    const mod = this.planRefModule(kind);
    if (!mod) return 0;
    const items = this.getPlanItems(type, key);
    const existing = this.getPlanRefIds(type, key, kind);
    const list = Array.isArray(ids) ? ids : [];
    let added = 0;
    list.forEach((id) => {
      if (!id || existing.has(id)) return;
      const record = this.getRecord(mod.deptId, mod.moduleId, id);
      if (!record) return;
      const entry = {
        id: crypto.randomUUID(),
        text: this.formatPlanRefText(kind, record),
        done: false,
        createdAt: new Date().toISOString(),
        children: [],
        refKind: kind,
        refId: id,
      };
      if (kind === 'interview') entry.interviewId = id;
      items.push(entry);
      existing.add(id);
      added += 1;
    });
    if (added) this.setPlanItems(type, key, items);
    return added;
  },

  addPlanInterviewRefs(type, key, interviewIds) {
    return this.addPlanRefs(type, key, 'interview', interviewIds);
  },

  togglePlanItem(type, key, itemId) {
    const items = this.getPlanItems(type, key);
    const found = this.findPlanItem(items, itemId);
    if (!found) return items;
    found.item.done = !found.item.done;
    this.setPlanItems(type, key, items);
    return items;
  },

  deletePlanItem(type, key, itemId) {
    const items = this.getPlanItems(type, key);
    const found = this.findPlanItem(items, itemId);
    if (!found) return items;
    if (found.parent) {
      found.parent.children = (found.parent.children || []).filter((c) => c.id !== itemId);
    } else {
      const next = items.filter((item) => item.id !== itemId);
      this.setPlanItems(type, key, next);
      return next;
    }
    this.setPlanItems(type, key, items);
    return items;
  },

  saveSettings(settings) {
    const data = this.load();
    data.settings = { ...data.settings, ...settings };
    this.save(data);
  },

  moduleMetaKey(deptId, moduleId) {
    return `${deptId}.${moduleId}`;
  },

  getModuleMeta(deptId, moduleId) {
    const key = this.moduleMetaKey(deptId, moduleId);
    return this.getSettings().moduleMeta?.[key] || {};
  },

  saveModuleMeta(deptId, moduleId, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.moduleMeta = data.settings.moduleMeta || {};
    const key = this.moduleMetaKey(deptId, moduleId);
    const current = data.settings.moduleMeta[key] || {};
    const next = { ...current, ...partial };
    Object.keys(next).forEach((k) => {
      if (next[k] === '' || next[k] == null) delete next[k];
    });
    if (Object.keys(next).length) {
      data.settings.moduleMeta[key] = next;
    } else {
      delete data.settings.moduleMeta[key];
    }
    this.save(data);
  },

  resetModuleMeta(deptId, moduleId) {
    const data = this.load();
    if (!data.settings?.moduleMeta) return;
    const key = this.moduleMetaKey(deptId, moduleId);
    delete data.settings.moduleMeta[key];
    this.save(data);
  },

  getDeptMeta(deptId) {
    return this.getSettings().deptMeta?.[deptId] || {};
  },

  saveDeptMeta(deptId, partial) {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.deptMeta = data.settings.deptMeta || {};
    const current = data.settings.deptMeta[deptId] || {};
    const next = { ...current, ...partial };
    Object.keys(next).forEach((k) => {
      if (next[k] === '' || next[k] == null) delete next[k];
    });
    if (Object.keys(next).length) {
      data.settings.deptMeta[deptId] = next;
    } else {
      delete data.settings.deptMeta[deptId];
    }
    this.save(data);
  },

  resetDeptMeta(deptId) {
    const data = this.load();
    if (!data.settings?.deptMeta) return;
    delete data.settings.deptMeta[deptId];
    this.save(data);
  },


  /* ===== 回收站 + 年历任务 ===== */
  _purgeExpiredRecycleBin(data) {
    if (!data?.settings || !Array.isArray(data.settings.recycleBin)) return false;
    const cutoff = Date.now() - this.RECYCLE_RETENTION_MS;
    const before = data.settings.recycleBin.length;
    data.settings.recycleBin = data.settings.recycleBin.filter((item) => {
      const t = Date.parse(item?.deletedAt || '');
      return Number.isFinite(t) && t >= cutoff;
    });
    return data.settings.recycleBin.length !== before;
  },

  getRecycleBin() {
    const data = this.load();
    data.settings = data.settings || {};
    let dirty = false;
    if (!Array.isArray(data.settings.recycleBin)) {
      data.settings.recycleBin = [];
      dirty = true;
    }
    if (this._purgeExpiredRecycleBin(data)) dirty = true;
    if (dirty) this.save(data);
    return [...data.settings.recycleBin];
  },

  getRecycleBinCount() {
    return this.getRecycleBin().length;
  },

  recycleDaysLeft(deletedAt) {
    const t = Date.parse(deletedAt || '');
    if (!Number.isFinite(t)) return 0;
    const left = t + this.RECYCLE_RETENTION_MS - Date.now();
    return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
  },

  _recycleKindLabel(kind) {
    const map = {
      record: '记录',
      card: '打卡卡片',
      planItem: '计划待办',
      descTip: '描述意见',
      bodyComment: '相关面试题',
      calendarTask: '月历任务',
    };
    return map[kind] || '内容';
  },

  _recordRecycleTitle(deptId, moduleId, record) {
    if (!record) return '未命名记录';
    const title =
      record.name ||
      record.title ||
      record.company ||
      record.position ||
      record.text ||
      record.note ||
      '';
    const plain = String(title)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const modName =
      typeof getModule === 'function' ? getModule(deptId, moduleId)?.name || '' : '';
    if (plain) return modName ? `${modName} · ${plain}` : plain;
    return modName ? `${modName} · 未命名` : '未命名记录';
  },

  _pushRecycleItem(data, item) {
    data.settings = data.settings || {};
    if (!Array.isArray(data.settings.recycleBin)) data.settings.recycleBin = [];
    this._purgeExpiredRecycleBin(data);
    data.settings.recycleBin.unshift({
      id: crypto.randomUUID(),
      deletedAt: new Date().toISOString(),
      ...item,
    });
  },

  purgeRecycleItem(binId) {
    const data = this.load();
    data.settings = data.settings || {};
    const list = Array.isArray(data.settings.recycleBin) ? data.settings.recycleBin : [];
    data.settings.recycleBin = list.filter((item) => item.id !== binId);
    this.save(data);
  },

  emptyRecycleBin() {
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.recycleBin = [];
    this.save(data);
  },

  restoreRecycleItem(binId) {
    const data = this.load();
    data.settings = data.settings || {};
    const list = Array.isArray(data.settings.recycleBin) ? data.settings.recycleBin : [];
    const idx = list.findIndex((item) => item.id === binId);
    if (idx === -1) return false;
    const item = list[idx];
    list.splice(idx, 1);
    data.settings.recycleBin = list;

    const payload = item.payload || {};
    if (item.kind === 'record') {
      const { deptId, moduleId, record, linkedProjectIds } = payload;
      if (!deptId || !moduleId || !record?.id) {
        this.save(data);
        return false;
      }
      const key = this.recordKey(deptId, moduleId);
      if (!data.records[key]) data.records[key] = [];
      if (!data.records[key].some((r) => r.id === record.id)) {
        data.records[key].unshift(record);
      }
      if (Array.isArray(linkedProjectIds) && linkedProjectIds.length && record.id) {
        const projects = data.records['core.project'] || [];
        linkedProjectIds.forEach((projectId) => {
          const p = projects.find((x) => x.id === projectId);
          if (!p) return;
          const ids = Array.isArray(p.relatedBaguIds) ? [...p.relatedBaguIds] : [];
          if (!ids.includes(record.id)) ids.push(record.id);
          p.relatedBaguIds = ids;
        });
      }
      this.save(data);
      this.syncCustomOrderAfterChange(deptId, moduleId);
      if (this.isHandwriteModule(deptId, moduleId)) this.syncHandwriteSortAfterChange(deptId, moduleId);
      if (this.isBaguModule(deptId, moduleId) && record.bank) {
        this.syncBaguSortAfterChange(deptId, moduleId, record.bank, record.id);
      }
      return true;
    }

    if (item.kind === 'card') {
      const card = payload.card;
      if (!card?.id) {
        this.save(data);
        return false;
      }
      data.cards = data.cards || [];
      if (!data.cards.some((c) => c.id === card.id)) data.cards.unshift(card);
      this.save(data);
      return true;
    }

    if (item.kind === 'planItem') {
      const { type, key, items } = payload;
      if (!type || !key || !Array.isArray(items) || !items.length) {
        this.save(data);
        return false;
      }
      data.settings.plans = data.settings.plans || {};
      data.settings.plans[type] = data.settings.plans[type] || {};
      const current = Array.isArray(data.settings.plans[type][key])
        ? data.settings.plans[type][key]
        : [];
      const existIds = new Set(current.map((x) => x.id));
      const merged = [...current];
      items.forEach((it) => {
        if (!existIds.has(it.id)) merged.push(it);
      });
      data.settings.plans[type][key] = merged;
      this.save(data);
      return true;
    }

    if (item.kind === 'descTip') {
      const { projectId, tip } = payload;
      if (!projectId || !tip?.id) {
        this.save(data);
        return false;
      }
      const key = this.recordKey('core', 'project');
      const project = (data.records[key] || []).find((p) => p.id === projectId);
      if (!project) {
        this.save(data);
        return false;
      }
      const tips = Array.isArray(project.descTips) ? [...project.descTips] : [];
      if (!tips.some((t) => t.id === tip.id)) tips.push(tip);
      project.descTips = tips;
      this.save(data);
      return true;
    }

    if (item.kind === 'bodyComment') {
      const { projectId, comment, commentId, question, relinkBagu, mode } = payload;
      if (!projectId) {
        this.save(data);
        return false;
      }
      const key = this.recordKey('core', 'project');
      const project = (data.records[key] || []).find((p) => p.id === projectId);
      if (!project) {
        this.save(data);
        return false;
      }
      const comments = Array.isArray(project.bodyComments) ? [...project.bodyComments] : [];

      if (mode === 'question' && commentId && question?.id) {
        const idx = comments.findIndex((c) => c.id === commentId);
        if (idx === -1) {
          this.save(data);
          return false;
        }
        const group = this.normalizeProjectBodyComment(comments[idx]);
        if (!group.questions.some((q) => q.id === question.id)) {
          group.questions.push(question);
        }
        comments[idx] = this.serializeProjectBodyComment(group);
        project.bodyComments = comments;
        if (relinkBagu && question.baguId) {
          const ids = Array.isArray(project.relatedBaguIds) ? [...project.relatedBaguIds] : [];
          if (!ids.includes(question.baguId)) ids.push(question.baguId);
          project.relatedBaguIds = ids;
        }
        this.save(data);
        return true;
      }

      if (!comment?.id) {
        this.save(data);
        return false;
      }
      if (!comments.some((c) => c.id === comment.id)) comments.push(comment);
      project.bodyComments = comments;
      const baguIds = (comment.questions || [])
        .map((q) => q.baguId)
        .filter(Boolean)
        .concat(comment.baguId || []);
      if (relinkBagu && baguIds.length) {
        const ids = Array.isArray(project.relatedBaguIds) ? [...project.relatedBaguIds] : [];
        baguIds.forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
        project.relatedBaguIds = ids;
      }
      this.save(data);
      return true;
    }


    if (item.kind === 'calendarTask') {
      const task = payload.task;
      if (!task?.id) {
        this.save(data);
        return false;
      }
      data.settings.calendarTasks = Array.isArray(data.settings.calendarTasks)
        ? data.settings.calendarTasks
        : [];
      if (!data.settings.calendarTasks.some((t) => t.id === task.id)) {
        data.settings.calendarTasks.unshift(task);
      }
      this.save(data);
      return true;
    }

    this.save(data);
    return false;
  },

  normalizeCalendarSub(sub = {}, fallbackKind = 'task') {
    const date = String(sub.date || '').slice(0, 10);
    const kind = sub.kind === 'schedule' ? 'schedule' : sub.kind === 'task' ? 'task' : fallbackKind === 'schedule' ? 'schedule' : 'task';
    return {
      id: sub.id || crypto.randomUUID(),
      date,
      text: String(sub.text || '').trim(),
      kind,
      color: this.normalizeCalendarItemColor(sub.color, kind),
      done: Boolean(sub.done),
      createdAt: sub.createdAt || new Date().toISOString(),
    };
  },

  normalizeCalendarTask(task = {}) {
    let startDate = String(task.startDate || task.date || '').slice(0, 10);
    let endDate = String(task.endDate || startDate).slice(0, 10);
    if (startDate && endDate && endDate < startDate) {
      const tmp = startDate;
      startDate = endDate;
      endDate = tmp;
    }
    const kind = task.kind === 'schedule' ? 'schedule' : 'task';
    const subs = Array.isArray(task.subs)
      ? task.subs
          .map((s) => this.normalizeCalendarSub(s, kind))
          .filter((s) => s.id && s.text && s.date)
          .filter((s) => !startDate || !endDate || (s.date >= startDate && s.date <= endDate))
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
          )
      : [];
    return {
      id: task.id,
      text: String(task.text || '').trim(),
      kind,
      color: this.normalizeCalendarItemColor(task.color, kind),
      startDate,
      endDate: endDate || startDate,
      done: Boolean(task.done),
      subs,
      createdAt: task.createdAt || '',
      updatedAt: task.updatedAt || '',
    };
  },

  getCalendarTheme() {
    const id = String(this.getSettings().calendarTheme || 'summary');
    const valid = typeof CALENDAR_THEMES !== 'undefined' ? CALENDAR_THEMES.some((t) => t.id === id) : true;
    return valid ? id : 'summary';
  },

  setCalendarTheme(themeId) {
    const id = String(themeId || 'summary');
    const allowed =
      typeof CALENDAR_THEMES !== 'undefined' ? CALENDAR_THEMES.some((t) => t.id === id) : true;
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.calendarTheme = allowed ? id : 'summary';
    this.save(data);
    return data.settings.calendarTheme;
  },

  getCalendarWashDays() {
    const map = this.getSettings().calendarWashDays;
    return map && typeof map === 'object' ? { ...map } : {};
  },

  isCalendarWashDay(dateStr) {
    if (!dateStr) return false;
    return Boolean(this.getCalendarWashDays()[dateStr]);
  },

  toggleCalendarWashDay(dateStr, force = null) {
    if (!dateStr) return false;
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.calendarWashDays =
      data.settings.calendarWashDays && typeof data.settings.calendarWashDays === 'object'
        ? { ...data.settings.calendarWashDays }
        : {};
    const next = force == null ? !data.settings.calendarWashDays[dateStr] : Boolean(force);
    if (next) data.settings.calendarWashDays[dateStr] = true;
    else delete data.settings.calendarWashDays[dateStr];
    this.save(data);
    return next;
  },

  /** 学习主题：八股 + 手撕 按日计数 */
  getStudyActivityByDate(startDate, endDate) {
    const map = new Map();
    const bump = (date) => {
      const d = String(date || '').slice(0, 10);
      if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return;
      map.set(d, (map.get(d) || 0) + 1);
    };
    this.getRawRecords('core', 'bagu').forEach((r) => bump(r.date || r.createdAt));
    this.getRawRecords('core', 'handwrite').forEach((r) => bump(r.date || r.createdAt));
    return map;
  },

  /** 睡眠视图：按日汇总总时长 + 首个长睡眠入睡时间 */
  getSleepActivityByDate(startDate, endDate) {
    const parseTime = (value) => {
      const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
      return h * 60 + min;
    };
    const durationMins = (bedtime, wakeup) => {
      const bed = parseTime(bedtime);
      const wake = parseTime(wakeup);
      if (bed == null || wake == null) return 0;
      let end = wake;
      if (end <= bed) end += 24 * 60;
      return end - bed;
    };
    /** 以中午为日界，越早入睡排序越靠前 */
    const bedSortKey = (bedMin) => ((bedMin - 12 * 60) % (24 * 60) + 24 * 60) % (24 * 60);

    const byDate = new Map();
    this.getRawRecords('living', 'sleep').forEach((r) => {
      const d = String(r.date || '').slice(0, 10);
      if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(r);
    });

    const map = new Map();
    byDate.forEach((list, d) => {
      let totalMins = 0;
      const longs = [];
      list.forEach((r) => {
        totalMins += durationMins(r.bedtime, r.wakeup);
        const isNap = String(r.sleepType || 'long').toLowerCase() === 'nap';
        if (!isNap) {
          const bedMin = parseTime(r.bedtime);
          if (bedMin != null) longs.push({ record: r, bedMin });
        }
      });
      longs.sort((a, b) => bedSortKey(a.bedMin) - bedSortKey(b.bedMin));
      const firstLong = longs[0] || null;
      map.set(d, {
        count: list.length,
        totalMins,
        bedTime: firstLong ? String(firstLong.record.bedtime || '') : '',
        bedMinutes: firstLong ? firstLong.bedMin : null,
      });
    });
    return map;
  },

  getCalendarTasks() {
    const list = this.getSettings().calendarTasks;
    return Array.isArray(list)
      ? list.map((t) => this.normalizeCalendarTask(t)).filter((t) => t.id && t.text && t.startDate)
      : [];
  },

  getCalendarTasksForMonth(year, monthIndex) {
    const y = Number(year);
    const m = Number(monthIndex);
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return this.getCalendarTasks()
      .filter((t) => t.startDate <= monthEnd && t.endDate >= monthStart)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt));
  },

  /** 按某日自定义顺序返回覆盖该日的事项 */
  getCalendarTasksOnDate(dateStr) {
    const day = String(dateStr || '').slice(0, 10);
    if (!day) return [];
    const list = this.getCalendarTasks().filter((t) => t.startDate <= day && t.endDate >= day);
    const order = Array.isArray(this.getCalendarDayOrders()[day])
      ? this.getCalendarDayOrders()[day]
      : [];
    const rank = new Map(order.map((id, i) => [id, i]));
    return list.slice().sort((a, b) => {
      const ia = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
      const ib = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return (
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
  },

  addCalendarTask({ text, startDate, endDate, kind = 'task', color, subs = [] }) {
    const title = String(text || '').trim();
    let start = String(startDate || '').slice(0, 10);
    let end = String(endDate || start).slice(0, 10);
    const itemKind = kind === 'schedule' ? 'schedule' : 'task';
    if (!title || !start) return null;
    if (end < start) [start, end] = [end, start];
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.calendarTasks = Array.isArray(data.settings.calendarTasks)
      ? data.settings.calendarTasks
      : [];
    const task = this.normalizeCalendarTask({
      id: crypto.randomUUID(),
      text: title,
      kind: itemKind,
      color: this.normalizeCalendarItemColor(color, itemKind),
      startDate: start,
      endDate: end,
      done: false,
      subs,
      createdAt: new Date().toISOString(),
    });
    data.settings.calendarTasks.unshift(task);
    const byDay = new Map();
    (data.settings.calendarTasks || [])
      .map((t) => this.normalizeCalendarTask(t))
      .filter((t) => t.id && t.text && t.startDate)
      .forEach((t) => {
        this._eachDateInRange(t.startDate, t.endDate, (day) => {
          if (day < start || day > end) return;
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push(t.id);
        });
      });
    byDay.forEach((ids, day) => this._syncDayOrderInData(data, day, ids));
    this.save(data);
    return task;
  },

  updateCalendarTask(taskId, partial = {}) {
    if (!taskId) return null;
    const data = this.load();
    data.settings = data.settings || {};
    const list = Array.isArray(data.settings.calendarTasks) ? data.settings.calendarTasks : [];
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const current = this.normalizeCalendarTask(list[idx]);
    const nextKind =
      partial.kind === 'schedule' || partial.kind === 'task' ? partial.kind : current.kind;
    const next = this.normalizeCalendarTask({
      ...current,
      ...partial,
      kind: nextKind,
      color: partial.color != null ? partial.color : current.color,
      subs: partial.subs != null ? partial.subs : current.subs,
      id: current.id,
      updatedAt: new Date().toISOString(),
    });
    if (!next.text) return null;
    list[idx] = next;
    data.settings.calendarTasks = list;
    const byDay = new Map();
    list
      .map((t) => this.normalizeCalendarTask(t))
      .filter((t) => t.id && t.text && t.startDate)
      .forEach((t) => {
        this._eachDateInRange(t.startDate, t.endDate, (day) => {
          if (day < next.startDate || day > next.endDate) return;
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push(t.id);
        });
      });
    byDay.forEach((ids, day) => this._syncDayOrderInData(data, day, ids));
    this.save(data);
    return next;
  },

  toggleCalendarTask(taskId) {
    const task = this.getCalendarTasks().find((t) => t.id === taskId);
    if (!task || task.kind !== 'task') return null;
    return this.updateCalendarTask(taskId, { done: !task.done });
  },

  deleteCalendarTask(taskId) {
    if (!taskId) return null;
    const data = this.load();
    data.settings = data.settings || {};
    const list = Array.isArray(data.settings.calendarTasks) ? data.settings.calendarTasks : [];
    const target = list.find((t) => t.id === taskId) || null;
    if (!target) return null;
    const normalized = this.normalizeCalendarTask(target);
    const kindLabel = normalized.kind === 'schedule' ? '日程' : '任务';
    this._pushRecycleItem(data, {
      kind: 'calendarTask',
      title: `月历${kindLabel} · ${normalized.text || '未命名'}`,
      payload: { task: JSON.parse(JSON.stringify(normalized)) },
    });
    data.settings.calendarTasks = list.filter((t) => t.id !== taskId);
    this._removeCalendarTaskFromDayOrders(data, taskId);
    this.save(data);
    return target;
  },

  normalizeCalendarItemColor(color, kind = 'task') {
    const raw = String(color || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
    if (/^#[0-9A-Fa-f]{3}$/.test(raw)) {
      const r = raw[1];
      const g = raw[2];
      const b = raw[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return kind === 'schedule' ? '#3B82F6' : '#F59E0B';
  },

  getCalendarDayOrders() {
    const orders = this.getSettings().calendarDayOrders;
    return orders && typeof orders === 'object' ? orders : {};
  },

  /** 确保某日顺序表包含当天全部事项 id（新事项追加到末尾） */
  ensureCalendarDayOrder(dateStr) {
    const day = String(dateStr || '').slice(0, 10);
    if (!day) return [];
    const tasks = this.getCalendarTasks().filter((t) => t.startDate <= day && t.endDate >= day);
    const ids = tasks.map((t) => t.id);
    const data = this.load();
    data.settings = data.settings || {};
    data.settings.calendarDayOrders =
      data.settings.calendarDayOrders && typeof data.settings.calendarDayOrders === 'object'
        ? { ...data.settings.calendarDayOrders }
        : {};
    const prev = Array.isArray(data.settings.calendarDayOrders[day])
      ? data.settings.calendarDayOrders[day].filter((id) => ids.includes(id))
      : [];
    const missing = ids.filter((id) => !prev.includes(id));
    const next = [...prev, ...missing];
    data.settings.calendarDayOrders[day] = next;
    this.save(data);
    return next;
  },

  reorderCalendarTaskOnDate(dateStr, taskId, direction) {
    const day = String(dateStr || '').slice(0, 10);
    if (!day || !taskId) return null;
    const delta = Number(direction) || 0;
    if (!delta) return null;

    // 必须与界面当前展示顺序一致，不能用原始 calendarTasks 数组顺序
    const ids = this.getCalendarTasksOnDate(day).map((t) => String(t.id));
    const id = String(taskId);
    const idx = ids.indexOf(id);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) return null;

    const next = ids.slice();
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];

    const data = this.load();
    data.settings = data.settings || {};
    data.settings.calendarDayOrders =
      data.settings.calendarDayOrders && typeof data.settings.calendarDayOrders === 'object'
        ? { ...data.settings.calendarDayOrders }
        : {};
    data.settings.calendarDayOrders[day] = next;
    this.save(data);
    return next;
  },

  _removeCalendarTaskFromDayOrders(data, taskId) {
    if (!taskId) return;
    data.settings = data.settings || {};
    const orders =
      data.settings.calendarDayOrders && typeof data.settings.calendarDayOrders === 'object'
        ? data.settings.calendarDayOrders
        : {};
    const next = {};
    Object.keys(orders).forEach((key) => {
      const list = Array.isArray(orders[key]) ? orders[key].filter((id) => id !== taskId) : [];
      if (list.length) next[key] = list;
    });
    data.settings.calendarDayOrders = next;
  },

  /** 按日回调遍历 [startDate, endDate]（含首尾），日期格式 YYYY-MM-DD */
  _eachDateInRange(startDate, endDate, fn) {
    if (typeof fn !== 'function') return;
    let start = String(startDate || '').slice(0, 10);
    let end = String(endDate || start).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return;
    if (end < start) [start, end] = [end, start];
    const cursor = new Date(`${start}T00:00:00`);
    const last = new Date(`${end}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return;
    let guard = 0;
    while (cursor <= last && guard++ < 3700) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      fn(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
  },

  _syncDayOrderInData(data, day, taskIdsOnDay) {
    data.settings = data.settings || {};
    data.settings.calendarDayOrders =
      data.settings.calendarDayOrders && typeof data.settings.calendarDayOrders === 'object'
        ? data.settings.calendarDayOrders
        : {};
    const ids = (taskIdsOnDay || []).filter(Boolean);
    const prev = Array.isArray(data.settings.calendarDayOrders[day])
      ? data.settings.calendarDayOrders[day].filter((id) => ids.includes(id))
      : [];
    const missing = ids.filter((id) => !prev.includes(id));
    data.settings.calendarDayOrders[day] = [...prev, ...missing];
    return data.settings.calendarDayOrders[day];
  },

  getCalendarSubsOnDate(task, dateStr) {
    const day = String(dateStr || '').slice(0, 10);
    if (!task || !day) return [];
    return (task.subs || []).filter((s) => s.date === day);
  },

  hasCalendarSubOnDate(task, dateStr) {
    return this.getCalendarSubsOnDate(task, dateStr).length > 0;
  },

  addCalendarSub(taskId, { date, text, kind = 'task', color, done = false }) {
    const task = this.getCalendarTasks().find((t) => t.id === taskId);
    if (!task) return null;
    const day = String(date || '').slice(0, 10);
    const title = String(text || '').trim();
    if (!day || !title) return null;
    if (day < task.startDate || day > task.endDate) return null;
    const itemKind = kind === 'schedule' ? 'schedule' : 'task';
    const sub = this.normalizeCalendarSub({
      id: crypto.randomUUID(),
      date: day,
      text: title,
      kind: itemKind,
      color: this.normalizeCalendarItemColor(color, itemKind),
      done: itemKind === 'task' ? Boolean(done) : false,
      createdAt: new Date().toISOString(),
    });
    const subs = [...(task.subs || []), sub];
    return this.updateCalendarTask(taskId, { subs });
  },

  updateCalendarSub(taskId, subId, partial = {}) {
    const task = this.getCalendarTasks().find((t) => t.id === taskId);
    if (!task || !subId) return null;
    const subs = (task.subs || []).map((s) => {
      if (s.id !== subId) return s;
      const nextKind =
        partial.kind === 'schedule' || partial.kind === 'task' ? partial.kind : s.kind;
      return this.normalizeCalendarSub({
        ...s,
        ...partial,
        kind: nextKind,
        color: partial.color != null ? partial.color : s.color,
        id: s.id,
        date: partial.date != null ? String(partial.date).slice(0, 10) : s.date,
        done: nextKind === 'task' ? Boolean(partial.done != null ? partial.done : s.done) : false,
      });
    });
    const next = this.updateCalendarTask(taskId, { subs });
    return next?.subs?.find((s) => s.id === subId) || null;
  },

  toggleCalendarSub(taskId, subId) {
    const task = this.getCalendarTasks().find((t) => t.id === taskId);
    const sub = task?.subs?.find((s) => s.id === subId);
    if (!sub) return null;
    return this.updateCalendarSub(taskId, subId, { done: !sub.done });
  },

  deleteCalendarSub(taskId, subId) {
    const task = this.getCalendarTasks().find((t) => t.id === taskId);
    if (!task || !subId) return null;
    const subs = (task.subs || []).filter((s) => s.id !== subId);
    return this.updateCalendarTask(taskId, { subs });
  },

  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON(json) {
    const parsed = JSON.parse(json);
    if (!parsed.records && !parsed.cards) throw new Error('invalid format');
    const data = {
      records: parsed.records || {},
      cards: parsed.cards || [],
      settings: parsed.settings || {},
      chatMessages: parsed.chatMessages || [],
    };
    this.save(this.migrate(data));
  },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(str) {
  const d = new Date(str + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${str} 周${weekdays[d.getDay()]}`;
}
