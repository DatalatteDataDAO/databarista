import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  ignoreAction,
  replyAction,
  noneAction,
} from '../actions';
import { createMockMemory, setupActionTest } from './test-utils';
import type { MockRuntime } from './test-utils';
import {
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  ModelType,
  logger,
} from '@elizaos/core';

describe('DataDAO Actions', () => {
  let mockRuntime: MockRuntime;
  let mockMessage: Partial<Memory>;
  let mockState: Partial<State>;
  let callbackFn: ReturnType<typeof mock>;

  beforeEach(() => {
    const setup = setupActionTest();
    mockRuntime = setup.mockRuntime;
    mockMessage = setup.mockMessage;
    mockState = setup.mockState;
    callbackFn = setup.callbackFn;
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Ignore Action', () => {
    it('should validate ignore action', async () => {
      const isValid = await ignoreAction.validate(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory
      );
      expect(isValid).toBe(true);
    });

    it('should handle ignore action successfully', async () => {
      await ignoreAction.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State,
        callbackFn as HandlerCallback
      );

      expect(callbackFn).toHaveBeenCalledWith({
        text: '',
        action: 'IGNORE',
      });
    });
  });

  describe('None Action', () => {
    it('should validate none action', async () => {
      const isValid = await noneAction.validate(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory
      );
      expect(isValid).toBe(true);
    });

    it('should handle none action successfully', async () => {
      await noneAction.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State,
        callbackFn as HandlerCallback
      );

      expect(callbackFn).toHaveBeenCalledWith({
        text: '',
        action: 'NONE',
      });
    });
  });

  describe('Reply Action', () => {
    it('should validate reply action', async () => {
      const isValid = await replyAction.validate(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory
      );
      expect(isValid).toBe(true);
    });

    it('should handle reply action successfully', async () => {
      // Mock the model response
      mockRuntime.useModel = mock().mockResolvedValue('This is a test reply');

      await replyAction.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State,
        callbackFn as HandlerCallback
      );

      expect(mockRuntime.useModel).toHaveBeenCalledWith(
        ModelType.TEXT_LARGE,
        expect.objectContaining({
          prompt: expect.any(String),
        })
      );

      expect(callbackFn).toHaveBeenCalledWith({
        text: 'This is a test reply',
        action: 'REPLY',
      });
    });

    it('should handle reply action with model error', async () => {
      // Mock the model to throw an error
      mockRuntime.useModel = mock().mockRejectedValue(new Error('Model error'));

      // Spy on logger.error
      const loggerErrorSpy = spyOn(logger, 'error');

      await replyAction.handler(
        mockRuntime as IAgentRuntime,
        mockMessage as Memory,
        mockState as State,
        callbackFn as HandlerCallback
      );

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(callbackFn).toHaveBeenCalledWith({
        text: "I'm having trouble generating a response right now.",
        action: 'REPLY',
      });
    });
  });
});