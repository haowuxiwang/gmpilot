/**
 * Shared serif font loading.
 * Noto Serif CJK SC — 用于报告正文和空态标题（编辑式衬线）
 * Dev 环境 http:// 页面加载 file:// 字体可能被 CORS 拦截 → 优雅降级为系统衬线。
 */

let fontLoadPromise: Promise<void> | null = null;

export function loadSerifFont(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      try {
        const fontPath = await window.gmpilot.resources.getFontPath();
        const font = new FontFace(
          'Noto Serif CJK SC',
          `url('file:///${fontPath.replace(/\\/g, '/').replace(/^\/+/, '')}')`
        );
        await font.load();
        document.fonts.add(font);
      } catch {
        // 字体加载失败时回退系统衬线，不影响功能
      }
    })();
  }
  return fontLoadPromise;
}
