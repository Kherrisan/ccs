/**
 * WebSocket Handler (Phase 04)
 *
 * Manages WebSocket connections, broadcasts file changes, and handles client messages.
 * Also broadcasts project selection events during OAuth flows.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createFileWatcher, FileChangeEvent } from './file-watcher';
import {
  projectSelectionEvents,
  type ProjectSelectionPrompt,
} from '../cliproxy/project-selection-handler';
import { deviceCodeEvents, type DeviceCodePrompt } from '../cliproxy/device-code-handler';
import { createLogger } from '../services/logging';

const logger = createLogger('web-server:websocket');

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export function setupWebSocket(wss: WebSocketServer): { cleanup: () => void } {
  // Track connected clients
  const clients = new Set<WebSocket>();

  // Broadcast message to all clients
  function broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // Handle new connections
  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info('client.connected', 'WebSocket client connected', { clients: clients.size });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch {
        logger.warn('message.invalid', 'WebSocket client sent invalid JSON');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(ws);
      logger.info('client.disconnected', 'WebSocket client disconnected', {
        clients: clients.size,
      });
    });

    ws.on('error', (err) => {
      logger.warn('client.error', 'WebSocket client error', { message: err.message });
      clients.delete(ws);
    });
  });

  // Handle incoming client messages
  function handleClientMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'subscribe':
        // Future: selective subscriptions
        break;
      default:
        logger.warn('message.unknown', 'WebSocket client sent unknown message type', {
          type: String(message.type),
        });
    }
  }

  // Setup file watcher
  const watcher = createFileWatcher((event: FileChangeEvent) => {
    logger.debug('file.changed', 'Dashboard file watcher detected a change', { ...event });
    broadcast({
      type: event.type,
      path: event.path,
      timestamp: event.timestamp,
    });
  });

  // Listen for project selection events and broadcast to clients
  const handleProjectSelectionRequired = (prompt: ProjectSelectionPrompt): void => {
    logger.info('project-selection.required', 'Broadcasting project selection prompt', {
      sessionId: prompt.sessionId,
    });
    broadcast({
      type: 'projectSelectionRequired',
      ...prompt,
      timestamp: Date.now(),
    });
  };

  const handleProjectSelectionTimeout = (sessionId: string): void => {
    logger.info('project-selection.timeout', 'Project selection prompt timed out', { sessionId });
    broadcast({
      type: 'projectSelectionTimeout',
      sessionId,
      timestamp: Date.now(),
    });
  };

  const handleProjectSelectionSubmitted = (response: {
    sessionId: string;
    selectedId: string;
  }): void => {
    logger.info('project-selection.submitted', 'Project selection submitted', response);
    broadcast({
      type: 'projectSelectionSubmitted',
      ...response,
      timestamp: Date.now(),
    });
  };

  // Listen for device code events and broadcast to clients
  const handleDeviceCodeReceived = (prompt: DeviceCodePrompt): void => {
    logger.info('device-code.received', 'Broadcasting device code prompt', {
      sessionId: prompt.sessionId,
    });
    broadcast({
      type: 'deviceCodeReceived',
      ...prompt,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeCompleted = (sessionId: string): void => {
    logger.info('device-code.completed', 'Device code auth completed', { sessionId });
    broadcast({
      type: 'deviceCodeCompleted',
      sessionId,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeFailed = (data: { sessionId: string; error?: string }): void => {
    logger.warn('device-code.failed', 'Device code auth failed', data);
    broadcast({
      type: 'deviceCodeFailed',
      ...data,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeExpired = (sessionId: string): void => {
    logger.info('device-code.expired', 'Device code expired', { sessionId });
    broadcast({
      type: 'deviceCodeExpired',
      sessionId,
      timestamp: Date.now(),
    });
  };

  // Subscribe to project selection events
  projectSelectionEvents.on('selection:required', handleProjectSelectionRequired);
  projectSelectionEvents.on('selection:timeout', handleProjectSelectionTimeout);
  projectSelectionEvents.on('selection:submitted', handleProjectSelectionSubmitted);

  // Subscribe to device code events
  deviceCodeEvents.on('deviceCode:received', handleDeviceCodeReceived);
  deviceCodeEvents.on('deviceCode:completed', handleDeviceCodeCompleted);
  deviceCodeEvents.on('deviceCode:failed', handleDeviceCodeFailed);
  deviceCodeEvents.on('deviceCode:expired', handleDeviceCodeExpired);

  // Cleanup function
  const cleanup = (): void => {
    watcher.close();

    // Unsubscribe from project selection events
    projectSelectionEvents.off('selection:required', handleProjectSelectionRequired);
    projectSelectionEvents.off('selection:timeout', handleProjectSelectionTimeout);
    projectSelectionEvents.off('selection:submitted', handleProjectSelectionSubmitted);

    // Unsubscribe from device code events
    deviceCodeEvents.off('deviceCode:received', handleDeviceCodeReceived);
    deviceCodeEvents.off('deviceCode:completed', handleDeviceCodeCompleted);
    deviceCodeEvents.off('deviceCode:failed', handleDeviceCodeFailed);
    deviceCodeEvents.off('deviceCode:expired', handleDeviceCodeExpired);

    clients.forEach((client) => {
      client.close(1001, 'Server shutting down');
    });
    clients.clear();
  };

  return { cleanup };
}
