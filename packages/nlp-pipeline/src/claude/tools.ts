import Anthropic from '@anthropic-ai/sdk';

export const EXTRACT_CLINICAL_ACTIONS_TOOL: Anthropic.Tool = {
  name: 'extract_clinical_actions',
  description:
    "Extract structured clinical actions from a doctor's note. Call this tool with ALL identified actions. Only extract actions explicitly stated in the note.",
  input_schema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        description: 'List of all clinical actions found in the note',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'medication_change',
                'new_medication',
                'discontinue_medication',
                'follow_up',
                'referral',
                'lab_order',
                'imaging_order',
                'patient_instruction',
                'dietary_restriction',
                'activity_restriction',
              ],
              description: 'Category of clinical action',
            },
            details: {
              type: 'object',
              description:
                'Type-specific details. For medication actions: medication_name, previous_dosage, new_dosage. For follow_up: specialty, timeframe. For referral: service. For instructions: instruction_text.',
            },
            verbatim_source: {
              type: 'string',
              description: 'The exact verbatim text from the note that supports this action',
            },
            urgency: {
              type: 'string',
              enum: ['routine', 'urgent', 'stat', 'conditional'],
              description: 'Clinical urgency of this action',
            },
          },
          required: ['type', 'details', 'verbatim_source', 'urgency'],
        },
      },
      summary: {
        type: 'string',
        description: 'One-sentence clinical summary of the entire note',
      },
    },
    required: ['actions', 'summary'],
  },
};
