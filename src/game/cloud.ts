// 云服务配置与客户端（联机房间使用）
// 这些值来自当前应用开通云服务后返回的 publicConfig，属于可公开的前端配置。
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

export const publicConfig = {
  resourceId: 'wbcs_eG7OOVzq1B361uDbGtSnz7',
  endpoint: 'https://xiangqi-chess-app.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_ss745j0QT02TrEIXGJ5RDt_ScVIzMzcaI2IGeelklEY5iDD0MV7diyC',
};

export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
});
