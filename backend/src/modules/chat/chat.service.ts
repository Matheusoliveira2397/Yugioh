import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
  ) {}

  async createMessage(data: {
    userId: string;
    username: string;
    content: string;
    channel: string;
  }): Promise<Message> {
    try {
      const message = new this.messageModel(data);
      const savedMessage = await message.save();
      console.log(`✅ [ChatService] Mensagem salva no MongoDB:`, { id: savedMessage._id, channel: data.channel });
      return savedMessage;
    } catch (error) {
      console.error(`❌ [ChatService] Erro ao salvar mensagem no MongoDB:`, error);
      // Retornar um objeto mock se MongoDB falhar, para não quebrar o chat
      return {
        _id: Date.now().toString(),
        userId: data.userId,
        username: data.username,
        content: data.content,
        channel: data.channel,
        createdAt: new Date(),
      } as any;
    }
  }

  async getMessages(channel: string, limit = 50): Promise<Message[]> {
    try {
      const messages = await this.messageModel
        .find({ channel })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      console.log(`✅ [ChatService] ${messages.length} mensagens carregadas do MongoDB para canal ${channel}`);
      return messages;
    } catch (error) {
      console.error(`❌ [ChatService] Erro ao carregar mensagens do MongoDB para canal ${channel}:`, error);
      // Retornar array vazio se MongoDB falhar
      return [];
    }
  }

  async getPrivateMessages(
    userId1: string,
    userId2: string,
    limit = 50,
  ): Promise<Message[]> {
    return this.messageModel
      .find({
        $or: [
          { userId: userId1, recipientId: userId2 },
          { userId: userId2, recipientId: userId1 },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
