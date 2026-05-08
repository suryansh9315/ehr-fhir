import Groq from 'groq-sdk';

export const EXTRACT_CLINICAL_ACTIONS_TOOL: Groq.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_clinical_actions',
    description:
      "Extract structured clinical actions from a doctor's note. Call this tool with ALL identified actions. Only extract actions explicitly stated in the note.",
    parameters: {
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
                description:
                  'Category of clinical action. Use one of: medication_change, new_medication, discontinue_medication, follow_up, referral, lab_order, imaging_order, patient_instruction, dietary_restriction, activity_restriction',
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
                description: 'Clinical urgency: routine, urgent, stat, or conditional',
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
  },
};
