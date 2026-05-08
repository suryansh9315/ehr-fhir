import Anthropic from '@anthropic-ai/sdk';
import { ActionType, ActionUrgency, createLogger } from '@ehr/shared';
import { EXTRACT_CLINICAL_ACTIONS_TOOL } from './tools';
import { SYSTEM_PROMPT } from './prompts';

const logger = createLogger('claude-extractor');

export interface PatientContext {
  age?: number;
  gender?: string;
  conditions?: string[];
}

export interface RawAction {
  type: ActionType;
  details: Record<string, unknown>;
  verbatim_source: string;
  urgency: ActionUrgency;
}

export interface ExtractionResult {
  actions: RawAction[];
  summary: string;
}

export class ClaudeExtractor {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async extract(
    noteText: string,
    patientContext: PatientContext,
    noteType: string
  ): Promise<ExtractionResult> {
    const contextParts: string[] = [];
    if (patientContext.age) contextParts.push(`${patientContext.age}yo`);
    if (patientContext.gender) contextParts.push(patientContext.gender);
    if (patientContext.conditions?.length) {
      contextParts.push(patientContext.conditions.join(', '));
    }

    const userMessage = contextParts.length
      ? `Note type: ${noteType}\nPatient context: ${contextParts.join(', ')}\n---\n${noteText}`
      : `Note type: ${noteType}\n---\n${noteText}`;

    logger.debug('Sending note to Claude', { noteType, noteLength: noteText.length });

    const response = await this.client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 4096,
      tools: [EXTRACT_CLINICAL_ACTIONS_TOOL],
      tool_choice: { type: 'tool', name: 'extract_clinical_actions' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Find the tool_use block — forced tool_choice guarantees it exists
    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block — unexpected response');
    }

    const input = toolUseBlock.input as { actions: RawAction[]; summary: string };

    logger.info('Extraction complete', { actionCount: input.actions.length, noteType });

    return {
      actions: input.actions,
      summary: input.summary,
    };
  }
}
