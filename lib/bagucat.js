/**
 * 八股猫：题库对话助手
 * 根据用户自然语言，返回回复 + 可执行的题库编辑动作
 */

const {
  smartSortBaguQuestions: smartSort,
  estimateBaguFrequencies: estimateFreq,
  BANK_CATEGORY_RULES,
  FREQUENCIES,
} = require('./baguclassify');

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('LLM 未返回 JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** 从流式 JSON 缓冲中提取字符串字段（如 reply）的已生成部分 */
function extractJsonStringField(buf, field) {
  const src = String(buf || '');
  const key = `"${field}"`;
  const idx = src.indexOf(key);
  if (idx === -1) return { value: '', complete: false };
  let i = src.indexOf(':', idx + key.length);
  if (i === -1) return { value: '', complete: false };
  i += 1;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== '"') return { value: '', complete: false };
  i += 1;
  let value = '';
  let complete = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1];
      const map = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', '/': '/' };
      value += map[n] != null ? map[n] : n;
      i += 2;
      continue;
    }
    if (c === '"') {
      complete = true;
      break;
    }
    value += c;
    i += 1;
  }
  return { value, complete };
}

async function emitReplyText(reply, { onReplyDelta, fakeStream } = {}) {
  const text = String(reply || '');
  if (!text || typeof onReplyDelta !== 'function') return text;
  if (typeof fakeStream === 'function') {
    let acc = '';
    await fakeStream(text, (ch) => {
      acc += ch;
      onReplyDelta(ch, acc);
    });
  } else {
    onReplyDelta(text, text);
  }
  return text;
}

function textToHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasBankDesc(bank) {
  const d = String(bank?.desc || '')
    .trim()
    .replace(/^暂无介绍$/, '');
  return Boolean(d);
}

function defaultBankDesc(bank) {
  const name = bank?.name || '本库';
  return `${name}面试常考点梳理：覆盖核心概念、常见对比题与原理追问，便于系统复习与口述练习。`;
}

function buildQuestionDigest(questions) {
  return (questions || [])
    .map((q, i) => {
      const flags = [
        q.category ? `分类=${q.category}` : '未分类',
        q.difficulty ? `难度=${q.difficulty}` : '',
        q.frequency ? `频率=${q.frequency}` : '无频率',
        q.tags ? `标签=${q.tags}` : '无标签',
        q.keypoints ? `考点=${q.keypoints}` : '无考点',
        q.hasApproach ? '有思路' : '无思路',
        q.hasAnswer ? '有答案' : '无答案',
        q.hasFollowUp ? '有追问' : '无追问',
      ]
        .filter(Boolean)
        .join(' · ');
      return `${i + 1}. id=${q.id} | 标题=${q.title} | ${flags}`;
    })
    .join('\n');
}

function bankCatalogText(banks) {
  return (banks || [])
    .map((b) => `- id=${b.id} | 名称=${b.name} | 介绍=${hasBankDesc(b) ? b.desc : '（无）'}`)
    .join('\n');
}

function resolveTargetBank(message, currentBank, allBanks) {
  const list = Array.isArray(allBanks) && allBanks.length ? allBanks : currentBank?.id ? [currentBank] : [];
  const text = String(message || '');
  let best = null;
  let bestScore = 0;
  for (const b of list) {
    const name = String(b.name || '').trim();
    if (!name) continue;
    const aliases = [name, `${name}题库`, name.replace(/题库$/, '')].filter(Boolean);
    for (const alias of aliases) {
      if (!alias) continue;
      if (text.includes(alias)) {
        const score = alias.length;
        if (score > bestScore) {
          best = b;
          bestScore = score;
        }
      }
    }
  }
  if (best) return best;
  if (/当前题库|这个题库|本库|该题库/.test(text) && currentBank?.id) return currentBank;
  // 没点名其它库时，默认当前会话题库
  if (currentBank?.id && !/题库/.test(text)) return currentBank;
  if (currentBank?.id && /介绍|简介|描述|说明/.test(text) && !best) return currentBank;
  return best || currentBank || null;
}

/**
 * 语义意图：优先覆盖常见说法，避免换一种问法就不识别
 */
function matchLocalIntent(message, pending) {
  const t = String(message || '').trim();
  if (!t) return 'chat';

  if (pending?.type === 'confirm_desc') {
    if (/覆盖|重写|替换|直接写|全部换掉|不要旧的/.test(t)) return 'desc_overwrite';
    if (/优化|润色|完善|改进|改写|在原有|基于现有/.test(t)) return 'desc_optimize';
    if (/取消|算了|不改|不用了/.test(t)) return 'desc_cancel';
    // 短回复也可能是确认意图，交给确认流程再问一次
    if (t.length <= 12) return 'desc_confirm_unclear';
  }

  if (
    /(介绍|简介|描述|说明|导语|概述)/.test(t) &&
    /(写|加|添|补|改|更新|生成|弄|做|填|完善|优化|覆盖)/.test(t)
  ) {
    return 'bank_desc';
  }
  if (/给.+题库.+(介绍|简介|描述)|题库.+(介绍|简介|描述)|来段介绍|写个介绍|补个介绍/.test(t)) {
    return 'bank_desc';
  }

  if (/生成.*(答案|回答|思路|追问)|写.*(答案|回答|思路|追问)|补.*(答案|回答|思路|追问)/.test(t)) {
    return 'generate';
  }
  if (
    /排序|整理题库|学习顺序|智能排|自动分类|全部.*(分类|难度|标签|频率|考点)|所有.*(分类|难度|标签|频率|考点)|给.*题目.*(分类|难度|标签|频率|考点)|设置.*(分类|难度|标签)/.test(
      t
    )
  ) {
    return 'smart_sort';
  }
  if (/频率|常考|高频|中频|低频|出现次数|考频/.test(t) && /(统计|评估|识别|标注|设置|填写|补|估|搜|分析|标)/.test(t)) {
    return 'estimate_frequency';
  }
  if (/改.*(分类|难度|标签|标题|频率|考点)|修改.*(分类|难度|标签|标题|频率|考点)|把.*改成|设为|设置为/.test(t)) {
    return 'meta';
  }
  if (/合并.*(分类|组)|把.+分类.*(合并|合成)|分类合并|合成.*(分类|一组)/.test(t)) {
    return 'merge_categories';
  }
  if (/拆分.*(分类|组)|切分.*(分类|组)|把.+分类.*(拆|分)|分类拆分|分类切分/.test(t)) {
    return 'split_category';
  }
  if (/重命名分类|改分类名|分类改名|把分类.+改成|分类.*(改成|换成)/.test(t)) {
    return 'rename_category';
  }
  if (/你会|能做|干什么|帮助|功能|支持什么/.test(t)) return 'help';
  return 'chat';
}

function buildCatSystemPrompt(bank, questions, allBanks) {
  const categories =
    (bank.categories && bank.categories.length
      ? bank.categories
      : BANK_CATEGORY_RULES[bank.id]?.categories) || [];
  const digest = buildQuestionDigest(questions);
  const allIds = (questions || []).map((q) => q.id).join(',');

  return `你是「八股猫」，专门帮用户整理和管理八股题库。语气可爱、简洁，偶尔用「喵～」。

你要做语义理解：用户换一种说法表达同一意图时，仍要正确识别，不要死抠关键词。
请结合对话历史记忆用户偏好与已做过的题库改动，不要装失忆；若用户说「刚才那个」「继续」「还是按上次」，要能接上前文。

当前会话题库：${bank.name || bank.id}
当前题库介绍：${hasBankDesc(bank) ? bank.desc : '（无介绍）'}
可选分类：${categories.join('、') || '（可自拟合理分类名）'}
全部题目 id（可用 "all" 表示全部）：${allIds || '（暂无）'}
题目列表：
${digest || '（暂无题目）'}

全部题库目录（用户可能点名其它题库）：
${bankCatalogText(allBanks) || '（仅当前题库）'}

你必须只返回一个 JSON 对象（不要其它文字）：
{
  "reply": "给用户看的话，不能为空",
  "actions": [ /* 0~N 个动作；没有真实改动时必须为空数组 */ ],
  "pending": null
}

可用动作：
1) {"type":"smart_sort"}
2) {"type":"update_bank","bankId":"目标题库id","desc":"介绍正文","name":"可选新名"}
   - 写/改题库介绍必须用它；desc 要是完整介绍，不能只写「已完成」
3) {"type":"update_meta","items":[{"id":"...","category":"...","difficulty":"简单|中等|困难","frequency":"高频|中频|低频","tags":"...","keypoints":"...","title":"..."}]}
4) {"type":"set_category","questionIds":["id"]|"all","category":"..."}
5) {"type":"set_difficulty","questionIds":["id"]|"all","difficulty":"简单|中等|困难"}
6) {"type":"set_frequency","questionIds":["id"]|"all","frequency":"高频|中频|低频"}
7) {"type":"estimate_frequency"}
   - 用 LLM 按面试常考程度批量统计/标注频率（高频/中频/低频）
8) {"type":"set_tags","questionIds":["id"]|"all","tags":"..."}
9) {"type":"set_keypoints","questionIds":["id"]|"all","keypoints":"..."}
10) {"type":"set_title","questionIds":["id"],"title":"..."}
11) {"type":"reorder","categoryOrder":[],"questionOrder":{}}
12) {"type":"generate_content","fields":["approach","answer","followUp"],"items":[{"id":"...","approach":"...","answer":"...","followUp":"..."}]}
13) {"type":"merge_categories","from":["分类A","分类B"],"to":"合并后的分类名"}
   - 把多个分类里的题目合并到一个分类名下
14) {"type":"split_category","from":"原分类","splits":[{"category":"新分类1","questionIds":["id1","id2"]},{"category":"新分类2","questionIds":["id3"]}]}
   - 把一个分类拆成多个；每个题目只能出现在一个 split 里；未列出的题可留在 from 或并入某一 split
15) {"type":"rename_category","from":"旧分类名","to":"新分类名"}

四层标题（由粗到细）：题库(一级) > 分类(二级单元，勿过细) > 标签(三级小模块，每题1-3个) > 考点(四级，可多个)

能力边界（超出就明确说不会，并指出卡点）：
- 会：题库介绍、题目分类/难度/频率/标签/考点/标题、合并/切分/重命名分类、排序、按常考程度估频率、生成思路/答案/追问
- 不会：删除题库、上传图片/改 Logo、跨系统改文件、无法定位的题库名
- 拒绝时格式：先说「做不到」，再说「卡点：……」

硬性规则：
- actions 为空时，严禁说「已完成/已写好/已添加」
- 题库已有介绍时：不要直接覆盖；应询问用户选【覆盖】还是【优化】，并设置 pending
- 题库无介绍时：直接产出 update_bank 写入介绍
- pending 示例：{"type":"confirm_desc","bankId":"...","bankName":"...","existingDesc":"..."}`;
}

function resolveQuestionIds(input, questions) {
  if (
    input === 'all' ||
    input === '*' ||
    (Array.isArray(input) && input.length === 1 && (input[0] === 'all' || input[0] === '*'))
  ) {
    return questions.map((q) => String(q.id));
  }
  const raw = Array.isArray(input) ? input : input != null ? [input] : [];
  return raw.map(String).filter((id) => questions.some((q) => String(q.id) === id));
}

function summarizeActions(actions) {
  const parts = [];
  for (const a of actions || []) {
    if (a.type === 'smart_sort') {
      parts.push(`已为 ${a.items?.length || 0} 题自动识别分类/难度/频率/标签/考点并整理顺序`);
    } else if (a.type === 'update_bank') {
      const name = a.bankName || a.bankId || '题库';
      parts.push(
        a.desc
          ? `已更新「${name}」介绍为「${String(a.desc).slice(0, 36)}${String(a.desc).length > 36 ? '…' : ''}」`
          : `已更新「${name}」信息`
      );
    } else if (a.type === 'update_meta') {
      parts.push(`已更新 ${a.items?.length || 0} 题的分类/难度/频率/标签/考点/标题`);
    } else if (a.type === 'set_category') {
      parts.push(`已将 ${a.questionIds?.length || 0} 题分类设为「${a.category}」`);
    } else if (a.type === 'set_difficulty') {
      parts.push(`已将 ${a.questionIds?.length || 0} 题难度设为「${a.difficulty}」`);
    } else if (a.type === 'set_frequency') {
      parts.push(`已将 ${a.questionIds?.length || 0} 题频率设为「${a.frequency}」`);
    } else if (a.type === 'estimate_frequency') {
      parts.push(`已为 ${a.items?.length || 0} 题统计并标注面试频率`);
    } else if (a.type === 'set_tags') {
      parts.push(`已更新 ${a.questionIds?.length || 0} 题的标签`);
    } else if (a.type === 'set_keypoints') {
      parts.push(`已更新 ${a.questionIds?.length || 0} 题的考点`);
    } else if (a.type === 'merge_categories') {
      parts.push(`已将分类「${(a.from || []).join('、')}」合并为「${a.to}」`);
    } else if (a.type === 'split_category') {
      parts.push(`已将分类「${a.from}」拆分为 ${(a.splits || []).map((s) => s.category).join('、')}`);
    } else if (a.type === 'rename_category') {
      parts.push(`已将分类「${a.from}」重命名为「${a.to}」`);
    } else if (a.type === 'set_title') {
      parts.push(`已修改标题为「${a.title}」`);
    } else if (a.type === 'reorder') {
      parts.push('已调整题目顺序');
    } else if (a.type === 'generate_content') {
      parts.push(`已为 ${a.items?.length || 0} 题生成内容`);
    }
  }
  if (!parts.length) return '';
  return `喵～${parts.join('；')}。`;
}

function ensureTaskReply(reply, actions) {
  const summary = summarizeActions(actions);
  let text = String(reply || '').trim();
  if (!actions?.length) {
    if (/(已(经)?(帮你)?(完成|写好|添加|更新|改好|设置好|生成好|弄好)|搞定了|搞定啦)/.test(text)) {
      return '喵～这件事我刚才没有真正改到数据。卡点：缺少可执行动作。请再说一次具体需求～';
    }
    return text || '喵～我在呢，可以说「给操作系统题库加介绍」「给所有题目设分类」等～';
  }
  if (!text || /^(好的|嗯|ok|OK|喵～?好的|收到)[。.!！]*$/.test(text)) {
    return summary || '喵～任务完成啦～';
  }
  if (summary && !/(已|完成|设为|改成|更新|生成|整理)/.test(text)) {
    return `${text}\n${summary}`;
  }
  return text;
}

async function generateBankDesc(bank, mode, existingDesc, llmCall) {
  if (!llmCall) {
    if (mode === 'optimize' && existingDesc) {
      return `${String(existingDesc).trim()}（已整理表述，突出面试常考主线。）`.slice(0, 200);
    }
    return defaultBankDesc(bank);
  }
  const name = bank?.name || '题库';
  const prompt =
    mode === 'optimize'
      ? `你是面试八股编辑。请优化下列题库介绍：更清晰、专业、适合卡片展示（1-3句）。只输出介绍正文，不要前后缀。\n题库：${name}\n原文：${existingDesc || ''}`
      : `你是面试八股编辑。请为题库写介绍（1-3句中文），说明覆盖的核心考点，适合卡片展示。只输出介绍正文，不要前后缀。\n题库：${name}\n已有信息：${bank?.desc || '无'}`;
  const content = await llmCall([{ role: 'user', content: prompt }]);
  const text = String(content || '')
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^["「]|["」]$/g, '')
    .trim()
    .slice(0, 200);
  return text || defaultBankDesc(bank);
}

async function handleBankDescRequest({
  message,
  currentBank,
  allBanks,
  pending,
  intent,
  llmCall,
}) {
  // 确认阶段
  if (pending?.type === 'confirm_desc') {
    const target =
      (allBanks || []).find((b) => b.id === pending.bankId) ||
      (currentBank?.id === pending.bankId ? currentBank : null) ||
      { id: pending.bankId, name: pending.bankName, desc: pending.existingDesc };

    if (intent === 'desc_cancel') {
      return {
        reply: '喵～好，那先不改介绍啦。还有别的要帮忙再说～',
        actions: [],
        pending: null,
      };
    }
    if (intent === 'desc_overwrite') {
      const desc = await generateBankDesc(target, 'overwrite', '', llmCall);
      const actions = [
        { type: 'update_bank', bankId: target.id, bankName: target.name || pending.bankName, desc },
      ];
      return {
        reply: ensureTaskReply(`喵～已覆盖「${target.name || pending.bankName}」的介绍～`, actions),
        actions,
        pending: null,
      };
    }
    if (intent === 'desc_optimize') {
      const desc = await generateBankDesc(target, 'optimize', pending.existingDesc || target.desc, llmCall);
      const actions = [
        { type: 'update_bank', bankId: target.id, bankName: target.name || pending.bankName, desc },
      ];
      return {
        reply: ensureTaskReply(`喵～已按你的选择优化「${target.name || pending.bankName}」的介绍～`, actions),
        actions,
        pending: null,
      };
    }
    return {
      reply: `喵～「${pending.bankName || '该题库'}」已有介绍。请明确回复「覆盖」或「优化」；回复「取消」可放弃～\n当前介绍：${pending.existingDesc || '（无）'}`,
      actions: [],
      pending,
    };
  }

  const target = resolveTargetBank(message, currentBank, allBanks);
  if (!target?.id) {
    return {
      reply:
        '喵～做不到直接加介绍。卡点：没有定位到目标题库。请说「给当前题库加介绍」，或用题库卡片上的准确名称，例如「给操作系统题库加介绍」。',
      actions: [],
      pending: null,
    };
  }

  if (hasBankDesc(target)) {
    return {
      reply: `喵～「${target.name}」已经有介绍了：\n「${target.desc}」\n\n要【覆盖】成新介绍，还是【优化】现有介绍？请回复「覆盖」或「优化」。`,
      actions: [],
      pending: {
        type: 'confirm_desc',
        bankId: target.id,
        bankName: target.name,
        existingDesc: target.desc,
      },
    };
  }

  const desc = await generateBankDesc(target, 'create', '', llmCall);
  const actions = [{ type: 'update_bank', bankId: target.id, bankName: target.name, desc }];
  return {
    reply: ensureTaskReply(`喵～「${target.name}」还没有介绍，我已经写好并填进题库卡片啦～`, actions),
    actions,
    pending: null,
  };
}

function buildCatSystemPromptForGeneral(bank, questions, allBanks) {
  return buildCatSystemPrompt(bank, questions, allBanks);
}

async function runBaguCat(
  { message, bank, questions, history, banks, pending },
  {
    llmCall,
    llmStream,
    onReplyDelta,
    fakeStream,
    smartSortFn = smartSort,
    estimateFrequencyFn = estimateFreq,
  } = {}
) {
  const safeBank = bank || { id: '', name: '', categories: [], desc: '' };
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const allBanks = Array.isArray(banks) && banks.length ? banks : safeBank.id ? [safeBank] : [];
  const intent = matchLocalIntent(message, pending);
  const streamOpts = { onReplyDelta, fakeStream };

  const finish = async (result) => {
    const reply = await emitReplyText(result.reply, streamOpts);
    return { ...result, reply };
  };

  // 介绍相关：走专用流程，避免模型空口说完成
  if (
    intent === 'bank_desc' ||
    intent === 'desc_overwrite' ||
    intent === 'desc_optimize' ||
    intent === 'desc_cancel' ||
    intent === 'desc_confirm_unclear' ||
    pending?.type === 'confirm_desc'
  ) {
    const result = await handleBankDescRequest({
      message,
      currentBank: safeBank,
      allBanks,
      pending,
      intent: pending?.type === 'confirm_desc' && intent === 'bank_desc' ? 'desc_confirm_unclear' : intent,
      llmCall,
    });
    return finish(result);
  }

  if (!llmCall && !llmStream) {
    if (intent === 'estimate_frequency') {
      if (!safeQuestions.length) {
        return finish({
          reply: '喵～做不到统计频率。卡点：当前题库还没有题目。',
          actions: [],
          pending: null,
        });
      }
      const items = await estimateFrequencyFn(
        {
          bankName: safeBank.name,
          questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
        },
        {}
      );
      const actions = [{ type: 'estimate_frequency', items }];
      return finish({ reply: ensureTaskReply('', actions), actions, pending: null });
    }
    if (intent === 'smart_sort') {
      if (!safeQuestions.length) {
        return finish({
          reply: '喵～做不到排序。卡点：当前题库还没有题目。',
          actions: [],
          pending: null,
        });
      }
      const items = await smartSortFn(
        {
          bankId: safeBank.id,
          bankName: safeBank.name,
          categories: safeBank.categories || [],
          questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
        },
        {}
      );
      const actions = [{ type: 'smart_sort', items }];
      return finish({ reply: ensureTaskReply('', actions), actions, pending: null });
    }
    if (intent === 'help') {
      return finish({
        reply:
          '喵～我可以：\n1. 给题库写/改介绍（已有介绍会先问你覆盖还是优化）\n2. 设置/修改题目分类、标签、考点、难度、频率、标题\n3. 合并 / 切分 / 重命名分类，并实时刷新题库页\n4. 按面试常考程度统计频率（高/中/低频）\n5. 整理排序\n6. 生成思路/答案/追问\n\n四层标题：题库 > 分类 > 标签(1-3) > 考点(可多个)\n做不到的事我会直说，并告诉你卡点在哪～',
        actions: [],
        pending: null,
      });
    }
    if (intent === 'generate') {
      return finish({
        reply: '喵～做不到生成答案/追问。卡点：未配置或未启用 LLM。请到「LLM 设置」填写 API Key 并开启优先使用 LLM。',
        actions: [],
        pending: null,
      });
    }
    if (intent === 'merge_categories' || intent === 'split_category' || intent === 'rename_category') {
      return finish({
        reply: '喵～合并/切分分类需要 LLM 理解你的意图。卡点：未配置或未启用 LLM。请到「LLM 设置」填写 API Key。',
        actions: [],
        pending: null,
      });
    }
    return finish({
      reply: '喵～我在呢。可以说「把锁和事务分类合并」「把索引分类拆开」「统计频率」～',
      actions: [],
      pending: null,
    });
  }

  const messages = [
    {
      role: 'system',
      content: buildCatSystemPromptForGeneral(safeBank, safeQuestions, allBanks),
    },
    ...(Array.isArray(history) ? history.slice(-24) : []),
    { role: 'user', content: String(message || '').trim() },
  ];

  let content = '';
  if (typeof llmStream === 'function') {
    let acc = '';
    let lastReply = '';
    content = await llmStream(messages, (piece) => {
      acc += piece;
      if (typeof onReplyDelta !== 'function') return;
      const { value } = extractJsonStringField(acc, 'reply');
      if (value.length > lastReply.length) {
        onReplyDelta(value.slice(lastReply.length), value);
        lastReply = value;
      }
    });
    if (!content) content = acc;
  } else {
    content = await llmCall(messages);
  }

  let parsed;
  try {
    parsed = extractJsonObject(content);
  } catch {
    const fallbackReply = content || '喵…我刚才有点卡壳，再试一次？';
    if (typeof onReplyDelta === 'function' && !content.includes('"reply"')) {
      await emitReplyText(fallbackReply, streamOpts);
    }
    return { reply: fallbackReply, actions: [], pending: null };
  }

  let reply = String(parsed.reply || '').trim();
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const nextPending = parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : null;
  const normalized = [];

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    const type = String(action.type || '');

    if (type === 'smart_sort') {
      const items = await smartSortFn(
        {
          bankId: safeBank.id,
          bankName: safeBank.name,
          categories: safeBank.categories || BANK_CATEGORY_RULES[safeBank.id]?.categories || [],
          questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
        },
        { llmCall: (prompt) => llmCall([{ role: 'user', content: prompt }]) }
      );
      normalized.push({ type: 'smart_sort', items });
      continue;
    }

    if (type === 'update_bank') {
      const patch = { type: 'update_bank' };
      patch.bankId = String(action.bankId || safeBank.id || '').trim();
      const targetMeta = allBanks.find((b) => b.id === patch.bankId);
      if (targetMeta?.name) patch.bankName = targetMeta.name;
      if (action.desc != null && String(action.desc).trim()) {
        patch.desc = String(action.desc).trim().slice(0, 200);
      }
      if (action.name != null && String(action.name).trim()) {
        patch.name = String(action.name).trim().slice(0, 40);
      }
      if (patch.bankId && (patch.desc || patch.name)) normalized.push(patch);
      continue;
    }

    if (type === 'update_meta') {
      const items = [];
      (Array.isArray(action.items) ? action.items : []).forEach((it) => {
        const id = String(it.id || '');
        if (!safeQuestions.some((q) => String(q.id) === id)) return;
        const patch = { id };
        if (it.category != null && String(it.category).trim()) patch.category = String(it.category).trim();
        if (['简单', '中等', '困难'].includes(String(it.difficulty || '').trim())) {
          patch.difficulty = String(it.difficulty).trim();
        }
        if (FREQUENCIES.includes(String(it.frequency || '').trim())) {
          patch.frequency = String(it.frequency).trim();
        }
        if (it.tags != null) {
          patch.tags = String(it.tags)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(',');
        }
        if (it.keypoints != null) {
          patch.keypoints = String(it.keypoints)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 8)
            .join(',');
        }
        if (it.title != null && String(it.title).trim()) patch.title = String(it.title).trim();
        if (Object.keys(patch).length > 1) items.push(patch);
      });
      if (items.length) normalized.push({ type: 'update_meta', items });
      continue;
    }

    if (type === 'set_category') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const category = String(action.category || '').trim();
      if (ids.length && category) normalized.push({ type: 'set_category', questionIds: ids, category });
      continue;
    }

    if (type === 'set_difficulty') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const difficulty = String(action.difficulty || '').trim();
      if (ids.length && ['简单', '中等', '困难'].includes(difficulty)) {
        normalized.push({ type: 'set_difficulty', questionIds: ids, difficulty });
      }
      continue;
    }

    if (type === 'set_frequency') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const frequency = String(action.frequency || '').trim();
      if (ids.length && FREQUENCIES.includes(frequency)) {
        normalized.push({ type: 'set_frequency', questionIds: ids, frequency });
      }
      continue;
    }

    if (type === 'estimate_frequency') {
      const items = await estimateFrequencyFn(
        {
          bankName: safeBank.name,
          questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
        },
        { llmCall: (prompt) => llmCall([{ role: 'user', content: prompt }]) }
      );
      normalized.push({ type: 'estimate_frequency', items });
      continue;
    }

    if (type === 'set_tags') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const tags = String(action.tags || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(',');
      if (ids.length && tags) normalized.push({ type: 'set_tags', questionIds: ids, tags });
      continue;
    }

    if (type === 'set_keypoints') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const keypoints = String(action.keypoints || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join(',');
      if (ids.length && keypoints) normalized.push({ type: 'set_keypoints', questionIds: ids, keypoints });
      continue;
    }

    if (type === 'set_title') {
      const ids = resolveQuestionIds(action.questionIds || action.questionId, safeQuestions);
      const title = String(action.title || '').trim();
      if (ids.length === 1 && title) normalized.push({ type: 'set_title', questionIds: ids, title });
      continue;
    }

    if (type === 'reorder') {
      const categoryOrder = Array.isArray(action.categoryOrder)
        ? action.categoryOrder.map((c) => String(c).trim()).filter(Boolean)
        : [];
      const questionOrder = {};
      if (action.questionOrder && typeof action.questionOrder === 'object') {
        Object.entries(action.questionOrder).forEach(([cat, ids]) => {
          if (!Array.isArray(ids)) return;
          questionOrder[String(cat)] = ids
            .map(String)
            .filter((id) => safeQuestions.some((q) => String(q.id) === id));
        });
      }
      if (categoryOrder.length || Object.keys(questionOrder).length) {
        normalized.push({ type: 'reorder', categoryOrder, questionOrder });
      }
      continue;
    }

    if (type === 'generate_content') {
      const fields = Array.isArray(action.fields)
        ? action.fields.filter((f) => ['approach', 'answer', 'followUp'].includes(f))
        : ['approach', 'answer', 'followUp'];
      const items = [];
      const rawItems = Array.isArray(action.items) ? action.items : [];
      rawItems.forEach((it) => {
        const id = String(it.id || '');
        if (!safeQuestions.some((q) => String(q.id) === id)) return;
        const patch = { id };
        fields.forEach((f) => {
          if (it[f] != null && String(it[f]).trim()) patch[f] = textToHtml(it[f]);
        });
        if (Object.keys(patch).length > 1) items.push(patch);
      });
      if (items.length) normalized.push({ type: 'generate_content', fields, items });
      continue;
    }

    if (type === 'merge_categories') {
      const from = (Array.isArray(action.from) ? action.from : [action.from])
        .map((c) => String(c || '').trim())
        .filter(Boolean);
      const to = String(action.to || '').trim();
      if (from.length >= 1 && to) {
        normalized.push({ type: 'merge_categories', from, to });
      }
      continue;
    }

    if (type === 'split_category') {
      const from = String(action.from || '').trim();
      const splits = [];
      (Array.isArray(action.splits) ? action.splits : []).forEach((s) => {
        const category = String(s?.category || '').trim();
        if (!category) return;
        const questionIds = resolveQuestionIds(s.questionIds || s.questionId, safeQuestions);
        splits.push({ category, questionIds });
      });
      if (from && splits.length) {
        normalized.push({ type: 'split_category', from, splits });
      }
      continue;
    }

    if (type === 'rename_category') {
      const from = String(action.from || '').trim();
      const to = String(action.to || '').trim();
      if (from && to && from !== to) {
        normalized.push({ type: 'rename_category', from, to });
      }
    }
  }

  if (intent === 'smart_sort' && !normalized.length && safeQuestions.length) {
    const items = await smartSortFn(
      {
        bankId: safeBank.id,
        bankName: safeBank.name,
        categories: safeBank.categories || BANK_CATEGORY_RULES[safeBank.id]?.categories || [],
        questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
      },
      { llmCall: (prompt) => llmCall([{ role: 'user', content: prompt }]) }
    );
    normalized.push({ type: 'smart_sort', items });
  }

  if (intent === 'estimate_frequency' && !normalized.length && safeQuestions.length) {
    const items = await estimateFrequencyFn(
      {
        bankName: safeBank.name,
        questions: safeQuestions.map((q) => ({ id: q.id, title: q.title })),
      },
      { llmCall: (prompt) => llmCall([{ role: 'user', content: prompt }]) }
    );
    normalized.push({ type: 'estimate_frequency', items });
  }

  // 模型若对「已有介绍」直接 update_bank，改成询问确认
  const updateBankAction = normalized.find((a) => a.type === 'update_bank');
  if (updateBankAction) {
    const target =
      allBanks.find((b) => b.id === updateBankAction.bankId) ||
      (safeBank.id === updateBankAction.bankId ? safeBank : null);
    if (target && hasBankDesc(target) && !pending?.type) {
      const ask = `喵～「${target.name}」已经有介绍了：\n「${target.desc}」\n\n要【覆盖】成新介绍，还是【优化】现有介绍？请回复「覆盖」或「优化」。`;
      if (typeof llmStream !== 'function') {
        await emitReplyText(ask, streamOpts);
      }
      return {
        reply: ask,
        actions: [],
        pending: {
          type: 'confirm_desc',
          bankId: target.id,
          bankName: target.name,
          existingDesc: target.desc,
        },
      };
    }
  }

  reply = ensureTaskReply(reply, normalized);
  if (typeof llmStream !== 'function') {
    await emitReplyText(reply, streamOpts);
  }
  return { reply, actions: normalized, pending: nextPending };
}

module.exports = {
  runBaguCat,
  buildCatSystemPrompt,
  textToHtml,
  ensureTaskReply,
  hasBankDesc,
  resolveTargetBank,
  matchLocalIntent,
};
