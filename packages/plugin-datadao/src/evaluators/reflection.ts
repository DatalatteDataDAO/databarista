import { logger, parseKeyValueXml } from '@elizaos/core';
import { composePrompt } from '@elizaos/core';
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  type UUID,
} from '@elizaos/core';

/**
 * Template string for generating DataDAO reflection on persona insights.
 */
const reflectionTemplate = `# Task: Generate DataDAO Reflection and Extract Persona Insights

You are a DataDAO AI agent focused on understanding users through data-driven insights. Your role is to:
1. Reflect on the conversation quality and your performance
2. Extract insights about the user's persona using the PEACOCK framework

## PEACOCK Framework Dimensions:
- **demographic**: Static facts (age, gender, location, religion, environment)
- **characteristic**: Intrinsic traits, communication/attachment styles in relationships
- **routine**: Regular habits or behaviors
- **goal**: Ambitions or future plans
- **experience**: Past events or experiences
- **persona_relationship**: Social connections or interactions
- **emotional_state**: Current feelings, mood, or pain points

## Recent Conversation:
{{recentMessages}}

# Known Persona Insights:
{{knownPersonaInsights}}

# Instructions:
1. Generate a self-reflective thought on the conversation about your performance and data understanding quality.
2. Extract NEW persona insights about the user using PEACOCK dimensions that are NOT already captured in the known insights above.

For each insight, provide the description, dimension, and supporting evidence from the conversation. Only include insights that add new information not already present in the known insights.

Do NOT include any thinking, reasoning, or <think> sections in your response. 
Go directly to the XML response format without any preamble or explanation.

Generate a response in the following format:
<response>
  <thought>a self-reflective thought on the conversation and data understanding quality</thought>
  <personaInsight1>specific insight about the user</personaInsight1>
  <personaDimension1>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</personaDimension1>
  <personaEvidence1>supporting quote or reference from conversation</personaEvidence1>
  <personaInsight2>another specific insight about the user</personaInsight2>
  <personaDimension2>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</personaDimension2>
  <personaEvidence2>supporting quote or reference from conversation</personaEvidence2>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.

Note: Include only the insights you can extract from the conversation. If there are no persona insights, omit those fields. You can include up to 5 persona insights by using personaInsight1-5 patterns.`;

/**
 * Store persona insight in the appropriate graph structure
 */
async function storePersonaInsight(
  runtime: IAgentRuntime,
  agentId: UUID,
  userId: UUID,
  roomId: UUID,
  description: string,
  dimension: string
) {
  const memory = await runtime.addEmbeddingToMemory({
    entityId: userId, // Store with user's ID - the person the insight is ABOUT
    agentId, // Agent who created the insight
    content: { text: description },
    roomId,
    createdAt: Date.now(),
  });

  // Store in the appropriate table based on dimension
  const tableName = `persona_${dimension}`;
  return runtime.createMemory(memory, tableName, true);
}

async function handler(runtime: IAgentRuntime, message: Memory, state?: State) {
  const { agentId, roomId, entityId } = message;

  if (!agentId || !roomId) {
    logger.warn('Missing agentId or roomId in message', message);
    return;
  }

  // Get the user ID - for DM conversations, roomId typically equals userId
  // But we can also use entityId from the message if it's not the agent
  const userId = entityId !== agentId ? entityId : roomId;

  // Get recent messages for context
  const recentMessages = await runtime.getMemories({
    tableName: 'messages',
    roomId,
    count: 10,
    unique: false,
  });

  // Get existing persona memories to prevent duplicates
  const personaDimensions = [
    'persona_demographic',
    'persona_characteristic',
    'persona_routine',
    'persona_goal',
    'persona_experience',
    'persona_persona_relationship',
    'persona_emotional_state',
  ];

  // Fetch existing memories from all dimensions in parallel
  const existingPersonaMemories = await Promise.all(
    personaDimensions.map(async (tableName) => {
      try {
        return await runtime.getMemories({
          tableName,
          roomId,
          count: 30,
          unique: true,
        });
      } catch (error) {
        logger.warn(`Failed to get memories from ${tableName}:`, error);
        return [];
      }
    })
  ).then((results) => results.flat());

  const prompt = composePrompt({
    state: {
      ...(state?.values || {}),
      recentMessages: formatMessages(recentMessages),
      knownPersonaInsights: formatPersonaMemories(existingPersonaMemories),
    },
    template: runtime.character.templates?.reflectionTemplate || reflectionTemplate,
  });

  try {
    const response = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });

    if (!response) {
      logger.warn('DataDAO reflection failed - empty response');
      return;
    }

    // Parse XML response
    const reflection = parseKeyValueXml(response);

    if (!reflection) {
      logger.warn('DataDAO reflection failed - failed to parse XML', response);
      return;
    }

    // Extract persona insights (up to 5)
    const personaInsights: Array<{ description: string; dimension: string; evidence: string }> = [];
    for (let i = 1; i <= 5; i++) {
      const insight = reflection[`personaInsight${i}`];
      const dimension = reflection[`personaDimension${i}`];
      const evidence = reflection[`personaEvidence${i}`];

      if (insight && dimension && evidence) {
        // Check if this insight is too similar to existing ones
        const isDuplicate = existingPersonaMemories.some((existing) => {
          if (!existing.content?.text) return false;

          const existingText = existing.content.text.toLowerCase();
          const newInsight = insight.toLowerCase();

          // Check for substantial overlap (more than 15 characters)
          const minLength = Math.min(existingText.length, newInsight.length);
          if (minLength < 15) return false;

          const overlapThreshold = Math.min(20, Math.floor(minLength * 0.6));

          return (
            existingText.includes(newInsight.substring(0, overlapThreshold)) ||
            newInsight.includes(existingText.substring(0, overlapThreshold)) ||
            existingText === newInsight
          );
        });

        if (!isDuplicate) {
          personaInsights.push({ description: insight, dimension, evidence });
        } else {
          logger.debug(`Skipping duplicate persona insight: ${insight}`);
        }
      }
    }

    // Store persona insights
    await Promise.all(
      personaInsights.map(async (insight) => {
        try {
          return await storePersonaInsight(
            runtime,
            agentId,
            userId,
            roomId,
            insight.description,
            insight.dimension
          );
        } catch (error) {
          logger.error('Error storing persona insight:', error);
        }
      })
    );

    // Store reflection thought (this can stay with agentId since it's the agent's reflection)
    if (reflection.thought) {
      try {
        const thoughtMemory = await runtime.addEmbeddingToMemory({
          entityId: agentId, // Agent's reflection about their own performance
          agentId,
          content: { text: reflection.thought },
          roomId,
          createdAt: Date.now(),
        });
        await runtime.createMemory(thoughtMemory, 'reflections', true);
      } catch (error) {
        logger.error('Error storing reflection thought:', error);
      }
    }

    await runtime.setCache<string>(
      `${message.roomId}-datadao-reflection-last-processed`,
      message?.id || ''
    );

    logger.info(`DataDAO reflection processed: ${personaInsights.length} persona insights`);
  } catch (error) {
    logger.error('Error in DataDAO reflection handler:', error);
    return;
  }
}

export const reflectionEvaluator: Evaluator = {
  name: 'DATADAO_REFLECTION',
  similes: ['DATADAO_REFLECT', 'PERSONA_EXTRACT', 'INSIGHT_GATHER'],
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const lastMessageId = await runtime.getCache<string>(
      `${message.roomId}-datadao-reflection-last-processed`
    );
    const messages = await runtime.getMemories({
      tableName: 'messages',
      roomId: message.roomId,
      count: runtime.getConversationLength(),
    });

    if (lastMessageId) {
      const lastMessageIndex = messages.findIndex((msg) => msg.id === lastMessageId);
      if (lastMessageIndex !== -1) {
        messages.splice(0, lastMessageIndex + 1);
      }
    }

    // Trigger reflection every 5-7 messages for DataDAO insights
    const reflectionInterval = 6;
    return messages.length >= reflectionInterval;
  },
  description:
    'Generate DataDAO reflection on conversation quality and extract persona insights using PEACOCK framework.',
  handler,
  examples: [
    {
      prompt: `Recent conversation between DataDAO agent and user about their work:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I've been working as a software engineer for 5 years now. I really enjoy backend development.",
          },
        },
        {
          name: 'DataDAO',
          content: {
            text: "That's great experience! What technologies do you primarily work with in backend development?",
          },
        },
        {
          name: 'User',
          content: {
            text: 'Mostly Python and Node.js. I work remotely from San Francisco and love the flexibility it gives me.',
          },
        },
      ],
      outcome: `<response>
    <thought>I'm successfully gathering structured data about the user's professional background and preferences. The conversation is flowing naturally and I'm extracting valuable persona insights about their career and location.</thought>
    <personaInsight1>User is a software engineer with 5 years of experience</personaInsight1>
    <personaDimension1>experience</personaDimension1>
    <personaEvidence1>"I've been working as a software engineer for 5 years now"</personaEvidence1>
    <personaInsight2>User specializes in backend development</personaInsight2>
    <personaDimension2>characteristic</personaDimension2>
    <personaEvidence2>"I really enjoy backend development"</personaEvidence2>
    <personaInsight3>User is located in San Francisco</personaInsight3>
    <personaDimension3>demographic</personaDimension3>
    <personaEvidence3>"I work remotely from San Francisco"</personaEvidence3>
    <personaInsight4>User works remotely and values flexibility</personaInsight4>
    <personaDimension4>routine</personaDimension4>
    <personaEvidence4>"I work remotely from San Francisco and love the flexibility it gives me"</personaEvidence4>
</response>`,
    },
    {
      prompt: `Recent conversation between DataDAO agent and user about their goals:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I'm thinking about starting my own tech startup next year. I want to focus on AI applications.",
          },
        },
        {
          name: 'DataDAO',
          content: { text: 'That sounds exciting! What specific area of AI interests you most?' },
        },
        {
          name: 'User',
          content: {
            text: "I'm really passionate about natural language processing. I think there's huge potential there.",
          },
        },
      ],
      outcome: `<response>
    <thought>The user is sharing important future goals and specific interests. I'm capturing valuable data about their entrepreneurial aspirations and technical focus areas. This information will help build a comprehensive persona profile.</thought>
    <personaInsight1>User plans to start a tech startup next year</personaInsight1>
    <personaDimension1>goal</personaDimension1>
    <personaEvidence1>"I'm thinking about starting my own tech startup next year"</personaEvidence1>
    <personaInsight2>User wants to focus on AI applications in their startup</personaInsight2>
    <personaDimension2>goal</personaDimension2>
    <personaEvidence2>"I want to focus on AI applications"</personaEvidence2>
    <personaInsight3>User is passionate about natural language processing</personaInsight3>
    <personaDimension3>characteristic</personaDimension3>
    <personaEvidence3>"I'm really passionate about natural language processing"</personaEvidence3>
</response>`,
    },
  ],
};

// Helper function to format messages for context
function formatMessages(messages: Memory[]) {
  return messages
    .reverse()
    .map((msg: Memory) => {
      const sender = msg.entityId === msg.agentId ? 'DataDAO' : 'User';
      return `${sender}: ${msg.content.text}`;
    })
    .join('\n');
}

// Helper function to format persona memories for context
function formatPersonaMemories(memories: Memory[]) {
  if (memories.length === 0) {
    return 'No persona insights recorded yet.';
  }
  return memories
    .filter((memory: Memory) => memory.content?.text)
    .map((memory: Memory) => memory.content.text)
    .join('\n');
}
