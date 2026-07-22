const NORTH_STAR = '8 月上旬接到 offer';
const NORTH_STAR_DEADLINE = '2026-08-10'; // 8 月上旬截止

function getNorthStarCountdown() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(NORTH_STAR_DEADLINE + 'T00:00:00');
  const days = Math.ceil((deadline - today) / 86400000);
  if (days > 0) return { days, label: `还剩 ${days} 天`, overdue: false };
  if (days === 0) return { days: 0, label: '就是今天', overdue: false };
  return { days: Math.abs(days), label: `已超期 ${Math.abs(days)} 天`, overdue: true };
}

const TOPBAR_WIDGET_DEFAULTS = {
  northStar: { colorFrom: '#4F46E5', colorTo: '#7C3AED' },
  interview: {
    colorFrom: '#0891B2',
    colorTo: '#059669',
    urgentFrom: '#EA580C',
    urgentTo: '#DC2626',
  },
};

/** 周一 → 周日，用于按周打卡习惯 */
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 自定义打卡频率 */
const CHECKIN_FREQ_OPTIONS = [
  { id: 'daily', label: '每天' },
  { id: 'weekly', label: '每周（周一至周日）' },
  { id: 'weekdays', label: '工作日（周一至周五）' },
  { id: 'weekend', label: '周末' },
  { id: 'custom', label: '自定义星期' },
];

function todayWeekdayLabel(date = new Date()) {
  const idx = (date.getDay() + 6) % 7; // Mon=0 … Sun=6
  return WEEKDAY_LABELS[idx];
}

function isCustomCheckinModule(mod) {
  return Boolean(mod && (mod.moduleKind === 'customCheckin' || mod.recordView === 'customCheckin' || mod.recordView === 'weekdayCheckin'));
}

/** 按频率返回要打卡的星期列表；每天模式返回 null */
function getCheckinDays(mod) {
  if (!mod) return WEEKDAY_LABELS;
  const freq = mod.checkinFreq || 'weekly';
  if (freq === 'daily') return null;
  if (freq === 'weekdays') return WEEKDAY_LABELS.slice(0, 5);
  if (freq === 'weekend') return WEEKDAY_LABELS.slice(5);
  if (freq === 'custom') {
    const days = (Array.isArray(mod.checkinDays) ? mod.checkinDays : []).filter((d) =>
      WEEKDAY_LABELS.includes(d)
    );
    return days.length ? days : [...WEEKDAY_LABELS];
  }
  return [...WEEKDAY_LABELS];
}

function checkinFreqLabel(freq) {
  return CHECKIN_FREQ_OPTIONS.find((o) => o.id === freq)?.label || '每周（周一至周日）';
}

const HANDWRITE_METHOD_ORDER = [
  '哈希',
  '双指针',
  '链表',
  '滑动窗口',
  '二分',
  'DFS',
  'BFS',
  '动态规划',
  '贪心',
  '回溯',
  '排序',
  '其他',
  '未分类',
];

/** 个人笔记网站（独立项目，另开服务后改此地址） */
const BAGU_NOTES_URL = 'http://127.0.0.1:8090';

const BAGU_QUESTION_BANKS = [
  {
    id: 'agent',
    name: 'Agent',
    desc: '智能体架构、规划、工具调用与多 Agent 协作…',
    iconSrc: '/images/agent.png',
  },
  {
    id: 'rag',
    name: 'RAG',
    desc: '检索增强、向量库、Embedding 与评测优化…',
    iconSrc: '/images/rag.png',
  },
  {
    id: 'mysql',
    name: 'MySQL',
    desc: '索引、事务、锁、日志与 SQL 调优…',
    iconSrc: '/images/mysql.png',
    categories: ['存储引擎', '索引', '事务与 MVCC', '锁', '日志', 'SQL 优化'],
  },
  {
    id: 'redis',
    name: 'Redis',
    desc: '数据结构、持久化、缓存设计与集群…',
    iconSrc: '/images/redis.png',
  },
  {
    id: 'python',
    name: 'Python',
    desc: '语法、并发、内存管理与常用库…',
    iconSrc: '/images/python.png',
    categories: ['基础语法', '数据结构', '面向对象', '并发与异步', '内存与 GC', '工程与常用库'],
  },
  {
    id: 'langchain',
    name: 'LangChain',
    desc: 'Chain、Memory、Tool 与 Agent 编排…',
    iconSrc: '/images/langchain.png',
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    desc: '状态图、节点编排与多步工作流…',
    iconSrc: '/images/langgraph.svg',
  },
  {
    id: 'linux',
    name: 'Linux',
    desc: '进程线程、网络、Shell 与性能排查…',
    iconSrc: '/images/linux.png',
  },
  {
    id: 'docker',
    name: 'Docker',
    desc: '镜像、容器、网络与 Compose 实践…',
    iconSrc: '/images/docker.png',
  },
  {
    id: 'k8s',
    name: 'K8s',
    desc: 'Pod、Service、调度与集群运维…',
    iconSrc: '/images/k8s.png',
  },
  {
    id: 'git',
    name: 'Git',
    desc: '分支、合并、rebase 与协作流程…',
    iconSrc: '/images/git.png',
  },
];

function getBaguBank(bankId) {
  if (!bankId) return null;
  const builtin = BAGU_QUESTION_BANKS.find((b) => b.id === bankId);
  if (builtin) return { ...builtin, builtin: true };
  if (typeof Store !== 'undefined' && typeof Store.getCustomBaguBank === 'function') {
    const custom = Store.getCustomBaguBank(bankId);
    if (custom) return { ...custom, custom: true };
  }
  return null;
}

/** 内置 + 用户自定义题库 */
function listBaguBanks() {
  const builtin = BAGU_QUESTION_BANKS.map((b) => ({ ...b, builtin: true }));
  const custom =
    typeof Store !== 'undefined' && typeof Store.getCustomBaguBanks === 'function'
      ? Store.getCustomBaguBanks().map((b) => ({ ...b, custom: true }))
      : [];
  return [...builtin, ...custom];
}

function baguBankSelectOptions() {
  return listBaguBanks().map((b) => ({ value: b.id, label: b.name }));
}

/** 年历视图模式：汇总 / 专项事项（非背景主题） */
const CALENDAR_THEMES = [
  { id: 'summary', name: '汇总', icon: '📋', desc: '查看全部事项' },
  { id: 'study', name: '学习', icon: '📚', desc: '查看每日学习时长' },
  { id: 'sleep', name: '睡眠', icon: '🌙', desc: '查看睡眠相关事项' },
  { id: 'wash', name: '洗头', icon: '🧴', desc: '查看洗头记录' },
];

function getCalendarThemeMeta(themeId) {
  return CALENDAR_THEMES.find((t) => t.id === themeId) || CALENDAR_THEMES[0];
}

const DEPARTMENTS = [
  {
    id: 'core',
    order: '01',
    name: '找工作',
    desc: '尽快找到工作',
    layout: 'pages',
    color: '#388BFF',
    bg: '#F5F5F5',
    modules: [
      {
        id: 'bagu',
        name: '八股',
        icon: '📖',
        desc: '基础知识与面试题背诵',
        recordView: 'bagu',
        editable: true,
        fields: [
          { key: 'title', label: '题目', type: 'text', placeholder: '如 MVCC 是什么', required: true },
          {
            key: 'bank',
            label: '题库',
            type: 'select',
            options: BAGU_QUESTION_BANKS.map((b) => ({ value: b.id, label: b.name })),
            required: true,
          },
          { key: 'category', label: '分类', type: 'bagu-category' },
          {
            key: 'difficulty',
            label: '难度',
            type: 'select',
            options: ['简单', '中等', '困难'],
            default: '中等',
          },
          { key: 'tags', label: '标签', type: 'text', placeholder: '多个标签用逗号分隔，如 索引,InnoDB' },
          { key: 'approach', label: '回答思路', type: 'richtext' },
          { key: 'answer', label: '参考答案', type: 'richtext' },
          { key: 'followUp', label: '可能追问', type: 'richtext' },
        ],
      },
      {
        id: 'handwrite',
        name: '算法',
        icon: '💻',
        iconSrc: '/images/leetcode-heart.png',
        desc: '算法题与 coding 练习',
        recordView: 'leetcode',
        editable: true,
        fields: [
          { key: 'lcNumber', label: '力扣题号', type: 'number', placeholder: '如 1、15、42', min: 1 },
          { key: 'title', label: '题名', type: 'text', placeholder: '两数之和', required: true },
          {
            key: 'difficulty',
            label: '难度',
            type: 'select',
            options: ['简单', '中等', '困难'],
            default: '中等',
          },
          {
            key: 'dataStructure',
            label: '数据结构',
            type: 'select',
            options: ['数组', '哈希', '链表', '二叉树', '图', '栈', '队列', '堆', '字符串', '其他'],
            default: '数组',
          },
          {
            key: 'method',
            label: '方法',
            type: 'select',
            options: ['哈希', '双指针', '链表', '滑动窗口', '二分', 'DFS', 'BFS', '动态规划', '贪心', '回溯', '排序', '其他'],
            default: '哈希',
          },
          { key: 'hot100', label: 'Hot 100', type: 'checkbox' },
          { key: 'codetopFreq', label: 'CodeTop 频次', type: 'number', min: 0, step: 1, placeholder: '如 12' },
          { key: 'note', label: '思路/复盘', type: 'textarea' },
        ],
      },
      {
        id: 'project',
        name: '项目',
        icon: '🛠',
        desc: '项目经历、时间线与相关面试题',
        recordView: 'project',
        editable: true,
        fields: [
          { key: 'name', label: '项目名称', type: 'text', placeholder: '如 蔚来车主智能出行助手 Agent', required: true },
          { key: 'role', label: '项目角色', type: 'text', placeholder: '如 Agent 开发实习生' },
          { key: 'startDate', label: '开始时间', type: 'month' },
          { key: 'endDate', label: '结束时间', type: 'month' },
          { key: 'ongoing', label: '至今', type: 'checkbox', default: false },
          { key: 'description', label: '项目描述', type: 'richtext' },
          { key: 'timeline', label: '时间线梳理', type: 'richtext' },
          { key: 'relatedBaguIds', label: '相关面试题', type: 'bagu-links' },
        ],
      },
      {
        id: 'resume',
        name: '简历',
        icon: '📄',
        desc: '撰写、修改与定稿',
        fields: [
          { key: 'action', label: '类型', type: 'select', options: ['修改', '定稿', '复盘'], default: '修改' },
          { key: 'version', label: '版本', type: 'text', placeholder: 'v2 / 投递版' },
          { key: 'note', label: '备注', type: 'textarea' },
        ],
      },
      {
        id: 'apply',
        name: '投递',
        icon: '📮',
        desc: '岗位投递与进度',
        fields: [
          { key: 'company', label: '公司', type: 'text', required: true },
          { key: 'role', label: '岗位', type: 'text' },
          { key: 'channel', label: '渠道', type: 'select', options: ['Boss', '内推', '官网', '其他'], default: 'Boss' },
          { key: 'status', label: '状态', type: 'select', options: ['已投', '待回复', '笔试', '拒绝', 'offer'], default: '已投' },
          { key: 'note', label: '备注', type: 'textarea' },
        ],
      },
      {
        id: 'interview',
        name: '面试',
        icon: '🎤',
        desc: '面试安排与复盘',
        recordView: 'interview',
        editable: true,
        dateLabel: '面试日期',
        dateMode: 'datetimeRange',
        expandableRecords: true,
        fields: [
          { key: 'company', label: '公司', type: 'text', required: true },
          { key: 'role', label: '应聘岗位', type: 'text', placeholder: '如 AI 应用工程师' },
          { key: 'requirements', label: '岗位要求', type: 'textarea', placeholder: 'JD 要点、技能要求…' },
          { key: 'round', label: '轮次', type: 'select', options: ['一面', '二面', 'HR面', '终面'], default: '一面' },
          { key: 'result', label: '结果', type: 'select', options: ['待面', '通过', '挂', 'offer'], default: '待面' },
          { key: 'note', label: '复盘', type: 'textarea', placeholder: '题目、表现、可改进点…' },
        ],
      },
    ],
  },
  {
    id: 'living',
    order: '02',
    name: '生活',
    desc: '作息 · 健康 · 学习 · 仪容',
    layout: 'accordion',
    color: '#388BFF',
    bg: '#F5F5F5',
    sections: [
      { id: 'routine', name: '作息', icon: '🌅', moduleIds: ['health', 'sleep'] },
      { id: 'fitness', name: '健康', icon: '💪', moduleIds: ['exercise', 'weight'] },
      { id: 'study', name: '学习', icon: '📚', moduleIds: ['study'] },
      { id: 'beauty', name: '仪容', icon: '✨', moduleIds: ['facemask', 'hairmask', 'hairremoval'] },
    ],
    modules: [
      {
        id: 'health',
        name: '早晨启动',
        icon: '🌅',
        desc: '每日晨间习惯清单',
        sectionId: 'routine',
        recordView: 'habitChecklist',
        habitChecklist: ['梳头', '刷牙', '洗脸', '护肤', '喝一杯温水'],
      },
      {
        id: 'sleep',
        name: '睡眠',
        icon: '🌙',
        desc: '小憩与长睡眠',
        sectionId: 'routine',
        editable: true,
        recordMenu: true,
        fields: [
          { key: 'bedtime', label: '入睡', type: 'time', required: true },
          { key: 'wakeup', label: '起床', type: 'time', required: true },
          { key: 'hours', label: '时长', type: 'text', readonly: true },
          { key: 'quality', label: '睡眠质量得分', type: 'number', min: 0, max: 100, step: 1, readonly: true },
          { key: 'note', label: '备注', type: 'textarea' },
        ],
      },
      {
        id: 'study',
        name: '学习',
        icon: '📚',
        desc: '每日学习时长',
        sectionId: 'study',
        editable: true,
        recordMenu: true,
        fields: [
          { key: 'hours', label: '小时', type: 'number', min: 0, max: 24, step: 1, required: true },
          { key: 'minutes', label: '分钟', type: 'number', min: 0, max: 59, step: 1 },
          { key: 'note', label: '备注', type: 'textarea', placeholder: '学了什么…' },
        ],
      },
      {
        id: 'exercise',
        name: '运动',
        icon: '🏃',
        desc: '类型与时长',
        sectionId: 'fitness',
        fields: [
          { key: 'type', label: '类型', type: 'text', placeholder: '跑步/瑜伽/力量...' },
          { key: 'duration', label: '时长(分钟)', type: 'number' },
          { key: 'feeling', label: '感受', type: 'textarea' },
        ],
      },
      {
        id: 'weight',
        name: '体重',
        icon: '⚖️',
        desc: '体重趋势',
        sectionId: 'fitness',
        fields: [
          { key: 'weight', label: '体重(kg)', type: 'number', step: 0.1, required: true },
          { key: 'note', label: '备注', type: 'textarea' },
        ],
      },
      {
        id: 'facemask',
        name: '面膜',
        icon: '🧖',
        desc: '护肤打卡',
        sectionId: 'beauty',
        moduleKind: 'customCheckin',
        recordView: 'customCheckin',
        checkinFreq: 'weekly',
        editable: true,
      },
      {
        id: 'hairmask',
        name: '发膜',
        icon: '💇',
        desc: '护发打卡',
        sectionId: 'beauty',
        moduleKind: 'customCheckin',
        recordView: 'customCheckin',
        checkinFreq: 'weekly',
        editable: true,
      },
      {
        id: 'hairremoval',
        name: '脱毛',
        icon: '✨',
        desc: '仪容打卡',
        sectionId: 'beauty',
        moduleKind: 'customCheckin',
        recordView: 'customCheckin',
        checkinFreq: 'weekly',
        editable: true,
      },
    ],
  },
  {
    id: 'sidebiz',
    order: '03',
    name: '副业（🚧 施工中）',
    desc: '第二增长曲线',
    layout: 'accordion',
    color: '#388BFF',
    bg: '#F5F5F5',
    modules: [
      {
        id: 'xiaohongshu',
        name: '小红书',
        icon: '📕',
        desc: '选题与发布',
        fields: [
          { key: 'type', label: '类型', type: 'select', options: ['选题', '发布', '数据复盘'], default: '发布' },
          { key: 'title', label: '标题/选题', type: 'text', required: true },
          { key: 'reads', label: '阅读', type: 'number' },
          { key: 'likes', label: '点赞', type: 'number' },
          { key: 'fans', label: '涨粉', type: 'number' },
          { key: 'note', label: '复盘', type: 'textarea' },
        ],
      },
      {
        id: 'novel',
        name: '写小说',
        icon: '✍️',
        desc: '创作与连载',
        fields: [
          { key: 'type', label: '类型', type: 'select', options: ['大纲', '正文', '修改', '发布'], default: '正文' },
          { key: 'title', label: '作品/章节', type: 'text', required: true },
          { key: 'words', label: '字数', type: 'number' },
          { key: 'platform', label: '平台', type: 'text', placeholder: '起点/番茄/晋江...' },
          { key: 'note', label: '备注', type: 'textarea' },
        ],
      },
    ],
  },
  {
    id: 'experience',
    order: '04',
    name: '休息（🚧 施工中）',
    desc: '休息充电',
    layout: 'accordion',
    color: '#388BFF',
    bg: '#F5F5F5',
    modules: [
      {
        id: 'travel',
        name: '外出游玩',
        icon: '🎒',
        desc: '出行与游记',
        fields: [
          { key: 'place', label: '地点', type: 'text', required: true },
          { key: 'budget', label: '预算(元)', type: 'number' },
          { key: 'status', label: '状态', type: 'select', options: ['计划', '完成'], default: '计划' },
          { key: 'note', label: '感受/游记', type: 'textarea' },
        ],
      },
    ],
  },
];

function getDeptBase(deptId) {
  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  if (!dept) return null;
  if (typeof Store !== 'undefined') {
    const meta = Store.getDeptMeta(deptId);
    return { ...dept, ...meta };
  }
  return { ...dept };
}

function getDepartmentDefaults(deptId) {
  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  return dept ? { order: dept.order, name: dept.name, desc: dept.desc } : null;
}

function getModule(deptId, moduleId) {
  const dept = getDeptBase(deptId);
  if (!dept) return null;
  let mod = dept.modules.find((m) => m.id === moduleId);
  if (!mod && deptId === 'living' && typeof Store !== 'undefined') {
    mod = Store.getCustomLivingModule?.(moduleId) || null;
  }
  if (!mod) return null;
  const base = { ...mod, deptId, deptName: dept.name, deptColor: dept.color, deptBg: dept.bg };
  if (typeof Store !== 'undefined') {
    const meta = Store.getModuleMeta(deptId, moduleId);
    return { ...base, ...meta };
  }
  return base;
}

function getModuleDefaults(deptId, moduleId) {
  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  let mod = dept?.modules.find((m) => m.id === moduleId);
  if (!mod && deptId === 'living' && typeof Store !== 'undefined') {
    mod = Store.getCustomLivingModule?.(moduleId) || null;
  }
  if (!mod) return null;
  const base = { name: mod.name, icon: mod.icon, desc: mod.desc };
  if (mod.moduleKind === 'customCheckin' || mod.recordView === 'customCheckin') {
    return {
      ...base,
      checkinFreq: mod.checkinFreq || 'weekly',
      checkinDays: Array.isArray(mod.checkinDays) ? [...mod.checkinDays] : [...WEEKDAY_LABELS],
      custom: Boolean(mod.custom),
    };
  }
  return base;
}

function getDepartment(deptId) {
  const dept = getDeptBase(deptId);
  if (!dept) return null;
  const hidden =
    deptId === 'living' && typeof Store !== 'undefined' && Store.isLivingModuleHidden
      ? (id) => Store.isLivingModuleHidden(id)
      : () => false;
  const builtin = dept.modules
    .filter((m) => !hidden(m.id))
    .map((m) => getModule(deptId, m.id));
  const custom =
    deptId === 'living' && typeof Store !== 'undefined' && Store.getCustomLivingModules
      ? Store.getCustomLivingModules().map((m) => getModule(deptId, m.id)).filter(Boolean)
      : [];
  const modules = [...builtin, ...custom];
  const sections = Array.isArray(dept.sections)
    ? dept.sections.map((s) => {
        const builtinIds = (s.moduleIds || []).filter((id) => !hidden(id));
        const extraIds = custom.filter((m) => m.sectionId === s.id).map((m) => m.id);
        return {
          ...s,
          moduleIds: [...builtinIds, ...extraIds],
        };
      })
    : undefined;
  return {
    ...dept,
    modules,
    sections,
  };
}

function getDeptSection(deptId, sectionId) {
  const dept = getDepartment(deptId);
  if (!dept?.sections?.length || !sectionId) return null;
  return dept.sections.find((s) => s.id === sectionId) || null;
}

function getSectionModules(deptId, sectionId) {
  const dept = getDepartment(deptId);
  const section = getDeptSection(deptId, sectionId);
  if (!dept || !section) return dept?.modules || [];
  const idSet = new Set(section.moduleIds || []);
  return dept.modules.filter((m) => idSet.has(m.id));
}

function getAllModules() {
  return DEPARTMENTS.flatMap((d) =>
    d.modules
      .filter((m) => !(d.id === 'living' && typeof Store !== 'undefined' && Store.isLivingModuleHidden?.(m.id)))
      .map((m) => getModule(d.id, m.id))
  );
}
