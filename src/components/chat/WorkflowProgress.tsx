/**
 * Workflow progress indicator.
 * Minimal horizontal stepper showing the 4 LLM analysis stages.
 * Modern, clean aesthetic — not dashboard-like.
 */

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import {
  Search,
  Layers,
  BookOpen,
  FileText,
  Check,
  Loader2,
} from 'lucide-react';

export type WorkflowStepId =
  | 'input'
  | 'analyzing'
  | 'identifying'
  | 'matching'
  | 'generating'
  | 'review'
  | 'done';

interface StepDef {
  id: WorkflowStepId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: StepDef[] = [
  { id: 'analyzing', label: '线索分析', icon: Search },
  { id: 'identifying', label: '因素识别', icon: Layers },
  { id: 'matching', label: '法规匹配', icon: BookOpen },
  { id: 'generating', label: '报告生成', icon: FileText },
];

const STEP_ORDER: WorkflowStepId[] = [
  'input',
  'analyzing',
  'identifying',
  'matching',
  'generating',
  'review',
  'done',
];

function getStepStatus(
  stepId: WorkflowStepId,
  currentStep: WorkflowStepId,
): 'done' | 'active' | 'pending' {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepId);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

interface WorkflowProgressProps {
  currentStep: WorkflowStepId;
  className?: string;
}

export function WorkflowProgress({
  currentStep,
  className = '',
}: WorkflowProgressProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.from(containerRef.current, {
        y: -12,
        opacity: 0,
        duration: 0.4,
        ease: 'power3.out',
      });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center gap-0 px-6 py-3 ${className}`}
    >
      {STEPS.map((step, index) => {
        const status = getStepStatus(step.id, currentStep);
        const Icon = step.icon;
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step node */}
            <div className="flex items-center gap-2.5">
              <div
                className={`
                  relative w-8 h-8 rounded-full flex items-center justify-center
                  transition-all duration-500 ease-out
                  ${
                    status === 'done'
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                      : status === 'active'
                        ? 'bg-white border-2 border-teal-400 text-teal-600 shadow-sm shadow-teal-400/10'
                        : 'bg-stone-100 text-stone-400'
                  }
                `}
              >
                {status === 'done' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : status === 'active' ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                  />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}

                {/* Active glow ring */}
                {status === 'active' && (
                  <div className="absolute inset-0 rounded-full border-2 border-teal-400 animate-ping opacity-20" />
                )}
              </div>

              <span
                className={`
                  text-xs font-medium tracking-wide transition-colors duration-300
                  ${
                    status === 'done'
                      ? 'text-teal-700'
                      : status === 'active'
                        ? 'text-teal-600'
                        : 'text-stone-400'
                  }
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="w-10 h-px mx-3 relative overflow-hidden">
                <div className="absolute inset-0 bg-stone-200" />
                <div
                  className={`
                    absolute inset-y-0 left-0 bg-teal-500
                    transition-all duration-700 ease-out
                    ${status === 'done' ? 'w-full' : 'w-0'}
                  `}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
