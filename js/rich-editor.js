const RichEditor = {
  _instances: [],
  _underlineReady: false,
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
      },
    };
  },

  toolbarOptions: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['code-block'],
    ['clean'],
  ],

  mount(hostId, inputId, initialHtml = '', options = {}) {
    const host = document.getElementById(hostId);
    const hidden = document.getElementById(inputId);
    if (!host || !hidden || typeof Quill === 'undefined') return null;

    this.ensureUnderline();
    this.loadLastFormats();

    const quill = new Quill(host, {
      theme: 'snow',
      modules: {
        toolbar: this.buildToolbarConfig(options.toolbar || this.toolbarOptions),
      },
      placeholder: options.placeholder || '支持标题、列表、代码块、高亮、字体颜色、加粗、斜体、下划线…',
    });

    if (initialHtml) {
      quill.clipboard.dangerouslyPasteHTML(this.normalizeListHtml(initialHtml));
    }
    hidden.value = this.normalizeHtml(quill.root.innerHTML);

    const sync = () => {
      hidden.value = this.normalizeHtml(quill.root.innerHTML);
      if (typeof options.onChange === 'function') options.onChange(hidden.value);
    };
    quill.on('text-change', sync);

    this.bindRememberedColors(quill);

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
