/**
 * Workflow progress indicator with step descriptions and timing.
 * Horizontal stepper showing the 5 LLM analysis stages.
 * Modern, clean aesthetic with enhanced visual feedback.
 */

import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import {
  Search,
  Layers,
  BookOpen,
  FileText,
  Shield,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export type WorkflowStepId =
  | 'input'
  | 'analyzing'
  | 'identifying'
  | 'matching'
  | 'generating'
  | 'auditing'
  | 'review'
  | 'done';

interface StepDef {
  id: WorkflowStepId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: StepDef[] = [
  { id: 'analyzing', label: '线索分析', description: '分析偏差信息', icon: Search },
  { id: 'identifying', label: '因素识别', description: '识别关键因素', icon: Layers },
  { id: 'matching', label: '法规匹配', description: '匹配GMP法规', icon: BookOpen },
  { id: 'generating', label: '报告生成', description: '生成报告模块', icon: FileText },
  { id: 'auditing', label: '合规审核', description: '审核合规性', icon: Shield },
];

const STEP_ORDER: WorkflowStepId[] = [
  'input',
  'analyzing',
  'identifying',
  'matching',
  'generating',
  'auditing',
  'review',
  'done',
];

// Estimated time per step in seconds
const STEP_DURATION_ESTIMATE: Record<string, number> = {
  analyzing: 30,
  identifying: 20,
  matching: 25,
  generating: 40,
  auditing: 15,
};

function getStepStatus(
  stepId: WorkflowStepId,
  currentStep: WorkflowStepId,
): 'done' | 'active' | 'pending' | 'error' {
  if (currentStep === 'done' || currentStep === 'review') {
    return 'done';
  }
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepId);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

function getCompletionPercentage(
  currentStep: WorkflowStepId,
  totalModules: number,
  completedModules: number,
): number {
  if (currentStep === 'done') return 100;
  if (currentStep === 'review') return 95;
  
  const baseProgress = {
    input: 0,
    analyzing: 20,
    identifying: 35,
    matching: 50,
    generating: 65,
    auditing: 90,
  }[currentStep] || 0;
  
  // Add module generation progress
  if (currentStep === 'generating' && totalModules > 0) {
    const moduleProgress = (completedModules / totalModules) * 10;
    return Math.min(90, baseProgress + moduleProgress);
  }
  
  return baseProgress;
}

interface WorkflowProgressProps {
  currentStep: WorkflowStepId;
  totalModules?: number;
  completedModules?: number;
  showDescriptions?: boolean;
  className?: string;
}

export function WorkflowProgress({
  currentStep,
  totalModules = 7,
  completedModules = 0,
  showDescriptions = false,
  className = '',
}: WorkflowProgressProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const completionPercentage = useMemo(
    () => getCompletionPercentage(currentStep, totalModules, completedModules),
    [currentStep, totalModules, completedModules]
  );

  const estimatedTimeRemaining = useMemo(() => {
    if (currentStep === 'done') return 0;
    
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    let remaining = 0;
    
    for (let i = currentIdx; i < STEP_ORDER.length - 1; i++) {
      const step = STEP_ORDER[i];
      if (step !== 'done' && step !== 'review' && step !== 'input') {
        remaining += STEP_DURATION_ESTIMATE[step] || 0;
      }
    }
    
    return remaining;
  }, [currentStep]);

  useEffect(() => {
    if (containerRef.current) {
      gsap.from(containerRef.current, {
        y: -6,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, []);

  useEffect(() => {
    if (progressBarRef.current) {
      gsap.to(progressBarRef.current, {
        width: `${completionPercentage}%`,
        duration: 0.5,
        ease: 'power2.out',
      });
    }
  }, [completionPercentage]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-3 px-5 py-3 ${className}`}
    >
      {/* Progress bar */}
      <div className="relative h-1 bg-stone-100 rounded-full overflow-hidden">
        <div
          ref={progressBarRef}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-teal-600 rounded-full"
          style={{ width: `${completionPercentage}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between gap-1">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step.id, currentStep);
          const Icon = step.icon;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step node */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`
                    relative w-8 h-8 rounded-full flex items-center justify-center
                    ${/* 只过渡颜色，不过渡 transform——避免与 animate-glow 的 scale 动画叠加产生绿色描边闪烁 */ ''}
                    transition-colors duration-300 ease-out
                    ${
                      status === 'done'
                        ? 'bg-teal-600 text-white shadow-sm'
                        : status === 'active'
                          ? 'bg-white border-2 border-teal-500 text-teal-600 animate-glow'
                          : status === 'error'
                            ? 'bg-error-50 border-2 border-error-500 text-error-600'
                            : 'bg-stone-100 text-stone-400'
                    }
                  `}
                >
                  {status === 'done' ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : status === 'active' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : status === 'error' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>

                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={`
                      text-[11px] font-medium transition-colors duration-200
                      ${
                        status === 'done'
                          ? 'text-stone-600'
                          : status === 'active'
                            ? 'text-teal-700 font-semibold'
                            : 'text-stone-400'
                      }
                    `}
                  >
                    {step.label}
                  </span>

                  {showDescriptions && (
                    <span
                      className={`
                        text-[9px] transition-colors duration-200
                        ${
                          status === 'done'
                            ? 'text-stone-500'
                            : status === 'active'
                              ? 'text-teal-600'
                              : 'text-stone-400'
                        }
                      `}
                    >
                      {step.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="w-6 h-px mx-1 relative overflow-hidden -mt-4">
                  <div className="absolute inset-0 bg-stone-200" />
                  <div
                    className={`
                      absolute inset-y-0 left-0 bg-teal-500
                      transition-all duration-500 ease-out
                      ${status === 'done' ? 'w-full' : 'w-0'}
                    `}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status info */}
      <div className="flex items-center justify-between text-[10px] text-stone-500">
        <span>进度: {completionPercentage}%</span>
        {estimatedTimeRemaining > 0 && currentStep !== 'done' && (
          <span>预计剩余: {formatTime(estimatedTimeRemaining)}</span>
        )}
        {currentStep === 'done' && (
          <span className="text-teal-600 font-medium">完成</span>
        )}
      </div>
    </div>
  );
}
