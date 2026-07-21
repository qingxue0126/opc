const LC_GRAPHQL = 'https://leetcode.cn/graphql';
const CODETOP_URL = 'https://codetop.cc/api/questions/';
const HOT100_URL = 'https://leetcode.cn/studyplan/top-100-liked/';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = {
  codetop: { at: 0, byId: null },
  hot100: { at: 0, ids: null },
};

const DS_PRIORITY = [
  ['array', '数组'],
  ['string', '字符串'],
  ['linked-list', '链表'],
  ['binary-tree', '二叉树'],
  ['tree', '二叉树'],
  ['graph', '图'],
  ['stack', '栈'],
  ['queue', '队列'],
  ['heap-priority-queue', '堆'],
  ['hash-table', '哈希'],
];

const METHOD_PRIORITY = [
  ['sliding-window', '滑动窗口'],
  ['two-pointers', '双指针'],
  ['linked-list', '链表'],
  ['binary-search', '二分'],
  ['hash-table', '哈希'],
  ['depth-first-search', 'DFS'],
  ['breadth-first-search', 'BFS'],
  ['dynamic-programming', '动态规划'],
  ['greedy', '贪心'],
  ['backtracking', '回溯'],
  ['sorting', '排序'],
];

async function lcGraphql(query, variables = {}, operationName) {
  const body = { query, variables };
  if (operationName) body.operationName = operationName;
  const res = await fetch(LC_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.cn',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors[0].message || 'LeetCode 查询失败');
  }
  return data.data;
}

async function searchByNumber(num) {
  const data = await lcGraphql(
    `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
        questions {
          frontendQuestionId
          title
          titleCn
          titleSlug
          difficulty
          topicTags { name slug nameTranslated }
        }
      }
    }`,
    { categorySlug: '', skip: 0, limit: 100, filters: { searchKeywords: num } },
    'problemsetQuestionList'
  );
  return data.problemsetQuestionList?.questions?.find((q) => q.frontendQuestionId === num) || null;
}

async function fetchQuestionDetail(titleSlug) {
  const data = await lcGraphql(
    `query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        translatedTitle
        difficulty
        topicTags { name slug translatedName }
        hints
      }
    }`,
    { titleSlug },
    'questionData'
  );
  return data.question || null;
}

async function getCodetopMap() {
  const now = Date.now();
  if (cache.codetop.byId && now - cache.codetop.at < CACHE_TTL_MS) {
    return cache.codetop.byId;
  }
  const res = await fetch(CODETOP_URL, {
    headers: { Referer: 'https://codetop.cc', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`CodeTop 请求失败 (${res.status})`);
  const payload = await res.json();
  const byId = new Map();
  for (const item of payload.list || []) {
    const id = item.leetcode?.frontend_question_id;
    if (id) byId.set(String(id), item);
  }
  cache.codetop = { at: now, byId };
  return byId;
}

async function getHot100Set() {
  const now = Date.now();
  if (cache.hot100.ids && now - cache.hot100.at < CACHE_TTL_MS) {
    return cache.hot100.ids;
  }
  const res = await fetch(HOT100_URL, {
    headers: { Referer: 'https://leetcode.cn', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Hot 100 页面请求失败 (${res.status})`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  const ids = m
    ? new Set([...m[1].matchAll(/"questionFrontendId":"(\d+)"/g)].map((x) => x[1]))
    : new Set();
  cache.hot100 = { at: now, ids };
  return ids;
}

function mapDifficulty(raw) {
  const d = String(raw || '').toLowerCase();
  if (d === 'easy') return '简单';
  if (d === 'hard') return '困难';
  return '中等';
}

function mapFromTags(tags, priority) {
  const slugs = new Set((tags || []).map((t) => t.slug));
  for (const [slug, label] of priority) {
    if (slugs.has(slug)) return label;
  }
  return null;
}

function mapDataStructure(tags) {
  return mapFromTags(tags, DS_PRIORITY) || '其他';
}

function mapMethod(tags) {
  return mapFromTags(tags, METHOD_PRIORITY) || '其他';
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackNote(title, dataStructure, method, hints) {
  const methodTips = {
    哈希: `用哈希表做 $O(n)$ 级别查找/计数，适合「${title}」这类需要快速判重或凑对的题。`,
    双指针: `维护两个指针同步移动，在有序或同向扫描的${dataStructure}上缩减搜索空间。`,
    链表: `运用哑节点、快慢指针或原地改链，在链表上完成遍历、反转或合并。`,
    滑动窗口: `用可变窗口在${dataStructure}上维护合法区间，边扩边收更新答案。`,
    二分: `利用单调性对答案或下标二分，快速定位满足条件的分界点。`,
    DFS: `深度优先递归/栈遍历，探索${dataStructure}上的所有可能路径或状态。`,
    BFS: `广度优先按层扩展，适合求最短步数或层次相关性质。`,
    动态规划: `定义状态与转移方程，把大问题拆成重叠子问题并复用结果。`,
    贪心: `每步做当前最优选择，证明局部最优能推出全局最优。`,
    回溯: `递归尝试所有选择，不满足条件时撤销并换分支。`,
    排序: `先排序再双指针/扫描，利用有序性简化判断。`,
  };
  if (methodTips[method]) return methodTips[method];
  if (hints?.length) {
    const hint = stripHtml(hints[hints.length - 1]);
    if (hint) return hint.length > 220 ? `${hint.slice(0, 217)}…` : hint;
  }
  return `考察${dataStructure}与${method}，可先写暴力再按标签优化。`;
}

async function generateBriefNote(title, dataStructure, method, hints, llmCall) {
  if (llmCall) {
    try {
      const content = await llmCall(
        `你是算法面试教练。题目「${title}」，主要数据结构：${dataStructure}，常见方法：${method}。` +
          '用中文写 2–3 句话简要说明解题思路（不要写代码、不要标题）。'
      );
      if (content) return content;
    } catch {
      /* fallback below */
    }
  }
  return buildFallbackNote(title, dataStructure, method, hints);
}

async function lookupLeetCodeQuestion(lcNumber, options = {}) {
  const num = String(parseInt(String(lcNumber).trim(), 10));
  if (!/^\d+$/.test(num) || Number(num) < 1) {
    throw new Error('请输入有效的力扣题号');
  }

  const [codetopMap, hot100Set] = await Promise.all([getCodetopMap(), getHot100Set()]);
  const codetopItem = codetopMap.get(num) || null;

  let listItem = await searchByNumber(num);
  let titleSlug = listItem?.titleSlug || codetopItem?.leetcode?.slug_title || null;

  if (!titleSlug) {
    throw new Error(`未找到题号 ${num}，请确认题号是否正确`);
  }

  const detail = await fetchQuestionDetail(titleSlug);
  if (!detail) throw new Error(`未找到题号 ${num} 的题目详情`);

  if (detail.questionFrontendId !== num) {
    throw new Error(`题号 ${num} 与题目「${detail.translatedTitle || detail.title}」不匹配，请核对题号`);
  }

  const tags = detail.topicTags || listItem?.topicTags || [];
  const title = detail.translatedTitle || listItem?.titleCn || listItem?.title || codetopItem?.leetcode?.title || '';
  const dataStructure = mapDataStructure(tags);
  const method = mapMethod(tags);
  const note = await generateBriefNote(title, dataStructure, method, detail.hints, options.llmCall);

  return {
    lcNumber: num,
    title,
    difficulty: mapDifficulty(detail.difficulty || listItem?.difficulty),
    dataStructure,
    method,
    hot100: hot100Set.has(num),
    codetopFreq: codetopItem?.value ?? null,
    note,
    titleSlug,
    source: {
      leetcode: true,
      codetop: Boolean(codetopItem),
      hot100: hot100Set.has(num),
    },
  };
}

module.exports = {
  lookupLeetCodeQuestion,
};
