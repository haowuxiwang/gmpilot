/**
 * Cover module generator.
 * Fills cover template with user information.
 */

import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Cover section output */
export interface CoverOutput {
  title: string;
  titleEn: string;
  department: string;
  preparedBy: {
    name: string;
    signatureDate: string;
  };
  reviewedBy: {
    name: string;
    signatureDate: string;
  };
}

/**
 * Cover module generator.
 * Uses template filling instead of LLM generation.
 */
export class CoverGenerator extends BaseModuleGenerator {
  constructor() {
    super('cover');
  }

  async generate(context: ModuleContext): Promise<CoverOutput> {
    log.info('Generating cover', { deviationId: context.deviationId });

    // Cover is mostly fixed content
    // User information would come from settings or input
    return {
      title: '偏差调查和风险评估报告',
      titleEn: 'Deviation Investigation and Risk Assessment Report',
      department: context.analysis.involvedParties[0] || '待补充',
      preparedBy: {
        name: '',
        signatureDate: '',
      },
      reviewedBy: {
        name: '',
        signatureDate: '',
      },
    };
  }
}
