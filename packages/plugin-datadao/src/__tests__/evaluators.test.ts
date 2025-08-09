import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { reflectionEvaluator } from '../evaluators/reflection';
import { createMockMemory, createMockRuntime, createMockState } from './test-utils';
import type { MockRuntime } from './test-utils';
import {
  type IAgentRuntime,
  type Memory,
  type State,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';

// Mock parseKeyValueXml
mock.module('@elizaos/core', () => ({
  ...require('@elizaos/core'),
  parseKeyValueXml: mock(),
}));

describe('DataDAO Reflection Evaluator', () => {
  let mockRuntime: MockRuntime;
  let mockMessage: Partial<Memory>;
  let mockState: Partial<State>;

  beforeEach(() => {
    mock.restore();

    mockRuntime = createMockRuntime({
      useModel: mock().mockResolvedValue('<response><thought>Test thought</thought></response>'),
      getMemories: mock().mockResolvedValue([]),
      addEmbeddingToMemory: mock().mockResolvedValue({ id: 'test-id' }),
      createMemory: mock().mockResolvedValue(undefined),
      setCache: mock().mockResolvedValue(undefined),
    });

    mockMessage = createMockMemory({
      roomId: 'test-room-id',
      entityId: 'test-user-id',
      agentId: 'test-agent-id',
    });

    mockState = createMockState();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should have correct evaluator properties', () => {
    expect(reflectionEvaluator).toHaveProperty('name');
    expect(reflectionEvaluator.name).toBe('DATADAO_REFLECTION');
    expect(reflectionEvaluator).toHaveProperty('description');
    expect(reflectionEvaluator).toHaveProperty('handler');
    expect(reflectionEvaluator).toHaveProperty('validate');
    expect(typeof reflectionEvaluator.handler).toBe('function');
    expect(typeof reflectionEvaluator.validate).toBe('function');
  });

  it('should call the model with the correct prompt', async () => {
    // Mock parseKeyValueXml to return a valid response
    (parseKeyValueXml as any).mockReturnValue({
      thought: 'Test reflection thought',
      personaInsight1: 'User likes coffee',
      personaDimension1: 'characteristic',
      personaEvidence1: 'User mentioned loving coffee',
    });

    await reflectionEvaluator.handler(
      mockRuntime as IAgentRuntime,
      mockMessage as Memory,
      mockState as State
    );

    expect(mockRuntime.useModel).toHaveBeenCalledWith(
      ModelType.TEXT_SMALL,
      expect.objectContaining({
        prompt: expect.any(String),
      })
    );

    expect(mockRuntime.setCache).toHaveBeenCalledWith(
      `${mockMessage.roomId}-datadao-reflection-last-processed`,
      mockMessage.id
    );
  });

  it('should store persona insights', async () => {
    // Mock parseKeyValueXml to return persona insights
    (parseKeyValueXml as any).mockReturnValue({
      thought: 'Test reflection thought',
      personaInsight1: 'User is a software engineer',
      personaDimension1: 'experience',
      personaEvidence1: 'User mentioned working in tech',
      personaInsight2: 'User lives in San Francisco',
      personaDimension2: 'demographic',
      personaEvidence2: 'User said they work remotely from SF',
    });

    await reflectionEvaluator.handler(
      mockRuntime as IAgentRuntime,
      mockMessage as Memory,
      mockState as State
    );

    // Should store persona insights
    expect(mockRuntime.addEmbeddingToMemory).toHaveBeenCalledTimes(3); // 2 persona insights + 1 thought
    expect(mockRuntime.createMemory).toHaveBeenCalledTimes(3);
  });

  it('should handle model errors without crashing', async () => {
    // Mock the model to throw an error
    mockRuntime.useModel = mock().mockRejectedValue(new Error('Model error'));

    // Should not throw
    await expect(async () => {
      await reflectionEvaluator.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State
      );
    }).not.toThrow();
  });

  it('should validate correctly based on message count', async () => {
    // Mock getCache to return no previous message
    mockRuntime.getCache = mock().mockResolvedValue(null);
    
    // Mock getMemories to return enough messages to trigger reflection
    mockRuntime.getMemories = mock().mockResolvedValue([
      { id: 'message-1' },
      { id: 'message-2' },
      { id: 'message-3' },
      { id: 'message-4' },
      { id: 'message-5' },
      { id: 'message-6' },
      { id: 'message-7' },
    ]);

    const validationResult = await reflectionEvaluator.validate(
      mockRuntime as IAgentRuntime,
      mockMessage as Memory
    );

    expect(validationResult).toBe(true);
    expect(mockRuntime.getCache).toHaveBeenCalledWith(
      `${mockMessage.roomId}-datadao-reflection-last-processed`
    );
  });

  it('should not validate when not enough messages', async () => {
    // Mock getCache to return no previous message
    mockRuntime.getCache = mock().mockResolvedValue(null);
    
    // Mock getMemories to return fewer messages
    mockRuntime.getMemories = mock().mockResolvedValue([
      { id: 'message-1' },
      { id: 'message-2' },
      { id: 'message-3' },
    ]);

    const validationResult = await reflectionEvaluator.validate(
      mockRuntime as IAgentRuntime,
      mockMessage as Memory
    );

    expect(validationResult).toBe(false);
  });

  it('should handle empty model response', async () => {
    // Mock the model to return empty response
    mockRuntime.useModel = mock().mockResolvedValue('');

    // Should not throw
    await expect(async () => {
      await reflectionEvaluator.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State
      );
    }).not.toThrow();

    // Should not call setCache if response is empty
    expect(mockRuntime.setCache).not.toHaveBeenCalled();
  });

  it('should handle invalid XML response', async () => {
    // Mock the model to return invalid XML
    mockRuntime.useModel = mock().mockResolvedValue('invalid xml response');
    (parseKeyValueXml as any).mockReturnValue(null);

    // Should not throw
    await expect(async () => {
      await reflectionEvaluator.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State
      );
    }).not.toThrow();

    // Should not call setCache if XML parsing fails
    expect(mockRuntime.setCache).not.toHaveBeenCalled();
  });
});