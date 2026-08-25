/**
 * 工厂偏差编号识别与提取。
 *
 * 工厂内部偏差编号格式：D-TZ-API-EG-26003（D-前缀 + 部门代码 + 5位流水号）。
 * 当用户线索中包含工厂内部编号时，应优先使用该编号作为偏差编号，
 * 使报告封面、CAPA 编号（CP-TZ-API-${偏差编号}-${流水号}）与工厂实际格式完全一致。
 */

const FACTORY_DEVIATION_ID_PATTERN = /\bD-[A-Z0-9]{2,6}(?:-[A-Z0-9]*[A-Z][A-Z0-9]*){1,}-\d{5}\b(?!-\d{5})/g;

/**
 * 从文本中提取工厂内部偏差编号（如 D-TZ-API-EG-26003）。
 * @param text 原始文本（偏差线索全文）
 * @returns 工厂编号；未命中返回 null
 */
export function extractFactoryDeviationId(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(FACTORY_DEVIATION_ID_PATTERN);
  return match ? match[0] : null;
}

/**
 * 生成默认偏差编号（工厂编号缺失时使用）。
 */
export function generateFallbackDeviationId(): string {
  return `DEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
