import { Universal } from 'koishi';
import { PbhhBotWithAPI } from './api';

export class PbhhBotWithUnsupported extends PbhhBotWithAPI {
  async getFriendList(): Promise<Universal.List<Universal.User>> {
    this.log.debug('PBHH 适配器不支持 getFriendList 方法');
    return { data: [] };
  }

  async *getFriendIter(): AsyncIterable<Universal.User> {
    this.log.debug('PBHH 适配器不支持 getFriendIter 方法');
  }

  async handleFriendRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 handleFriendRequest 方法');
  }

  async handleGuildRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 handleGuildRequest 方法');
  }

  async createChannel(guildId: string, data: Partial<Universal.Channel>): Promise<never> {
    this.log.debug('PBHH 适配器不支持 createChannel 方法');
    throw new Error('PBHH 适配器不支持创建频道');
  }

  async updateChannel(channelId: string, data: Partial<Universal.Channel>): Promise<void> {
    this.log.debug('PBHH 适配器不支持 updateChannel 方法');
  }

  async deleteChannel(channelId: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 deleteChannel 方法');
  }

  async kickGuildMember(guildId: string, userId: string, permanent?: boolean): Promise<void> {
    this.log.debug('PBHH 适配器不支持 kickGuildMember 方法');
  }

  async muteGuildMember(guildId: string, userId: string, duration: number, reason?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 muteGuildMember 方法');
  }

  async handleGuildMemberRequest(messageId: string, approve: boolean, comment?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 handleGuildMemberRequest 方法');
  }

  async getGuildRoleList(guildId: string, next?: string): Promise<Universal.List<Universal.GuildRole>> {
    this.log.debug('PBHH 适配器不支持 getGuildRoleList 方法');
    return { data: [] };
  }

  async *getGuildRoleIter(guildId: string): AsyncIterable<Universal.GuildRole> {
    this.log.debug('PBHH 适配器不支持 getGuildRoleIter 方法');
  }

  async createGuildRole(guildId: string, data: Partial<Universal.GuildRole>): Promise<never> {
    this.log.debug('PBHH 适配器不支持 createGuildRole 方法');
    throw new Error('PBHH 适配器不支持创建角色');
  }

  async updateGuildRole(guildId: string, roleId: string, data: Partial<Universal.GuildRole>): Promise<void> {
    this.log.debug('PBHH 适配器不支持 updateGuildRole 方法');
  }

  async deleteGuildRole(guildId: string, roleId: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 deleteGuildRole 方法');
  }

  async setGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 setGuildMemberRole 方法');
  }

  async unsetGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 unsetGuildMemberRole 方法');
  }

  async createReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 createReaction 方法');
  }

  async deleteReaction(channelId: string, messageId: string, emoji: string, userId?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 deleteReaction 方法');
  }

  async clearReaction(channelId: string, messageId: string, emoji?: string): Promise<void> {
    this.log.debug('PBHH 适配器不支持 clearReaction 方法');
  }

  async *getReactionIter(channelId: string, messageId: string, emoji: string): AsyncIterable<Universal.User> {
    this.log.debug('PBHH 适配器不支持 getReactionIter 方法');
  }

  async broadcast(
    channels: Parameters<PbhhBotWithAPI['broadcast']>[0],
    content: Parameters<PbhhBotWithAPI['broadcast']>[1],
    delay?: Parameters<PbhhBotWithAPI['broadcast']>[2],
  ): Promise<string[]> {
    this.log.debug('PBHH 适配器不支持 broadcast 方法');
    return [];
  }
}
