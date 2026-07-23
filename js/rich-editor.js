const RichEditor = {
  _instances: [],
  _underlineReady: false,
  _listStartReady: false,
  lastBackground: null,
  lastColor: null,
  _lastFormatsLoaded: false,

  ensureUnderline() {
    if (this._underlineReady || typeof Quill === 'undefined') return;
    const Inline = Quill.import('blots/inline');
    class UnderlineBlot extends Inline {}
    UnderlineBlot.blotName = 'underline';
    UnderlineBlot.tagName = 'U';
    Quill.register(UnderlineBlot, true);
    this._underlineReady = true;
  },

  ensureListStart() {
    if (this._listStartReady || typeof Quill === 'undefined') return;
    const Parchment = Quill.import('parchment');
    const OpcStart = new Parchment.Attributor.Attribute('opc-start', 'data-opc-start', {
      scope: Parchment.Scope.BLOCK,
    });
    Quill.register(OpcStart, true);
    this._listStartReady = true;
  },

  loadLastFormats() {
    if (this._lastFormatsLoaded) return;
    this._lastFormatsLoaded = true;
    try {
      const raw = localStorage.getItem('opc-rich-last-formats');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.background) this.lastBackground = data.background;
      if (data.color) this.lastColor = data.color;
    } catch (_) {
      /* ignore */
    }
  },

  saveLastFormats() {
    try {
      localStorage.setItem(
        'opc-rich-last-formats',
        JSON.stringify({
          background: this.lastBackground,
          color: this.lastColor,
        })
      );
    } catch (_) {
      /* ignore */
    }
  },

  rememberFormat(format, value) {
    if (!value) return;
    if (format === 'background') this.lastBackground = value;
    if (format === 'color') this.lastColor = value;
    this.saveLastFormats();
  },

  updatePickerLabelColor(label, color, format) {
    if (!label || !color) return;
    if (format === 'background') {
      label.style.backgroundColor = color;
      label.style.borderRadius = '3px';
      return;
    }
    const stroke = label.querySelector('.ql-stroke');
    if (stroke) stroke.style.stroke = color;
    const fill = label.querySelector('.ql-fill');
    if (fill) fill.style.fill = color;
  },

  bindRememberedColors(quill) {
    const toolbar = quill.getModule('toolbar');
    if (!toolbar?.container) return;

    const bindPicker = (selector, format, getLast) => {
      const picker = toolbar.container.querySelector(selector);
      if (!picker) return;
      const label = picker.querySelector('.ql-picker-label');
      if (!label) return;

      label.title =
        format === 'background'
          ? '点击应用上次高亮；打开色板可更换颜色'
          : '点击应用上次字体颜色；打开色板可更换颜色';

      const last = getLast();
      if (last) this.updatePickerLabelColor(label, last, format);

      label.addEventListener(
        'mousedown',
        (e) => {
          if (e.button !== 0) return;
          const remembered = getLast();
          if (!remembered) return;
          // 再次点击：默认套用上次颜色（色板仍可打开换色）
          quill.focus();
          quill.format(format, remembered);
          this.updatePickerLabelColor(label, remembered, format);
        },
        true
      );

      picker.querySelectorAll('.ql-picker-item[data-value]').forEach((item) => {
        item.addEventListener('mousedown', () => {
          const val = item.getAttribute('data-value');
          if (!val) return;
          this.rememberFormat(format, val);
          this.updatePickerLabelColor(label, val, format);
        });
      });
    };

    bindPicker('.ql-background', 'background', () => this.lastBackground);
    bindPicker('.ql-color', 'color', () => this.lastColor);
  },

  buildToolbarConfig(container) {
    const self = this;
    return {
      container,
      handlers: {
        background(value) {
          if (value) {
            self.rememberFormat('background', value);
            this.quill.format('background', value);
          } else {
            this.quill.format('background', false);
          }
        },
        color(value) {
          if (value) {
            self.rememberFormat('color', value);
            this.quill.format('color', value);
          } else {
            this.quill.format('color', false);
          }
        },
        image() {
          self.pickAndInsertImage(this.quill);
        },
      },
    };
  },

  toolbarOptions: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['code-block', 'image'],
    ['clean'],
  ],

  parseStartNumber(value) {
    const n = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(9999, n);
  },

  applyListStartStyles(root) {
    if (!root) return;
    root.querySelectorAll('li[data-opc-start]').forEach((li) => {
      const n = this.parseStartNumber(li.getAttribute('data-opc-start'));
      if (!n) {
        li.removeAttribute('data-opc-start');
        li.style.removeProperty('counter-set');
        li.style.removeProperty('counter-increment');
        return;
      }
      li.setAttribute('data-opc-start', String(n));
      // 直接设为 n，并禁止本项再 +1，避免出现 0. / 2.
      li.style.counterSet = `opc-ordered ${n}`;
      li.style.counterIncrement = 'none';
    });
    root.querySelectorAll('li:not([data-opc-start])').forEach((li) => {
      li.style.removeProperty('counter-set');
      li.style.removeProperty('counter-increment');
    });
  },

  /**
   * 输入「数字. + 空格」开始/重开有序序列：
   * 例如已有 1,2,3,4，在原第 2 项前输入 1. 空格 → 变成 1,1,2,3
   */
  bindOrderedListShortcut(quill) {
    if (!quill?.keyboard) return;
    const self = this;

    const spaceHandler = function spaceHandler(range, context) {
      const m = String(context.prefix || '').match(/^(\d+)\.$/);
      if (!m) return false;
      const n = self.parseStartNumber(m[1]);
      if (!n) return false;
      const start = Math.max(0, range.index - m[0].length);
      this.quill.deleteText(start, m[0].length, 'user');
      this.quill.formatLine(start, 1, 'list', 'ordered', 'user');
      this.quill.formatLine(start, 1, 'opc-start', String(n), 'user');
      // 立刻写 DOM，避免首帧显示 0.
      const [line] = this.quill.getLine(start);
      const li = line?.domNode;
      if (li && li.tagName === 'LI') {
        li.setAttribute('data-opc-start', String(n));
        li.style.counterSet = `opc-ordered ${n}`;
        li.style.counterIncrement = 'none';
      }
      requestAnimationFrame(() => self.applyListStartStyles(this.quill.root));
      return true;
    };

    quill.keyboard.addBinding(
      {
        key: ' ',
        collapsed: true,
        prefix: /^\d+\.$/,
      },
      spaceHandler
    );

    // 回车新建列表项时不要继承上一行的起始序号
    quill.keyboard.addBinding(
      {
        key: 'Enter',
        collapsed: true,
        format: { list: 'ordered' },
      },
      function enterHandler() {
        setTimeout(() => {
          const sel = quill.getSelection();
          if (!sel) return;
          const formats = quill.getFormat(sel.index);
          if (formats.list === 'ordered' && formats['opc-start']) {
            quill.formatLine(sel.index, 1, 'opc-start', false, 'silent');
            self.applyListStartStyles(quill.root);
          }
        }, 0);
        return false;
      }
    );
  },

  async compressImageFile(file, opts = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('请粘贴或选择图片文件');
    }
    const maxBytes = opts.maxBytes || 5 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error('图片不能超过 5MB');

    const bitmap = await createImageBitmap(file);
    const maxW = opts.maxWidth || 1200;
    const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const quality = opts.quality || 0.82;
    return canvas.toDataURL('image/jpeg', quality);
  },

  insertImage(quill, dataUrl) {
    if (!quill || !dataUrl) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    const index = Math.max(0, range.index);
    quill.insertEmbed(index, 'image', dataUrl, 'user');
    quill.insertText(index + 1, '\n', 'user');
    quill.setSelection(index + 2, 0, 'silent');
  },

  pickAndInsertImage(quill) {
    if (!quill) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const dataUrl = await this.compressImageFile(file);
        quill.focus();
        this.insertImage(quill, dataUrl);
      } catch (err) {
        alert(err?.message || '图片插入失败');
      }
    });
    input.click();
  },

  bindImagePaste(quill) {
    if (!quill?.root) return;
    quill.root.addEventListener(
      'paste',
      (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imageItem = items.find((item) => item.kind === 'file' && /^image\//.test(item.type));
        if (!imageItem) return;
        const file = imageItem.getAsFile();
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        this.compressImageFile(file)
          .then((dataUrl) => {
            quill.focus();
            this.insertImage(quill, dataUrl);
          })
          .catch((err) => alert(err?.message || '图片粘贴失败'));
      },
      true
    );

    quill.root.addEventListener('drop', (e) => {
      const file = Array.from(e.dataTransfer?.files || []).find((f) =>
        String(f.type || '').startsWith('image/')
      );
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      this.compressImageFile(file)
        .then((dataUrl) => {
          quill.focus();
          this.insertImage(quill, dataUrl);
        })
        .catch((err) => alert(err?.message || '图片拖入失败'));
    });
  },

  mount(hostId, inputId, initialHtml = '', options = {}) {
    const host = document.getElementById(hostId);
    const hidden = document.getElementById(inputId);
    if (!host || !hidden || typeof Quill === 'undefined') return null;

    this.ensureUnderline();
    this.ensureListStart();
    this.loadLastFormats();

    const quill = new Quill(host, {
      theme: 'snow',
      modules: {
        toolbar: this.buildToolbarConfig(options.toolbar || this.toolbarOptions),
      },
      placeholder:
        options.placeholder ||
        '支持标题、列表、代码块、高亮、字体颜色；可粘贴图片；输入 1. 空格开始新的有序编号…',
    });

    if (initialHtml) {
      quill.clipboard.dangerouslyPasteHTML(this.normalizeListHtml(initialHtml));
    }
    this.applyListStartStyles(quill.root);
    hidden.value = this.normalizeHtml(quill.root.innerHTML);

    const sync = () => {
      this.applyListStartStyles(quill.root);
      hidden.value = this.normalizeHtml(quill.root.innerHTML);
      if (typeof options.onChange === 'function') options.onChange(hidden.value);
    };
    quill.on('text-change', sync);

    this.bindRememberedColors(quill);
    this.bindImagePaste(quill);
    this.bindOrderedListShortcut(quill);

    this._instances.push({ quill, hidden, sync });
    return quill;
  },

  cleanIndentList(listEl) {
    listEl.querySelectorAll('li').forEach((li) => {
      for (let i = 1; i <= 9; i += 1) li.classList.remove(`ql-indent-${i}`);
    });
  },

  /** Quill 会把「有序项 + 子级无序列表」拆成多个 ol/ul，合并后编号才能连续 */
  normalizeListHtml(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(html || '').trim();
    if (!wrap.firstElementChild) return String(html || '').trim();

    let merged = true;
    while (merged) {
      merged = false;
      let el = wrap.firstElementChild;
      while (el) {
        const next = el.nextElementSibling;
        if (el.tagName === 'OL' && el.children.length === 1) {
          const ol = el;
          let lastLi = ol.children[0];
          let cursor = ol.nextElementSibling;

          if (cursor && cursor.tagName === 'UL') {
            this.cleanIndentList(cursor);
            lastLi.appendChild(cursor);
            merged = true;
            cursor = ol.nextElementSibling;
          }

          while (cursor && cursor.tagName === 'OL' && cursor.children.length === 1) {
            const nextLi = cursor.children[0];
            ol.appendChild(nextLi);
            cursor.remove();
            lastLi = nextLi;
            merged = true;
            cursor = ol.nextElementSibling;
            if (cursor && cursor.tagName === 'UL') {
              this.cleanIndentList(cursor);
              lastLi.appendChild(cursor);
              merged = true;
              cursor = ol.nextElementSibling;
            }
          }
        }
        el = next;
      }
    }

    return wrap.innerHTML;
  },

  normalizeHtml(html) {
    const trimmed = String(html || '').trim();
    if (!trimmed || trimmed === '<p><br></p>' || trimmed === '<p></p>') return '';
    return this.normalizeListHtml(trimmed);
  },

  syncAll() {
    this._instances.forEach(({ quill, hidden }) => {
      if (quill) this.applyListStartStyles(quill.root);
      if (quill && hidden) hidden.value = this.normalizeHtml(quill.root.innerHTML);
    });
  },

  destroyAll() {
    this._instances = [];
  },

  toPlainText(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  },
};
