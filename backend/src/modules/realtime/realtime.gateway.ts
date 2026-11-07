import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { corsOptions } from '../../config/cors';

@WebSocketGateway({
  namespace: '/realtime',
  cors: corsOptions(),
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
