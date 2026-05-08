import Groq from 'groq-sdk';
import { ActionType, ActionUrgency, createLogger } from '@ehr/shared';
import { EXTRACT_CLINICAL_ACTIONS_TOOL } from './tools';
import { SYSTEM_PROMPT } from './prompts';

const logger = createLogger('groq-extractor');

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
  private client: Groq;

  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
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

    logger.debug('Sending note to Groq', { noteType, noteLength: noteText.length });

    const response = await this.client.chat.completions.create({
      model: process.env.GROQ_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 4096,
      tools: [EXTRACT_CLINICAL_ACTIONS_TOOL],
      tool_choice: { type: 'function', function: { name: 'extract_clinical_actions' } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const message = response.choices[0]?.message;
    const toolCall = message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== 'extract_clinical_actions') {
      throw new Error('Groq did not return a tool call — unexpected response');
    }

    const input = JSON.parse(toolCall.function.arguments) as {
      actions: RawAction[];
      summary: string;
    };

    logger.info('Extraction complete', { actionCount: input.actions.length, noteType });

    return {
      actions: input.actions,
      summary: input.summary,
    };
  }
}
