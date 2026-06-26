/**
 * Attachments module generator.
 * Generates attachment list and version history.
 */

import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Attachment record */
export interface Attachment {
  no: string;
  name: string;
  pages: number;
}

/** Version history record */
export interface VersionHistory {
  version: string;
  executionDate: string;
  revisionReason: string;
  mainChanges: string;
}

/** Attachments section output */
export interface AttachmentsOutput {
  attachments: Attachment[];
  versionHistory: VersionHistory[];
}

/**
 * Attachments module generator.
 * Generates attachment list and version history automatically.
 */
export class AttachmentsGenerator extends BaseModuleGenerator {
  constructor() {
    super('attachments');
  }

  async generate(context: ModuleContext): Promise<AttachmentsOutput> {
    log.info('Generating attachments', { deviationId: context.deviationId });

    // Generate attachment list
    const attachments: Attachment[] = [
      {
        no: '调查报告-附件1',
        name: '偏差调查报告',
        pages: 1,
      },
    ];

    // Add investigation tools as attachments if used
    const investigation = context.previousResults?.investigation as {
      rootCause?: { methods?: { flowchart?: boolean; fishbone?: boolean } };
    } | undefined;

    if (investigation?.rootCause?.methods?.flowchart) {
      attachments.push({
        no: '调查报告-附件2',
        name: '事件流程图',
        pages: 1,
      });
    }

    if (investigation?.rootCause?.methods?.fishbone) {
      attachments.push({
        no: `调查报告-附件${attachments.length + 1}`,
        name: '鱼骨图',
        pages: 1,
      });
    }

    // Generate version history
    const versionHistory: VersionHistory[] = [
      {
        version: '1.0',
        executionDate: new Date().toISOString().slice(0, 10),
        revisionReason: '初始版本',
        mainChanges: '首次生成偏差调查报告',
      },
    ];

    return {
      attachments,
      versionHistory,
    };
  }
}
