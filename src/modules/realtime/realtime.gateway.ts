import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((x) => x.trim()) || true,
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  emitTableUpdated(table: string) {
    this.server.emit('table-updated', {
      table,
      timestamp: new Date().toISOString(),
    });
  }
}
