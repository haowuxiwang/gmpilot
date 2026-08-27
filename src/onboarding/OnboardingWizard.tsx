/**
 * Onboarding wizard component.
 * Guides first-time users through API key and template setup.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  KeyRound,
  FileText,
  PartyPopper,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OnboardingStep, ONBOARDING_STEPS, completeOnboarding } from './types';
import { settingsApi } from '@/services/api';
import { createLogger } from '@core/utils/logger';

const log = createLogger('Onboarding');

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
}

const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'siliconflow', name: 'SiliconFlow (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V3.2' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  { id: 'glm', name: '智谱清言 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-plus' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
];

interface OnboardingProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.Welcome);
  const [provider, setProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const currentStepConfig = ONBOARDING_STEPS[step];
  const canGoNext = step === OnboardingStep.Welcome ||
    (step === OnboardingStep.ApiKey && apiKey.length > 0 && provider) ||
    step === OnboardingStep.Template ||
    step === OnboardingStep.Done;

  const handleProviderSelect = (p: Provider) => {
    setProvider(p.id);
    setBaseUrl(p.baseUrl);
  };

  const handleTestConnection = async () => {
    if (!apiKey || !provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      await settingsApi.save({
        LLM_API_KEY: apiKey,
        LLM_BASE_URL: baseUrl,
      });
      window.dispatchEvent(new Event('settings-changed'));

      const result = await window.gmpilot?.llm.testProvider(provider);
      setTestResult(result ?? { success: false, error: '测试失败' });
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await settingsApi.save({
        LLM_API_KEY: apiKey,
        LLM_BASE_URL: baseUrl,
      });
      window.dispatchEvent(new Event('settings-changed'));
      completeOnboarding();
      log.info('Onboarding completed');
      onComplete();
    } catch (err) {
      log.error('Failed to save onboarding settings', { error: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (step < OnboardingStep.Done) {
      setStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (step > OnboardingStep.Welcome) {
      setStep((s) => s - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-teal-50/30 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {ONBOARDING_STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    i <= step
                      ? 'bg-teal-600 text-white'
                      : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < ONBOARDING_STEPS.length - 1 && (
                  <div
                    className={`w-16 sm:w-24 h-0.5 mx-2 transition-colors ${
                      i < step ? 'bg-teal-600' : 'bg-stone-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-stone-900">{currentStepConfig.title}</h2>
            <p className="text-sm text-stone-500 mt-1">{currentStepConfig.description}</p>
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-xl border border-stone-100 p-8 min-h-[360px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === OnboardingStep.Welcome && <WelcomeStep />}
              {step === OnboardingStep.ApiKey && (
                <ApiKeyStep
                  provider={provider}
                  apiKey={apiKey}
                  baseUrl={baseUrl}
                  testing={testing}
                  testResult={testResult}
                  onProviderSelect={handleProviderSelect}
                  onApiKeyChange={setApiKey}
                  onBaseUrlChange={setBaseUrl}
                  onTest={handleTestConnection}
                />
              )}
              {step === OnboardingStep.Template && <TemplateStep />}
              {step === OnboardingStep.Done && <DoneStep />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === OnboardingStep.Welcome}
            className={step === OnboardingStep.Welcome ? 'invisible' : ''}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            上一步
          </Button>

          {step === OnboardingStep.Done ? (
            <Button onClick={handleFinish} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  开始使用
                  <Sparkles className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canGoNext}>
              下一步
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Welcome step */
function WelcomeStep() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-teal-600" />
      </div>
      <h3 className="text-xl font-semibold text-stone-900 mb-3">
        GMPilot — AI 偏差报告生成工具
      </h3>
      <p className="text-stone-600 max-w-md mb-6">
        基于大语言模型，自动从偏差线索生成符合 GMP 规范的偏差调查报告。
        支持多工厂模板适配，一键导出 Word 文档。
      </p>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 rounded-xl bg-stone-50">
          <KeyRound className="w-5 h-5 text-teal-600 mx-auto mb-2" />
          <p className="text-xs text-stone-600">配置 API</p>
        </div>
        <div className="p-3 rounded-xl bg-stone-50">
          <FileText className="w-5 h-5 text-teal-600 mx-auto mb-2" />
          <p className="text-xs text-stone-600">选择模板</p>
        </div>
        <div className="p-3 rounded-xl bg-stone-50">
          <PartyPopper className="w-5 h-5 text-teal-600 mx-auto mb-2" />
          <p className="text-xs text-stone-600">开始使用</p>
        </div>
      </div>
    </div>
  );
}

/** API Key configuration step */
function ApiKeyStep({
  provider,
  apiKey,
  baseUrl,
  testing,
  testResult,
  onProviderSelect,
  onApiKeyChange,
  onBaseUrlChange,
  onTest,
}: {
  provider: string;
  apiKey: string;
  baseUrl: string;
  testing: boolean;
  testResult: { success: boolean; error?: string } | null;
  onProviderSelect: (p: Provider) => void;
  onApiKeyChange: (v: string) => void;
  onBaseUrlChange: (v: string) => void;
  onTest: () => void;
}) {
  return (
    <div className="space-y-6 py-2">
      <div>
        <label className="block text-sm font-semibold text-stone-700 mb-2">
          LLM 提供商
        </label>
        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => onProviderSelect(p)}
              className={`p-3 rounded-xl border text-left transition-all ${
                provider === p.id
                  ? 'border-teal-300 bg-teal-50/50 ring-2 ring-teal-600/10'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <span className="text-sm font-medium text-stone-900">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {provider && (
        <>
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              API 地址
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              API 密钥
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={onTest}
              disabled={testing || !apiKey}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                '测试连接'
              )}
            </Button>
            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600">连接成功</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{testResult.error || '连接失败'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Template selection step */
function TemplateStep() {
  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <p className="text-sm text-stone-600">
          已选择默认模板（Arial + 宋体，五号字），适用于大多数工厂。
        </p>
        <p className="text-xs text-stone-500 mt-2">
          后续可在「设置 → 报告模板」中切换或上传自定义模板。
        </p>
      </div>
      <div className="flex justify-center">
        <div className="p-6 rounded-xl border border-teal-200 bg-teal-50/30 max-w-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-stone-900">默认模板</p>
              <p className="text-xs text-stone-500">Arial + 宋体，五号字</p>
            </div>
          </div>
          <div className="text-xs text-stone-600 space-y-1">
            <p>• 7 个标准章节齐全</p>
            <p>• 符合 GMP 偏差报告规范</p>
            <p>• 支持一键导出 Word</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Done step */
function DoneStep() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6">
        <PartyPopper className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="text-xl font-semibold text-stone-900 mb-3">
        配置完成！
      </h3>
      <p className="text-stone-600 max-w-md">
        现在您可以开始生成偏差报告了。在「智能助手」页面输入偏差线索，
        AI 将自动生成符合模板规范的偏差调查报告。
      </p>
    </div>
  );
}
