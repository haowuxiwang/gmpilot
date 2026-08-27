/**
 * Onboarding types and constants.
 */

/** Local storage key for onboarding completion */
export const ONBOARDING_COMPLETED_KEY = 'gmpilot:onboarding_completed';

/** Onboarding steps */
export enum OnboardingStep {
  Welcome = 0,
  ApiKey = 1,
  Template = 2,
  Done = 3,
}

/** Step configuration */
export const ONBOARDING_STEPS = [
  {
    id: OnboardingStep.Welcome,
    title: '欢迎使用 GMPilot',
    description: 'AI 驱动的偏差报告生成工具',
  },
  {
    id: OnboardingStep.ApiKey,
    title: '配置 API 密钥',
    description: '连接 LLM 服务以生成偏差报告',
  },
  {
    id: OnboardingStep.Template,
    title: '选择报告模板',
    description: '选择适合您工厂的偏差报告模板',
  },
  {
    id: OnboardingStep.Done,
    title: '配置完成',
    description: '可以开始生成偏差报告了',
  },
];

/**
 * Check if onboarding has been completed.
 */
export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark onboarding as completed.
 */
export function completeOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset onboarding (for testing).
 */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  } catch {
    // Ignore storage errors
  }
}
