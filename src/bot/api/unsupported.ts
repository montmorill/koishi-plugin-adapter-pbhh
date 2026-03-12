import { Universal } from 'koishi';
import { PbhhBotWithAPI } from './api';
export class PbhhBotWithUnsupported extends PbhhBotWithAPI
{
  async sendPrivateMessage(...args: unknown[]): Promise<string[]>
  {
    this.log.debug('PBHH 适配器不支持 sendPrivateMessage 方法');
    return [];
  }
  async createDirectChannel(...args: unknown[]): Promise<never>
  {
    this.log.debug('PBHH 适配器不支持 createDirectChannel 方法');
    throw new Error('PBHH 适配器不支持创建私聊频道');
  }
  async getFriendList(...args: unknown[]): Promise<Universal.List<Universal.User>>
  {
    this.log.debug('PBHH 适配器不支持 getFriendList 方法');
    return { data: [] };
  }
  async *getFriendIter(...args: unknown[]): AsyncIterable<Universal.User>
  {
    this.log.debug('PBHH 适配器不支持 getFriendIter 方法');
  }
  async handleFriendRequest(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 handleFriendRequest 方法');
  }
  async handleGuildRequest(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 handleGuildRequest 方法');
  }
  async createChannel(...args: unknown[]): Promise<never>
  {
    this.log.debug('PBHH 适配器不支持 createChannel 方法');
    throw new Error('PBHH 适配器不支持创建频道');
  }
  async updateChannel(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 updateChannel 方法');
  }
  async deleteChannel(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 deleteChannel 方法');
  }
  async kickGuildMember(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 kickGuildMember 方法');
  }
  async muteGuildMember(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 muteGuildMember 方法');
  }
  async handleGuildMemberRequest(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 handleGuildMemberRequest 方法');
  }
  async getGuildRoleList(...args: unknown[]): Promise<Universal.List<Universal.GuildRole>>
  {
    this.log.debug('PBHH 适配器不支持 getGuildRoleList 方法');
    return { data: [] };
  }
  async *getGuildRoleIter(...args: unknown[]): AsyncIterable<Universal.GuildRole>
  {
    this.log.debug('PBHH 适配器不支持 getGuildRoleIter 方法');
  }
  async createGuildRole(...args: unknown[]): Promise<never>
  {
    this.log.debug('PBHH 适配器不支持 createGuildRole 方法');
    throw new Error('PBHH 适配器不支持创建角色');
  }
  async updateGuildRole(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 updateGuildRole 方法');
  }
  async deleteGuildRole(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 deleteGuildRole 方法');
  }
  async setGuildMemberRole(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 setGuildMemberRole 方法');
  }
  async unsetGuildMemberRole(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 unsetGuildMemberRole 方法');
  }
  async createReaction(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 createReaction 方法');
  }
  async deleteReaction(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 deleteReaction 方法');
  }
  async clearReaction(...args: unknown[]): Promise<void>
  {
    this.log.debug('PBHH 适配器不支持 clearReaction 方法');
  }
  async *getReactionIter(...args: unknown[]): AsyncIterable<Universal.User>
  {
    this.log.debug('PBHH 适配器不支持 getReactionIter 方法');
  }
  async broadcast(...args: unknown[]): Promise<string[]>
  {
    this.log.debug('PBHH 适配器不支持 broadcast 方法');
    return [];
  }
}
