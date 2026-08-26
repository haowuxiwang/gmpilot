/**
 * JSON repair utilities for LLM output.
 * LLM 输出常见问题：maxTokens 截断导致 JSON 不完整（Expected ',' or '}' after property value）。
 * repairTruncatedJson 尝试闭合未闭合的括号/引号，把截断输出救回为可解析 JSON；
 * 救不回再走重试/降级。
 */

const log = {
  warn: console.warn.bind(console),
};

/**
 * Attempt to repair a truncated JSON string by closing open strings,
 * arrays and objects. Returns null if the result still fails to parse.
 *
 * 只处理截断类损坏：多余逗号去除、字符串/数组/对象闭合。不处理语义错误。
 */
export function repairTruncatedJson(jsonStr: string): string | null {
  let s = jsonStr.trim();

  // 去掉结尾悬挂的逗号/冒号（截断点常在键值中间）
  s = s.replace(/[,:]\s*$/, '');
  // 去掉尾部不完整的键名（如 "key": 后面没了 → 已被上面处理；"ke 悬挂 → 闭引号）
  const quoteCount = (s.match(/"/g) || []).length;
  if (quoteCount % 2 === 1) {
    // 奇数个引号：最后一个字符串未闭合
    // 找到最后一个引号位置，检查其后是否只有空白/逗号/冒号（说明是完整键值对后的截断）
    s += '"';
  }

  // 逐字符扫描栈，闭合未关闭的 [ 和 {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']' || ch === '}') stack.pop();
  }

  // 若停在字符串内，补闭引号
  if (inString) s += '"';
  // 去掉闭合前可能残留的逗号
  s = s.replace(/,\s*$/, '');

  // 反向闭合栈
  while (stack.length > 0) {
    const open = stack.pop();
    s += open === '[' ? ']' : '}';
  }

  try {
    JSON.parse(s);
    return s;
  } catch {
    return null;
  }
}

/** Parse JSON with truncation repair fallback. Throws on total failure. */
export function parseJsonWithRepair<T = unknown>(jsonStr: string, context: string): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    const repaired = repairTruncatedJson(jsonStr);
    if (repaired !== null) {
      log.warn(`[${context}] JSON truncated — repaired successfully`);
      return JSON.parse(repaired) as T;
    }
    throw new Error(`${context}: JSON 无法解析（含修复尝试）`);
  }
}
