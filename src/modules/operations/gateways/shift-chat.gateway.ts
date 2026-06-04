import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOptions } from '../../../config/cors';
import { AccessService } from '../../access/services/access.service';
import { AuthTokenService } from '../../auth/services/auth-token.service';
import { CreateShiftChatMessageDto } from '../dto/create-shift-chat-message.dto';
import { ShiftChatService } from '../services/shift-chat.service';

@WebSocketGateway({
  namespace: '/shift-chat',
  cors: corsOptions(),
})
export class ShiftChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly accessService: AccessService,
    private readonly shiftChat: ShiftChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const actor = await this.resolveActor(client);
      client.data.actor = actor;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('shift-chat:join')
  async joinShift(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { shiftId?: string },
  ) {
    const shiftId = (body?.shiftId || '').trim();
    await this.shiftChat.assertActorCanAccessShift(client.data.actor, shiftId);
    await client.join(this.roomName(shiftId));
    client.emit('shift-chat:joined', { shiftId });
  }

  @SubscribeMessage('shift-chat:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: CreateShiftChatMessageDto & { shiftId?: string },
  ) {
    const shiftId = (body?.shiftId || '').trim();
    const message = await this.shiftChat.createMessage(client.data.actor, shiftId, body);
    this.emitShiftMessage(shiftId, message);
    return message;
  }

  emitShiftMessage(shiftId: string, message: unknown) {
    this.server.to(this.roomName(shiftId)).emit('shift-chat:message', message);
  }

  private async resolveActor(client: Socket) {
    const raw =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : typeof client.handshake.headers.authorization === 'string'
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : '';
    const payload = this.authTokenService.verifyAccessToken(raw);
    return this.accessService.getUserAccessContext(payload.sub);
  }

  private roomName(shiftId: string) {
    return `shift:${shiftId}`;
  }
}
