const LLM_DEFAULTS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  preferLLM: true,
};

const DEPT_KEYWORDS = [
  { deptId: 'core', moduleId: 'bagu', words: ['八股', '面试题', '背诵', '基础'] },
  { deptId: 'core', moduleId: 'handwrite', words: ['手撕', '刷题', '算法', 'leetcode', 'ac'] },
  { deptId: 'core', moduleId: 'project', words: ['项目准备', '项目梳理', '项目亮点', '话术'] },
  { deptId: 'core', moduleId: 'resume', words: ['简历'] },
  { deptId: 'core', moduleId: 'apply', words: ['投递', 'offer', '内推'] },
  { deptId: 'core', moduleId: 'interview', words: ['面试', '一面', '二面', 'HR面'] },
  { deptId: 'living', moduleId: 'sleep', words: ['睡觉', '睡眠', '入睡', '起床', '熬夜'] },
  { deptId: 'living', moduleId: 'exercise', words: ['运动', '跑步', '健身', '瑜伽', '走路'] },
  { deptId: 'living', moduleId: 'weight', words: ['体重', '减肥', '瘦', '斤'] },
  { deptId: 'living', moduleId: 'health', words: ['早晨启动', '晨间', '梳头', '刷牙', '洗脸', '护肤', '温水', '健康'] },
  { deptId: 'living', moduleId: 'facemask', words: ['面膜', '护肤', '敷'] },
  { deptId: 'living', moduleId: 'hairmask', words: ['发膜', '头发', '护发'] },
  { deptId: 'living', moduleId: 'hairremoval', words: ['脱毛'] },
  { deptId: 'sidebiz', moduleId: 'xiaohongshu', words: ['小红书', '自媒体', '发帖', '笔记'] },
  { deptId: 'sidebiz', moduleId: 'novel', words: ['小说', '写书', '章节', '连载', '网文', '创作', '码字', '写文'] },
  { deptId: 'experience', moduleId: 'travel', words: ['玩', '出游', '旅行', '出门'] },
];

const TYPE_META = {
  habit: { label: '习惯', icon: '🔁', color: '#059669' },
  goal: { label: '目标', icon: '🎯', color: '#4F46E5' },
  combo: { label: '目标+习惯', icon: '⚡', color: '#EA580C' },
};

const ACTION_META = {
  create: { label: '新建', icon: '➕' },
  modify: { label: '修改', icon: '✏️' },
  overwrite: { label: '覆盖', icon: '🔄' },
};

const CARD_INTENT_RE =
  /每天|每日|每晚|每周|习惯|目标|打卡|改成|改为|调整|修改|更新|覆盖|替换|换成|不再|以后不|放弃|删掉|取消|延期|提前|延长|缩短|我要|我想|帮我|打算|准备|做到|完成|达到|接到|offer|投递|面试|简历|敷面膜|睡觉|睡眠|运动|学习|八股|刷题|减肥|体重|作息|面膜|发膜|小红书|小说|码字|写文/;

const CHAT_INTENT_RE =
  /^(你好|嗨|哈喽|hello|hi|在吗|在不在|你是谁|你叫什么|怎么样|还好吗|谢谢|多谢|晚安|早安|午安|哈哈|嘿嘿|无聊|开心|难过|累|emo|天气|喜欢|讨厌|可爱|傻|笨)/i;

const NLP = {
  getSettings() {
    const data = Store.load();
    return { ...LLM_DEFAULTS, ...(data.settings?.llm || {}) };
  },

  saveSettings(partial) {
    const data = Store.load();
    data.settings = data.settings || {};
    data.settings.llm = { ...this.getSettings(), ...partial };
    Store.save(data);
  },

  pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
  },

  buildPersonaPrompt(assistant) {
    const a = assistant || Store.getAssistant();
    return `你是${a.name || '时间喵'}。
人设：${a.persona || '一只软萌的时间管理小猫'}
语气：${a.tone || '温柔可爱，偶尔用「喵～」'}
回复要自然、简短（1-3 句），像可爱的猫猫在和朋友聊天。
必须直接回答用户的问题；若问你能做什么，清楚说明能力，不要答非所问。`;
  },

  buildCapabilitiesReply(assistant) {
    const name = assistant?.name || '时间喵';
    return `喵～${name}可以帮你做这些事：

1. **闲聊陪伴**：打招呼、聊心情、安慰鼓励你
2. **记习惯/目标**：比如「每天学 2 小时」「8 月拿到 offer」→ 自动生成打卡卡片
3. **改卡片**：比如「把睡觉改成 10 点」「不再敷面膜，改成每周运动」

想试试就直接跟我说～`;
  },

  isLLMConfigured(settings) {
    const s = settings || this.getSettings();
    return Boolean(s.preferLLM && s.apiKey);
  },

  async fetchLLMStatus() {
    try {
      const res = await fetch('/api/llm/status', { credentials: 'include' });
      if (!res.ok) return { configured: false, connected: false, error: '无法查询 LLM 状态' };
      return res.json();
    } catch {
      return { configured: false, connected: false, error: '服务未启动或网络异常' };
    }
  },

  async callLLM(messages, settings, options = {}) {
    const res = await fetch('/api/llm/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: options.temperature ?? 0.7,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `LLM 请求失败 (${res.status})`);
    }
    if (!data.content) throw new Error('模型返回为空');
    return data.content;
  },

  buildLLMUnavailableReply(err, assistant, text) {
    const name = assistant?.name || '时间喵';
    const reason = err?.message || '未知错误';
    const settings = this.getSettings();
    let msg = `⚠️ ${name}没能连上 Kimi 大模型\n\n原因：${reason}\n\n请打开侧边栏「LLM 设置」检查 Base URL、API Key、模型名，并点击「测试连接」。\n\n当前配置：\n· Base URL: ${settings.baseUrl || '（未填）'}\n· 模型: ${settings.model || '（未填）'}`;

    if (!this.isLLMConfigured(settings)) {
      msg = `⚠️ ${name}当前是离线模式（未配置或未启用 LLM）\n\n请到侧边栏「LLM 设置」填写 Kimi API Key，并勾选「优先使用 LLM」。`;
    }

    return msg;
  },

  buildOfflineChatReply(text, assistant) {
    const name = assistant?.name || '时间喵';
    const answer = this.chatWithRules(text, assistant);
    return `${answer}\n\n（💡 当前为离线回复；配置 Kimi 后可智能对话）`;
  },

  classifyWithRules(text) {
    const trimmed = text.trim();
    if (!trimmed) return { intent: 'chat' };
    if (CARD_INTENT_RE.test(trimmed)) return { intent: 'card' };
    if (CHAT_INTENT_RE.test(trimmed) && trimmed.length <= 24) return { intent: 'chat' };
    if (/[？?]$/.test(trimmed) && !CARD_INTENT_RE.test(trimmed)) return { intent: 'chat' };
    if (trimmed.length <= 8 && !CARD_INTENT_RE.test(trimmed)) return { intent: 'chat' };
    return { intent: 'card' };
  },

  async classifyIntent(text, context = {}) {
    const trimmed = text.trim();
    if (!trimmed) return { intent: 'chat' };

    const settings = this.getSettings();
    if (settings.preferLLM && settings.apiKey) {
      try {
        const content = await this.callLLM(
          [
            {
              role: 'system',
              content:
                '你是意图分类器。判断用户消息属于 card（创建/修改/覆盖打卡卡片、习惯、目标）还是 chat（闲聊、问候、情感、无关话题）。只返回 JSON：{"intent":"card"|"chat"}',
            },
            { role: 'user', content: trimmed },
          ],
          settings,
          { temperature: 0 }
        );
        const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '');
        const parsed = JSON.parse(jsonStr);
        if (parsed.intent === 'card' || parsed.intent === 'chat') return parsed;
      } catch (err) {
        console.warn('意图识别失败，降级为规则', err);
        if (this.isLLMConfigured(settings)) {
          return { intent: this.classifyWithRules(trimmed).intent, llmError: err.message };
        }
      }
    }

    return this.classifyWithRules(trimmed);
  },

  chatWithRules(text, assistant) {
    const a = assistant || Store.getAssistant();
    const name = a.name || '时间喵';
    const t = text.trim();

    if (/你好|嗨|哈喽|hello|hi|在吗|在不在/i.test(t)) {
      return this.pickOne([
        `喵～${name}在呢！想闲聊还是记个习惯，都可以跟我说～`,
        `哈喽呀～我是${name}，今天过得怎么样喵？`,
        `在的在的！${name}随时陪你聊天或整理目标哦～`,
      ]);
    }
    if (/你是谁|你叫什么|介绍一下/i.test(t)) {
      return this.pickOne([
        `我是${name}呀～${a.persona || '一只帮你管时间的小猫'}，有事尽管找我就好喵～`,
        `${name}报到！平时陪你聊天，也能帮你把习惯和目标记成打卡卡片～`,
      ]);
    }
    if (/你会干什么|你能干什么|你会做什么|你能做什么|有什么用|有什么功能|能帮我什么|怎么用|如何使用|帮助|help|能干嘛/i.test(t)) {
      return this.buildCapabilitiesReply(a);
    }
    if (/谢谢|多谢|thanks/i.test(t)) {
      return this.pickOne([
        `不客气喵～能帮到你${name}也很开心！`,
        `嘿嘿，应该的～有需要随时来找我喵！`,
      ]);
    }
    if (/晚安|good night/i.test(t)) {
      return this.pickOne([
        `晚安喵～早点休息，明天也要元气满满哦！`,
        `好的，${name}也去舔毛睡觉啦，晚安～`,
      ]);
    }
    if (/早安|早上好|good morning/i.test(t)) {
      return this.pickOne([
        `早安喵～今天也要加油呀！`,
        `早～${name}已经醒啦，今天想先从哪件事开始？`,
      ]);
    }
    if (/累|疲惫|好困|emo|难过|焦虑|压力/i.test(t)) {
      return this.pickOne([
        `抱抱你喵～累了就歇一歇，${name}会一直陪着你的。`,
        `听起来今天不容易呢…要不要跟我聊聊，或者先记一个小目标，慢慢推进？`,
      ]);
    }
    if (/开心|高兴|哈哈|嘿嘿|太好了/i.test(t)) {
      return this.pickOne([
        `太好啦喵～看到你开心${name}也超高兴！`,
        `嘿嘿，这心情不错～要不要顺便把今天的好状态记下来？`,
      ]);
    }
    if (/无聊|没事干/i.test(t)) {
      return this.pickOne([
        `那来跟${name}聊会儿天吧～或者想想有没有小习惯想养成？`,
        `无聊的话，可以翻翻你的打卡卡片，或者跟我撒撒娇也行喵～`,
      ]);
    }
    if (/可爱|喜欢|爱你|么么/i.test(t)) {
      return this.pickOne([
        `喵呜～${name}也超喜欢你！`,
        `嘿嘿…被夸了，尾巴都要翘起来了～`,
      ]);
    }
    if (/什么大模型|用的什么模型|什么模型|kimi|moonshot/i.test(t)) {
      const settings = this.getSettings();
      if (this.isLLMConfigured(settings)) {
        return `喵～${name}用的是 ${settings.model}（${settings.baseUrl}），通过服务端转发连接 Kimi 哦～`;
      }
      return `喵～${name}还没连上大模型呢，去侧边栏「LLM 设置」配置 Kimi API Key 吧～`;
    }
    if (/知道我是谁|我是谁|我叫什么/i.test(t)) {
      const profile = Store.getProfile();
      if (profile?.username) {
        return `当然知道呀～你是 ${profile.username} 喵！${profile.signature ? profile.signature + '～' : ''}`;
      }
      return `喵～你可以在左侧个人资料里设置名字，${name}就能记住你是谁啦～`;
    }

    return this.pickOne([
      `喵～${name}听到啦！你可以问我「你会干什么」，或直接说想记的习惯目标～`,
      `嗯嗯，我在呢～不确定我能做什么的话，可以问我「你会干什么」哦！`,
    ]);
  },

  async generateChatReply(text, context = {}) {
    const assistant = context.assistant || Store.getAssistant();
    const settings = this.getSettings();
    let history = (context.recentMessages || []).slice(-8);
    const last = history[history.length - 1];
    if (last?.role === 'user' && last.content === text) history = history.slice(0, -1);

    if (!this.isLLMConfigured(settings)) {
      return this.buildOfflineChatReply(text, assistant);
    }

    try {
      const messages = [
        {
          role: 'system',
          content: `${this.buildPersonaPrompt(assistant)}

你的能力：
- 闲聊、安慰、鼓励用户
- 帮用户用自然语言创建/修改/覆盖打卡卡片（习惯、目标）

当前用户资料：${Store.getProfile()?.username ? `昵称 ${Store.getProfile().username}` : '未设置昵称'}
当前 LLM：${settings.model}（Kimi / Moonshot）

回复要求：
- 必须紧扣用户上一句话，直接回答问题
- 用户问「你会干什么/你能做什么/用的什么模型」时，如实回答
- 用户问「你知道我是谁吗」时，根据用户资料回答；不知道就诚实说不知道
- 不要泛泛地说「我在呢」，不要答非所问
- 不要输出 JSON`,
        },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];
      return await this.callLLM(messages, settings, { temperature: 0.85 });
    } catch (err) {
      console.warn('闲聊生成失败', err);
      return this.buildLLMUnavailableReply(err, assistant, text);
    }
  },

  buildCardReply(action, card, context = {}) {
    const assistant = context.assistant || Store.getAssistant();
    const name = assistant.name || '时间喵';
    const actionLabel = ACTION_META[action]?.label || '新建';
    const engine = card.parsedBy === 'llm' ? '' : '（本地规则识别）';
    let reply = `喵～已经帮你${actionLabel}「${card.title}」${card.typeLabel}卡片啦！${engine}`;
    if (context.targetTitle && action !== 'create') reply += `\n原来的卡片是：${context.targetTitle}`;
    if (context.fallback === 'target_not_found') reply += '\n（没找到对应旧卡片，就先当新建处理啦～）';
    reply += `\n${name}会继续帮你盯着的，加油喵！`;
    return reply.trim();
  },

  async parse(text, context = {}) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('请输入内容');

    const existingCards = context.existingCards || [];
    const settings = this.getSettings();
    if (settings.preferLLM && settings.apiKey) {
      try {
        const result = await this.parseWithLLM(trimmed, settings, existingCards);
        return { ...result, sourceText: trimmed, parsedBy: 'llm' };
      } catch (err) {
        console.warn('LLM 解析失败，降级为规则引擎', err);
      }
    }

    return { ...this.parseWithRules(trimmed, existingCards), sourceText: trimmed, parsedBy: 'rules' };
  },

  parseWithRules(text, existingCards = []) {
    const hasHabit = /每天|每日|每晚|每周|坚持|打卡|定时/.test(text);
    const hasGoal = /目标|做到|完成|达到|之前|以内|前接到|接到|减|涨到|实现|搞定/.test(text);

    let type = 'habit';
    if (hasHabit && hasGoal) type = 'combo';
    else if (hasGoal && !hasHabit) type = 'goal';
    else if (hasHabit) type = 'habit';

    const action = this.detectAction(text, existingCards);
    const mapping = this.matchDept(text);
    const title = this.extractTitle(text, type);
    const frequency = /每周/.test(text) ? 'weekly' : 'daily';
    const deadline = this.extractDeadline(text);

    const result = {
      action,
      targetCardId: action === 'create' ? null : this.matchTargetCard(text, existingCards)?.id || null,
      type,
      title,
      deptId: mapping.deptId,
      moduleId: mapping.moduleId,
      icon: mapping.icon || TYPE_META[type].icon,
    };

    if (type === 'habit' || type === 'combo') {
      result.habit = { frequency, action: title };
    }
    if (type === 'goal' || type === 'combo') {
      result.goal = { target: title, deadline };
    }

    if (result.action !== 'create' && !result.targetCardId) {
      result.action = 'create';
    }

    return result;
  },

  detectAction(text, existingCards) {
    if (/覆盖|替换|换成|不再|以后不|放弃|删掉|取消/.test(text)) return 'overwrite';
    if (/改成|改为|调整|修改|更新|改到|延期|提前|延长|缩短/.test(text)) return 'modify';
    if (existingCards.length && this.matchTargetCard(text, existingCards)) {
      if (/把|将|那个|这个|原来的|已有的/.test(text)) return 'modify';
    }
    return 'create';
  },

  matchTargetCard(text, existingCards) {
    if (!existingCards.length) return null;

    let best = null;
    let bestScore = 0;
    for (const card of existingCards) {
      let score = 0;
      const probes = [card.title, card.habit?.action, card.goal?.target].filter(Boolean);
      for (const probe of probes) {
        if (probe.length >= 2 && text.includes(probe.slice(0, Math.min(probe.length, 6)))) score += 3;
        for (let i = 2; i <= Math.min(probe.length, 8); i++) {
          const chunk = probe.slice(0, i);
          if (chunk.length >= 2 && text.includes(chunk)) score += 1;
        }
      }
      for (const w of DEPT_KEYWORDS) {
        if (card.deptId === w.deptId && card.moduleId === w.moduleId) {
          if (w.words.some((word) => text.includes(word))) score += 2;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    return bestScore >= 2 ? best : null;
  },

  matchDept(text) {
    for (const item of DEPT_KEYWORDS) {
      if (item.words.some((w) => text.includes(w))) {
        const mod = getModule(item.deptId, item.moduleId);
        const dept = getDepartment(item.deptId);
        return {
          deptId: item.deptId,
          moduleId: item.moduleId,
          icon: mod?.icon || dept?.modules[0]?.icon || '📌',
        };
      }
    }
    return { deptId: 'living', moduleId: 'health', icon: '🌅' };
  },

  extractTitle(text, type) {
    const cleaned = text
      .replace(/我要|我想|帮我|希望|打算|准备/g, '')
      .replace(/每天|每日|每晚|每周/g, '')
      .trim();
    if (cleaned.length <= 24) return cleaned || text.slice(0, 24);
    if (type === 'goal') {
      const m = text.match(/(.{4,22}(?:offer|完成|达到|做到|实现))/);
      if (m) return m[1];
    }
    return cleaned.slice(0, 22) + (cleaned.length > 22 ? '…' : '');
  },

  extractDeadline(text) {
    const m1 = text.match(/(\d{1,2})\s*月\s*(\d{1,2})?\s*日?/);
    if (m1) {
      const month = m1[1].padStart(2, '0');
      const day = (m1[2] || '10').padStart(2, '0');
      return `2026-${month}-${day}`;
    }
    if (/8\s*月\s*上旬/.test(text)) return '2026-08-10';
    if (/8\s*月/.test(text)) return '2026-08-31';
    return null;
  },

  async parseWithLLM(text, settings, existingCards = []) {
    const deptList = DEPARTMENTS.map((d) => `${d.id}(${d.name}): ${d.modules.map((m) => m.id).join(',')}`).join('\n');
    const cardList = existingCards.length
      ? existingCards
          .map(
            (c) =>
              `- id:${c.id} | ${c.title} | type:${c.type} | ${c.deptId}/${c.moduleId}` +
              (c.habit ? ` | 习惯:${c.habit.action}` : '') +
              (c.goal ? ` | 目标:${c.goal.target}${c.goal.deadline ? ' 截止' + c.goal.deadline : ''}` : '')
          )
          .join('\n')
      : '（暂无已有卡片）';

    const system = `你是 OPC 个人生活管理系统的 NL 解析器。根据用户自然语言，识别操作意图、事项类型并生成打卡卡片。

操作意图 action（必判）：
- create：全新事项，与已有卡片无关（如「每天敷面膜」「8 月拿到 offer」）
- modify：在已有卡片上调整部分字段，保留打卡记录（如「把睡觉时间改成 10 点」「目标延期到 9 月」）
- overwrite：用新事项替换已有卡片，旧内容作废（如「以后不敷面膜了，改成每周运动 3 次」「放弃减体重，改成增肌」）

判 action 时结合用户措辞与已有卡片列表；modify/overwrite 时必须给出 targetCardId。

类型定义：
- habit：重复性习惯（如「每天敷面膜」「11 点前睡」）
- goal：有终点/结果的目标（如「8 月上旬拿到 offer」「减 5 斤」）
- combo：目标 + 支撑它的习惯（如「为了 offer 每天学 3 小时」）

已有卡片：
${cardList}

部门与 moduleId 对照：
${deptList}

只返回 JSON，不要 markdown：
{
  "action": "create"|"modify"|"overwrite",
  "targetCardId": "已有卡片id或null",
  "type": "habit"|"goal"|"combo",
  "title": "卡片标题，8-16字",
  "deptId": "部门id",
  "moduleId": "模块id",
  "icon": "一个emoji",
  "habit": {"frequency":"daily"|"weekly","action":"..."} 或 null,
  "goal": {"target":"...","deadline":"YYYY-MM-DD或null"} 或 null
}`;

    const content = await this.callLLM(
      [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      settings,
      { temperature: 0.2 }
    );
    const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '');
    const parsed = JSON.parse(jsonStr);

    if (!['create', 'modify', 'overwrite'].includes(parsed.action)) parsed.action = 'create';
    if (!['habit', 'goal', 'combo'].includes(parsed.type)) throw new Error('invalid type');
    if (!parsed.title) throw new Error('missing title');
    if (parsed.action !== 'create' && !parsed.targetCardId) parsed.action = 'create';

    return parsed;
  },

  buildCard(parsed, existingCard = null) {
    const meta = TYPE_META[parsed.type];
    const dept = getDepartment(parsed.deptId);
    const action = parsed.action || 'create';
    const actionMeta = ACTION_META[action];
    const now = new Date().toISOString();

    const base = {
      sourceText: parsed.sourceText,
      title: parsed.title,
      type: parsed.type,
      typeLabel: meta.label,
      action,
      actionLabel: actionMeta.label,
      deptId: parsed.deptId,
      moduleId: parsed.moduleId,
      deptName: dept?.name || '',
      icon: parsed.icon || meta.icon,
      color: dept?.color || meta.color,
      habit: parsed.habit || null,
      goal: parsed.goal || null,
      parsedBy: parsed.parsedBy,
      updatedAt: now,
    };

    if (existingCard) {
      return {
        ...existingCard,
        ...base,
        checkIns: action === 'overwrite' ? [] : existingCard.checkIns || [],
      };
    }

    return {
      id: crypto.randomUUID(),
      ...base,
      checkIns: [],
      createdAt: now,
    };
  },

  applyParsed(parsed, existingCards = []) {
    const action = parsed.action || 'create';
    if (action === 'create') {
      return { action, card: this.buildCard(parsed) };
    }

    const target = existingCards.find((c) => c.id === parsed.targetCardId);
    if (!target) {
      return { action: 'create', card: this.buildCard(parsed), fallback: 'target_not_found' };
    }

    return { action, card: this.buildCard(parsed, target), targetTitle: target.title };
  },
};
