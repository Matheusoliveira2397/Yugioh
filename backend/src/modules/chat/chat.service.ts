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
    const message = new this.messageModel(data);
    return message.save();
  }

  async getMessages(channel: string, limit = 50): Promise<Message[]> {
    return this.messageModel
      .find({ channel })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
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
