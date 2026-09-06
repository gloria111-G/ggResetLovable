// =============================================================================
// user_data 数据同步·存取抽象层（预留）
// -----------------------------------------------------------------------------
// 设计对标微信小程序云开发数据库：数据文档按「_openid 归属用户」。
// 当前阶段（纯 Web，本机模拟）网关为 local：
//   - 不发起任何外部请求（无短信、无云函数、无远端数据库）；
//   - fetch 恒返回 null、push 为空操作 —— 登录 / 建号 / 身份校验全部在前端完成。
//
// 【后期无缝对接】接入微信小程序原生云开发（wx.cloud / 微信云托管）或
// 自建后端时，只需新增一个实现 UserDataGateway 的网关并替换下方导出即可，
// 上层（auth-context / 业务代码）无需改动：
//
//   const wxCloudGateway: UserDataGateway = {
//     name: "wx.cloud",
//     remote: true,
//     async fetch(openid) {
//       // const db = wx.cloud.database();
//       // const res = await db
//       //   .collection("user_data")
//       //   .where({ _openid: openid })
//       //   .limit(1)
//       //   .get();
//       // return (res.data && res.data[0]) || null;
//     },
//     async push(openid, doc) {
//       // upsert user_data：文档带 _openid: openid 归属字段
//     },
//   };
//
// 若日后复用腾讯云开发（CloudBase）作为远端，其环境 ID 为：
//   gg-reset-d1gb1eso5144bc964（地域 ap-shanghai）
// =============================================================================

export type UserDataDoc = Record<string, unknown>;

/** user_data 的存取网关接口 —— 微信云 / CloudBase / 自建后端均可实现并替换。 */
export type UserDataGateway = {
  /** 网关名：local | cloudbase | wx.cloud … */
  readonly name: string;
  /** true = 真实远端（会发网络请求）；false = 本机模式（不发任何请求） */
  readonly remote: boolean;
  /** 读取 openid 名下的 user_data 文档；不存在返回 null。 */
  fetch(openid: string): Promise<UserDataDoc | null>;
  /** 将 openid 名下的 user_data 文档整体 upsert。 */
  push(openid: string, doc: UserDataDoc): Promise<void>;
};

/** 当前生效网关：本机模式。替换这个对象即可切换到真实远端同步。 */
export const userDataGateway: UserDataGateway = {
  name: "local",
  remote: false,
  fetch: async () => null,
  push: async () => undefined,
};
