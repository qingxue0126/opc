/**
 * 八股面试题：自动分类 + 难度/学习梯度评估
 * 优先 LLM，无 Key 时用关键词规则降级
 */

const DIFFICULTIES = ['简单', '中等', '困难'];
const FREQUENCIES = ['高频', '中频', '低频'];

/** 面试出现频率启发式（无 LLM 时降级） */
const FREQUENCY_KEYWORDS = {
  高频: [
    'mvcc', '事务', '隔离级别', '索引', 'b\\+?树', '锁', '死锁', 'innodb',
    '进程', '线程', '协程', 'tcp', 'http', 'https', '三次握手', '四次挥手',
    '哈希', 'hashmap', '多态', '继承', '封装', 'gc', '垃圾回收', 'gil',
    'redis', '缓存穿透', '缓存雪崩', 'jvm', '类加载', 'volatile', 'synchronized',
    '乐观锁', '悲观锁', 'acid', '主键', '外键', 'join',
    '什么是', '是什么', '区别', '有哪些',
  ],
  中频: [
    'binlog', 'redo', 'undo', '两阶段', '覆盖索引', '索引下推', '间隙锁',
    'epoll', 'select', 'poll', '零拷贝', 'nio', '异步', 'asyncio', '装饰器',
    '生成器', '描述符', '元类', '反射', '代理', 'aop', 'ioc', 'spring',
    'kafka', 'mq', '消息队列', '分库分表', '一致性哈希', 'raft', 'paxos',
  ],
  低频: [
    '页分裂', 'row_id', 'memory引擎', 'myisam', 'relay log', 'crash recovery',
    'mro', 'metaclass', '字节码', '解释器', 'jit', '逃逸分析', '卡表',
    'numa', '伪共享', 'cache line', '内存屏障实现细节',
  ],
};

const BANK_CATEGORY_RULES = {
  mysql: {
    categories: ['存储引擎', '索引', '事务与 MVCC', '锁', '日志', 'SQL 优化'],
    rules: [
      {
        category: '存储引擎',
        learnBase: 10,
        keywords: ['存储引擎', 'innodb', 'myisam', 'memory', '行格式', '表空间', '聚簇索引页', 'row_id', '页分裂'],
      },
      {
        category: '索引',
        learnBase: 20,
        keywords: [
          '索引', 'b\\+?树', 'b树', '哈希索引', '覆盖索引', '最左前缀', '回表', '索引下推',
          '联合索引', '主键', '外键', '唯一索引', '索引失效', 'explain',
        ],
      },
      {
        category: '事务与 MVCC',
        learnBase: 35,
        keywords: [
          '事务', 'acid', '隔离级别', 'mvcc', '脏读', '幻读', '不可重复读',
          'read view', 'readview', 'undo', '当前读', '快照读', '一致性视图',
        ],
      },
      {
        category: '锁',
        learnBase: 50,
        keywords: [
          '锁', '行锁', '表锁', '间隙锁', '临键锁', 'next-key', '死锁',
          'for update', '共享锁', '排他锁', '意向锁', '乐观锁', '悲观锁',
        ],
      },
      {
        category: '日志',
        learnBase: 65,
        keywords: [
          'binlog', 'redo', 'undo log', '两阶段提交', 'crash', 'wal',
          'relay log', 'redolog', '二进制日志', '崩溃恢复',
        ],
      },
      {
        category: 'SQL 优化',
        learnBase: 75,
        keywords: [
          '慢查询', 'sql优化', '执行计划', 'join', '子查询', '深分页',
          'count\\(', 'order by', 'group by', '调优', 'processlist', '性能',
        ],
      },
    ],
  },
  python: {
    categories: ['基础语法', '数据结构', '面向对象', '并发与异步', '内存与 GC', '工程与常用库'],
    rules: [
      {
        category: '基础语法',
        learnBase: 10,
        keywords: [
          '语法', '变量', '作用域', 'legb', '闭包', '装饰器', '生成器表达式',
          'lambda', '推导式', '解包', '\\*args', 'kwargs', 'with', '上下文管理',
          '异常', 'try', 'raise', 'assert', 'is 和 ==', '深拷贝', '浅拷贝',
          '可变', '不可变', '传参', '默认参数',
        ],
      },
      {
        category: '数据结构',
        learnBase: 22,
        keywords: [
          'list', '列表', 'tuple', '元组', 'dict', '字典', 'set', '集合',
          '字符串', 'str', 'bytes', 'bytearray', '堆', 'heapq', 'deque',
          'collections', 'ordereddict', 'defaultdict', 'counter', 'namedtuple',
          '切片', '排序', 'sorted', '哈希', '可哈希',
        ],
      },
      {
        category: '面向对象',
        learnBase: 35,
        keywords: [
          '面向对象', '类', '实例', '继承', '多态', '封装', 'mro', 'super',
          '魔法方法', '魔术方法', '__init__', '__new__', '__call__',
          'property', '描述符', '元类', 'metaclass', '抽象类', 'abc',
          '静态方法', '类方法', 'classmethod', 'staticmethod', '单例',
        ],
      },
      {
        category: '并发与异步',
        learnBase: 50,
        keywords: [
          'gil', '线程', 'threading', '进程', 'multiprocessing', '协程',
          'asyncio', 'async', 'await', '并发', '并行', '锁', '死锁',
          '队列', 'queue', '线程池', '进程池', 'concurrent', 'future',
          'io密集', 'cpu密集', '多线程', '多进程',
        ],
      },
      {
        category: '内存与 GC',
        learnBase: 62,
        keywords: [
          '内存', '垃圾回收', 'gc', '引用计数', '标记清除', '分代回收',
          '循环引用', '弱引用', 'weakref', '对象模型', 'pyobject',
          '内存泄漏', '内存管理', 'intern', '小整数池', '拷贝',
        ],
      },
      {
        category: '工程与常用库',
        learnBase: 75,
        keywords: [
          'pip', 'venv', 'virtualenv', 'poetry', 'conda', '包管理',
          'logging', '日志', 'pathlib', 'os', 'sys', 'typing', '类型注解',
          'requests', 'httpx', 'fastapi', 'flask', 'django', 'pytest',
          '单元测试', '打包', 'wheel', '模块导入', 'import', '__name__',
          '性能', 'profile', 'cprofile', '缓存', 'lru_cache',
        ],
      },
    ],
  },
};

const DIFFICULTY_KEYWORDS = {
  简单: ['是什么', '有哪些', '区别', '介绍', '基本', '概念', '定义', '常见'],
  困难: [
    '原理', '实现', '底层', '源码', '深入', '如何设计', '怎么保证', '分布式',
    '高并发', '崩溃恢复', '两阶段', '死锁检测', '幻读如何解决',
  ],
  中等: ['为什么', '怎么', '如何', '场景', '优缺点', '流程', '机制'],
};

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function matchScore(text, keywords) {
  let score = 0;
  const hits = [];
  for (const kw of keywords) {
    const re = new RegExp(kw, 'i');
    if (re.test(text)) {
      score += 1;
      hits.push(kw);
    }
  }
  return { score, hits };
}

function difficultyRank(d) {
  const idx = DIFFICULTIES.indexOf(d);
  return idx === -1 ? 1 : idx;
}

function estimateDifficulty(title) {
  const t = normalizeText(title);
  const hard = matchScore(t, DIFFICULTY_KEYWORDS['困难']);
  const easy = matchScore(t, DIFFICULTY_KEYWORDS['简单']);
  const mid = matchScore(t, DIFFICULTY_KEYWORDS['中等']);
  if (hard.score >= easy.score && hard.score >= mid.score && hard.score > 0) return '困难';
  if (easy.score > mid.score && easy.score > 0) return '简单';
  if (mid.score > 0) return '中等';
  if (/原理|实现|底层/.test(t)) return '困难';
  if (/是什么|有哪些|区别/.test(t)) return '简单';
  return '中等';
}

function estimateFrequency(title) {
  const t = normalizeText(title);
  const high = matchScore(t, FREQUENCY_KEYWORDS['高频']);
  const mid = matchScore(t, FREQUENCY_KEYWORDS['中频']);
  const low = matchScore(t, FREQUENCY_KEYWORDS['低频']);
  if (low.score > high.score && low.score >= mid.score && low.score > 0) return '低频';
  if (high.score >= mid.score && high.score > 0) return '高频';
  if (mid.score > 0) return '中频';
  if (/原理|底层|实现细节|源码/.test(t)) return '中频';
  if (/是什么|有哪些|区别|对比/.test(t)) return '高频';
  return '中频';
}

function estimateLearnOrder(category, difficulty, ruleLearnBase = 50) {
  const diffBoost = difficultyRank(difficulty) * 8;
  return Math.max(1, Math.min(99, Math.round(ruleLearnBase + diffBoost)));
}

function suggestTags(title, category, hits) {
  const tags = new Set();
  const t = normalizeText(title);
  const extras = [
    // MySQL
    ['innodb', 'InnoDB'],
    ['myisam', 'MyISAM'],
    ['mvcc', 'MVCC'],
    ['binlog', 'binlog'],
    ['redo', 'redo'],
    ['b\\+?树', 'B+树'],
    ['死锁', '死锁'],
    ['隔离', '隔离级别'],
    ['索引', '索引'],
    // Python
    ['gil', 'GIL'],
    ['装饰器', '装饰器'],
    ['生成器', '生成器'],
    ['迭代器', '迭代器'],
    ['asyncio', 'asyncio'],
    ['async', '异步'],
    ['threading', '多线程'],
    ['multiprocessing', '多进程'],
    ['垃圾回收|\\bgc\\b', 'GC'],
    ['引用计数', '引用计数'],
    ['元类|metaclass', '元类'],
    ['描述符', '描述符'],
    ['mro', 'MRO'],
    ['深拷贝|浅拷贝', '拷贝'],
    ['list|列表', 'list'],
    ['dict|字典', 'dict'],
    ['闭包', '闭包'],
    ['类型注解|typing', 'typing'],
  ];
  extras.forEach(([pat, label]) => {
    if (new RegExp(pat, 'i').test(t)) tags.add(label);
  });
  // 标签是三级小模块：不要重复二级分类名
  if (category) tags.delete(category);
  return [...tags].slice(0, 3).join(',');
}

function suggestKeypoints(title, category, tags, hits) {
  const points = new Set();
  const t = normalizeText(title);
  const tagSet = new Set(
    String(tags || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const extras = [
    ['回表', '回表'],
    ['覆盖索引', '覆盖索引'],
    ['最左前缀', '最左前缀'],
    ['索引下推', '索引下推'],
    ['间隙锁|临键|next-key', '间隙锁'],
    ['当前读|快照读', '当前读与快照读'],
    ['read view|readview', 'ReadView'],
    ['两阶段提交|2pc', '两阶段提交'],
    ['脏读|幻读|不可重复读', '三类读异常'],
    ['三次握手', '三次握手'],
    ['四次挥手', '四次挥手'],
    ['零拷贝', '零拷贝'],
    ['epoll', 'epoll'],
    ['缓存穿透|雪崩|击穿', '缓存三大问题'],
    ['乐观锁|悲观锁', '乐观锁与悲观锁'],
    ['是什么', '概念定义'],
    ['区别|对比', '对比与选型'],
    ['原理|实现', '原理机制'],
    ['为什么', '原因分析'],
  ];
  extras.forEach(([pat, label]) => {
    if (new RegExp(pat, 'i').test(t)) points.add(label);
  });
  (hits || []).slice(0, 4).forEach((h) => {
    const label = String(h || '').trim();
    if (!label || label.length > 12 || /[\\()+?]/.test(label)) return;
    if (label === category || tagSet.has(label)) return;
    points.add(label);
  });
  // 考点不与分类、标签重复
  if (category) points.delete(category);
  const lowerTags = new Set([...tagSet].map((s) => s.toLowerCase()));
  if (category) lowerTags.add(String(category).toLowerCase());
  return [...points]
    .filter((p) => !lowerTags.has(String(p).toLowerCase()))
    .slice(0, 6)
    .join(',');
}

function classifyByRules(title, bankId, categories = []) {
  const t = normalizeText(title);
  if (!t) {
    return {
      category: categories[0] || '未分类',
      difficulty: '中等',
      frequency: '中频',
      learnOrder: 50,
      tags: '',
      keypoints: '',
      source: 'rules',
    };
  }

  const bankRules = BANK_CATEGORY_RULES[bankId];
  let best = { category: '', score: 0, hits: [], learnBase: 50 };

  if (bankRules) {
    for (const rule of bankRules.rules) {
      if (categories.length && !categories.includes(rule.category)) continue;
      const { score, hits } = matchScore(t, rule.keywords);
      if (score > best.score) {
        best = { category: rule.category, score, hits, learnBase: rule.learnBase };
      }
    }
  }

  if (!best.category && categories.length) {
    for (const cat of categories) {
      const { score, hits } = matchScore(t, [cat, ...String(cat).split(/[与\/、]/)]);
      if (score > best.score) best = { category: cat, score, hits, learnBase: 50 };
    }
  }

  const category = best.category || categories[0] || '未分类';
  const difficulty = estimateDifficulty(title);
  const frequency = estimateFrequency(title);
  const learnOrder = estimateLearnOrder(category, difficulty, best.learnBase);
  const tags = suggestTags(title, category, best.hits);
  const keypoints = suggestKeypoints(title, category, tags, best.hits);

  return {
    category,
    difficulty,
    frequency,
    learnOrder,
    tags,
    keypoints,
    source: 'rules',
    confidence: best.score > 0 ? Math.min(0.95, 0.4 + best.score * 0.15) : 0.35,
  };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('LLM 未返回 JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildClassifyPrompt(title, bankName, categories) {
  const catHint = (categories || []).length
    ? `可选分类（优先从中选，若都不合适可自拟更贴切的短分类名）：${categories.join('、')}`
    : '分类：请自拟一个简短贴切的分类名（2-8 字，如「索引」「事务与锁」）';
  return `你是面试八股题库助手。请结合互联网大厂/校招面试题出现频率的常识与公开统计印象（如牛客、LeetCode Discuss、面经聚合中的常考程度），为题目评估「面试频率」，并按四层标题体系标注，输出 JSON（不要其它文字）：
{
  "category": "分类名",
  "difficulty": "简单|中等|困难",
  "frequency": "高频|中频|低频",
  "learnOrder": 1到99的整数，数字越小越应先学（考虑该分类内的学习曲线：概念→机制→原理→实战），
  "tags": "逗号分隔，1-3个三级标签",
  "keypoints": "逗号分隔，若干四级考点"
}

四层标题（由粗到细）：
1. 题库：${bankName || '通用'}（一级，已给定）
2. 分类：二级单元，粒度偏粗，不要过细（如「索引」「事务与锁」）
3. 标签：三级小模块知识，每题 1-3 个
4. 考点：四级具体考点，可多个，比标签更细

${catHint}
题目：${title}

规则：
- 难度：概念辨析偏简单；机制/场景偏中等；底层原理/实现细节偏困难
- frequency：几乎每场必考/面经极多见→高频；常见但非必考→中频；偏门冷门→低频
- learnOrder：同分类内按学习梯度递增，例如「是什么」<「有哪些区别」<「为什么」<「原理/实现」
- tags / keypoints：不要互相重复，也不要重复分类名与题目全文`;
}

function buildSmartSortPrompt(bankName, categories, questions) {
  const list = questions
    .map((q, i) => `${i + 1}. id=${q.id} | ${q.title}`)
    .join('\n');
  return `你是面试学习路径规划助手。请结合互联网面试题出现频率的常识与公开统计印象，按四层标题为下列八股题安排分类、标签、考点、频率与学习顺序，输出 JSON：
{
  "items": [
    { "id": "...", "category": "...", "difficulty": "简单|中等|困难", "frequency": "高频|中频|低频", "learnOrder": 1-99, "tags": "a,b", "keypoints": "x,y,z" }
  ]
}

题库（一级）：${bankName}
可选分类（二级单元，勿过细）：${categories.join('、')}
四层：题库 > 分类 > 标签(每题1-3个小模块) > 考点(可多个、更细)
要求：
1. category 必须从可选分类中选
2. tags 1-3 个；keypoints 可多个；二者与分类不要重复
3. frequency：面经常见度（必考→高频，常见→中频，偏门→低频）
4. 同分类内 learnOrder 体现学习曲线（先易后难、先概念后原理）
5. 不同分类可用重叠数字，最终按分类分组后再按 learnOrder 排序

题目列表：
${list}`;
}

function normalizeClassifyResult(raw, fallback, categories) {
  const rawCat = String(raw?.category || '').trim();
  const list = Array.isArray(categories) ? categories : [];
  let category;
  if (rawCat) {
    // 优先用 LLM 给出的分类；若题库有预设且完全匹配则用预设写法
    const hit = list.find((c) => c === rawCat || c.toLowerCase() === rawCat.toLowerCase());
    category = hit || rawCat;
  } else {
    category = fallback.category || list[0] || '未分类';
  }

  let difficulty = DIFFICULTIES.includes(raw?.difficulty) ? raw.difficulty : fallback.difficulty;
  let frequency = FREQUENCIES.includes(raw?.frequency) ? raw.frequency : fallback.frequency || '中频';
  let learnOrder = Number(raw?.learnOrder);
  if (!Number.isFinite(learnOrder)) learnOrder = fallback.learnOrder;
  learnOrder = Math.max(1, Math.min(99, Math.round(learnOrder)));
  const tags = String(raw?.tags || fallback.tags || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(',');
  const tagSet = new Set(
    (tags ? tags.split(',') : []).map((s) => s.toLowerCase())
  );
  if (category) tagSet.add(String(category).toLowerCase());
  const keypoints = String(raw?.keypoints || fallback.keypoints || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s && !tagSet.has(s.toLowerCase()))
    .slice(0, 8)
    .join(',');
  return { category, difficulty, frequency, learnOrder, tags, keypoints };
}

async function classifyBaguQuestion({ title, bankId, bankName, categories }, { llmCall } = {}) {
  const safeCategories = Array.isArray(categories) && categories.length
    ? categories
    : BANK_CATEGORY_RULES[bankId]?.categories || [];
  const fallback = classifyByRules(title, bankId, safeCategories);

  if (!llmCall || !String(title || '').trim()) {
    return fallback;
  }

  try {
    const content = await llmCall(buildClassifyPrompt(title, bankName, safeCategories));
    const parsed = extractJsonObject(content);
    const normalized = normalizeClassifyResult(parsed, fallback, safeCategories);
    return { ...normalized, source: 'llm', confidence: 0.9 };
  } catch {
    return fallback;
  }
}

async function smartSortBaguQuestions({ bankId, bankName, categories, questions }, { llmCall } = {}) {
  const safeCategories = Array.isArray(categories) && categories.length
    ? categories
    : BANK_CATEGORY_RULES[bankId]?.categories || [];
  const list = Array.isArray(questions) ? questions : [];

  if (llmCall && list.length) {
    try {
      const content = await llmCall(buildSmartSortPrompt(bankName, safeCategories, list));
      const parsed = extractJsonObject(content);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const byId = new Map(items.map((it) => [String(it.id), it]));
      return list.map((q) => {
        const raw = byId.get(String(q.id)) || {};
        const fallback = classifyByRules(q.title, bankId, safeCategories);
        const normalized = normalizeClassifyResult(raw, fallback, safeCategories);
        return { id: q.id, ...normalized, source: 'llm' };
      });
    } catch {
      /* fall through to rules */
    }
  }

  return list.map((q) => {
    const result = classifyByRules(q.title, bankId, safeCategories);
    return { id: q.id, ...result };
  });
}

function buildFrequencyPrompt(bankName, questions) {
  const list = questions
    .map((q, i) => `${i + 1}. id=${q.id} | ${q.title}`)
    .join('\n');
  return `你是面试题频率分析助手。请根据互联网大厂/校招面经与题库聚合站点的常考程度印象，为下列八股题标注面试出现频率，只输出 JSON：
{
  "items": [
    { "id": "...", "frequency": "高频|中频|低频" }
  ]
}

题库：${bankName || '通用'}
规则：几乎每场必考/面经极多见→高频；常见但非必考→中频；偏门冷门→低频。

题目列表：
${list}`;
}

async function estimateBaguFrequencies({ bankName, questions }, { llmCall } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  if (!list.length) return [];

  if (llmCall) {
    try {
      const content = await llmCall(buildFrequencyPrompt(bankName, list));
      const parsed = extractJsonObject(content);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const byId = new Map(items.map((it) => [String(it.id), it]));
      return list.map((q) => {
        const raw = byId.get(String(q.id)) || {};
        const frequency = FREQUENCIES.includes(raw.frequency)
          ? raw.frequency
          : estimateFrequency(q.title);
        return { id: q.id, frequency, source: 'llm' };
      });
    } catch {
      /* fall through */
    }
  }

  return list.map((q) => ({
    id: q.id,
    frequency: estimateFrequency(q.title),
    source: 'rules',
  }));
}

function compareBaguLearnOrder(a, b) {
  const la = Number.isFinite(Number(a.learnOrder)) ? Number(a.learnOrder) : 50;
  const lb = Number.isFinite(Number(b.learnOrder)) ? Number(b.learnOrder) : 50;
  if (la !== lb) return la - lb;
  const da = difficultyRank(a.difficulty || '中等');
  const db = difficultyRank(b.difficulty || '中等');
  if (da !== db) return da - db;
  return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
}

module.exports = {
  DIFFICULTIES,
  FREQUENCIES,
  BANK_CATEGORY_RULES,
  classifyBaguQuestion,
  smartSortBaguQuestions,
  estimateBaguFrequencies,
  compareBaguLearnOrder,
  classifyByRules,
  difficultyRank,
  estimateFrequency,
};
