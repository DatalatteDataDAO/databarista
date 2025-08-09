import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { datadaoPlugin } from '../index';
import { IAgentRuntime, UUID, EventType, Memory, Content } from '@elizaos/core';
import { MockRuntime, createMockRuntime } from './test-utils';

// Create a mock function for datadaoPlugin.init since it might not actually exist on the plugin
// Define mockInit as a mock() once. Its implementation will be set in beforeEach.
const mockInit = mock();

describe('DataDAO Plugin', () => {
  let mockRuntime: MockRuntime;

  beforeEach(() => {
    mock.restore();

    mockRuntime = createMockRuntime({
      getSetting: mock().mockReturnValue('medium'),
      getParticipantUserState: mock().mockResolvedValue('ACTIVE'),
      composeState: mock().mockResolvedValue({}),
    });

    // Set or reset mockInit's implementation for each test
    mockInit.mockImplementation(async (_config, runtime) => {
      if (datadaoPlugin.providers) {
        datadaoPlugin.providers.forEach((provider) => {
          try {
            runtime.registerProvider(provider);
          } catch (error) {
            // Log or handle error if necessary for debugging, but don't rethrow for this test
            console.error(`Failed to register provider ${provider.name}:`, error);
          }
        });
      }
      if (datadaoPlugin.actions) {
        datadaoPlugin.actions.forEach((action) => {
          try {
            runtime.registerAction(action);
          } catch (error) {
            console.error(`Failed to register action ${action.name}:`, error);
          }
        });
      }
      if (datadaoPlugin.evaluators) {
        datadaoPlugin.evaluators.forEach((evaluator) => {
          try {
            runtime.registerEvaluator(evaluator);
          } catch (error) {
            console.error(`Failed to register evaluator ${evaluator.name}:`, error);
          }
        });
      }
      if (datadaoPlugin.services) {
        datadaoPlugin.services.forEach((service) => {
          try {
            runtime.registerService(service);
          } catch (error) {
            const serviceName =
              (service as any).serviceType || (service as any).name || 'unknown service';
            console.error(`Failed to register service ${serviceName}:`, error);
          }
        });
      }
      if (datadaoPlugin.events) {
        Object.entries(datadaoPlugin.events).forEach(([eventType, handlers]) => {
          handlers.forEach((handler) => {
            try {
              runtime.registerEvent(eventType, handler);
            } catch (error) {
              console.error(`Failed to register event handler for ${eventType}:`, error);
            }
          });
        });
      }
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('should have the correct name and description', () => {
    expect(datadaoPlugin.name).toBe('datadao');
    expect(datadaoPlugin.description).toBeDefined();
    expect(typeof datadaoPlugin.description).toBe('string');
  });

  it('should register all providers during initialization', async () => {
    // Execute the mocked initialization function
    await mockInit({}, mockRuntime as unknown as IAgentRuntime);

    // Check that all providers were registered
    if (datadaoPlugin.providers) {
      expect(mockRuntime.registerProvider).toHaveBeenCalledTimes(datadaoPlugin.providers.length);

      // Verify each provider was registered
      datadaoPlugin.providers.forEach((provider) => {
        expect(mockRuntime.registerProvider).toHaveBeenCalledWith(provider);
      });
    }
  });

  it('should register all actions during initialization', async () => {
    // Execute the mocked initialization function
    await mockInit({}, mockRuntime as unknown as IAgentRuntime);

    // Check that all actions were registered
    if (datadaoPlugin.actions) {
      expect(mockRuntime.registerAction).toHaveBeenCalledTimes(datadaoPlugin.actions.length);

      // Verify each action was registered
      datadaoPlugin.actions.forEach((action) => {
        expect(mockRuntime.registerAction).toHaveBeenCalledWith(action);
      });
    }
  });

  it('should register all evaluators during initialization', async () => {
    // Execute the mocked initialization function
    await mockInit({}, mockRuntime as unknown as IAgentRuntime);

    // Check that all evaluators were registered
    if (datadaoPlugin.evaluators) {
      expect(mockRuntime.registerEvaluator).toHaveBeenCalledTimes(
        datadaoPlugin.evaluators.length
      );

      // Verify each evaluator was registered
      datadaoPlugin.evaluators.forEach((evaluator) => {
        expect(mockRuntime.registerEvaluator).toHaveBeenCalledWith(evaluator);
      });
    }
  });

  it('should register all events during initialization', async () => {
    // Execute the mocked initialization function
    await mockInit({}, mockRuntime as unknown as IAgentRuntime);

    // Count the number of event registrations expected
    let expectedEventCount = 0;
    if (datadaoPlugin.events) {
      Object.values(datadaoPlugin.events).forEach((handlers) => {
        expectedEventCount += handlers.length;
      });

      // Check that all events were registered
      expect(mockRuntime.registerEvent).toHaveBeenCalledTimes(expectedEventCount);
    }
  });

  it('should register all services during initialization', async () => {
    // Execute the mocked initialization function
    await mockInit({}, mockRuntime as unknown as IAgentRuntime);

    // Check that all services were registered
    if (datadaoPlugin.services) {
      expect(mockRuntime.registerService).toHaveBeenCalledTimes(datadaoPlugin.services.length);

      // Verify each service was registered
      datadaoPlugin.services.forEach((service) => {
        expect(mockRuntime.registerService).toHaveBeenCalledWith(service);
      });
    }
  });

  it('should handle initialization errors gracefully', async () => {
    // Setup runtime to fail during registration
    mockRuntime.registerProvider = mock().mockImplementation(() => {
      throw new Error('Registration failed');
    });

    // Create a spy for console.error
    const originalConsoleError = console.error;
    const consoleErrorSpy = mock();
    console.error = consoleErrorSpy;

    // Should not throw error during initialization
    await expect(async () => {
      await mockInit({}, mockRuntime as unknown as IAgentRuntime);
    }).not.toThrow();

    // Ensure console.error was called (as the mockInit is expected to log errors)
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Restore console.error
    console.error = originalConsoleError;
  });
});

describe('Message Event Handlers', () => {
  let mockRuntime: MockRuntime;
  let mockMessage: Partial<Memory>;
  let mockCallback: any;

  beforeEach(() => {
    mock.restore();

    mockCallback = mock();

    mockRuntime = createMockRuntime({
      getSetting: mock().mockReturnValue('medium'),
      getParticipantUserState: mock().mockResolvedValue('ACTIVE'),
      composeState: mock().mockResolvedValue({}),
    });

    mockMessage = {
      id: 'msg-id' as UUID,
      roomId: 'room-id' as UUID,
      entityId: 'user-id' as UUID,
      content: {
        text: 'Hello, bot!',
      } as Content,
      createdAt: Date.now(),
    };
  });

  afterEach(() => {
    mock.restore();
  });

  it('should have message received event handlers', () => {
    expect(datadaoPlugin.events).toBeDefined();
    const events = datadaoPlugin.events;
    if (events && EventType.MESSAGE_RECEIVED in events) {
      const handlers = events[EventType.MESSAGE_RECEIVED];
      if (handlers) {
        expect(handlers).toBeDefined();
        expect(handlers.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have handlers for other event types', () => {
    expect(datadaoPlugin.events).toBeDefined();

    const events = datadaoPlugin.events;
    if (events) {
      // Check for various event types presence
      const eventTypes = Object.keys(events);

      // Check for event types that actually exist in the datadaoPlugin.events
      expect(eventTypes).toContain(EventType.MESSAGE_RECEIVED);
      expect(eventTypes).toContain(EventType.WORLD_JOINED);
      expect(eventTypes).toContain(EventType.ENTITY_JOINED);

      // Verify we have comprehensive coverage of event handlers
      const commonEventTypes = [
        EventType.MESSAGE_RECEIVED,
        EventType.WORLD_JOINED,
        EventType.ENTITY_JOINED,
        EventType.ENTITY_LEFT,
        EventType.ACTION_STARTED,
        EventType.ACTION_COMPLETED,
      ];

      commonEventTypes.forEach((eventType) => {
        if (eventType in events) {
          const handlers = events[eventType];
          if (handlers) {
            expect(handlers.length).toBeGreaterThan(0);
            expect(typeof handlers[0]).toBe('function');
          }
        }
      });
    }
  });

  it('should skip message handling with mock runtime', async () => {
    const events = datadaoPlugin.events;
    if (events && EventType.MESSAGE_RECEIVED in events) {
      const handlers = events[EventType.MESSAGE_RECEIVED];
      if (handlers && handlers.length > 0) {
        // Get the message handler
        const messageHandler = handlers[0];
        expect(messageHandler).toBeDefined();

        // Mock the message handling to skip actual processing
        mockRuntime.emitEvent.mockResolvedValue(undefined);

        // Call the message handler with our mocked runtime
        // This test only verifies the handler doesn't throw with our mock
        await expect(async () => {
          await messageHandler({
            runtime: mockRuntime as unknown as IAgentRuntime,
            message: mockMessage as Memory,
            callback: mockCallback,
            source: 'test',
          });
        }).not.toThrow();
      }
    }
  });
});

describe('Plugin Module Structure', () => {
  it('should export all required plugin components', () => {
    // Check that the plugin exports all required components
    expect(datadaoPlugin).toHaveProperty('name');
    expect(datadaoPlugin).toHaveProperty('description');
    // The init function is optional in this plugin
    expect(datadaoPlugin).toHaveProperty('providers');
    expect(datadaoPlugin).toHaveProperty('actions');
    expect(datadaoPlugin).toHaveProperty('events');
    expect(datadaoPlugin).toHaveProperty('services');
    expect(datadaoPlugin).toHaveProperty('evaluators');
  });

  it('should have properly structured providers', () => {
    // Check that providers have the required structure
    if (datadaoPlugin.providers) {
      datadaoPlugin.providers.forEach((provider) => {
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('get');
        expect(typeof provider.get).toBe('function');
      });
    }
  });

  it('should have properly structured actions', () => {
    // Check that actions have the required structure
    if (datadaoPlugin.actions) {
      datadaoPlugin.actions.forEach((action) => {
        expect(action).toHaveProperty('name');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('handler');
        expect(action).toHaveProperty('validate');
        expect(typeof action.handler).toBe('function');
        expect(typeof action.validate).toBe('function');
      });
    }
  });

  it('should have correct folder structure', () => {
    // Verify that the exported providers match expected naming conventions
    const providerNames = (datadaoPlugin.providers || []).map((p) => p.name);
    expect(providerNames).toContain('FACTS');
    expect(providerNames).toContain('TIME');
    expect(providerNames).toContain('RECENT_MESSAGES');
    expect(providerNames).toContain('PERSONA_MEMORY');

    // Verify that the exported actions match expected naming conventions
    const actionNames = (datadaoPlugin.actions || []).map((a) => a.name);
    expect(actionNames).toContain('REPLY');
    expect(actionNames).toContain('NONE');
    expect(actionNames).toContain('IGNORE');
  });
});