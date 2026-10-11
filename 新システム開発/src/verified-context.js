// 外部接続層が検証した主体だけを内部サービスへ渡すための境界。
// ここではトークン検証そのものを行わない。未検証の入力は拒否する。
export function createVerifiedContextAdapter({ service, verify }) {
  if (!service || typeof verify !== "function") throw new Error("CONFIGURATION_REQUIRED");
  async function subject(requestContext) {
    const identity = await verify(requestContext);
    if (!identity || identity.verified !== true || typeof identity.subject !== "string" || !identity.subject.trim()) {
      throw new Error("IDENTITY_NOT_VERIFIED");
    }
    return identity.subject;
  }
  return {
    start: async (context, qualification) => service.start(await subject(context), qualification),
    get: async context => service.get(await subject(context)),
    message: async (context, message) => service.message(await subject(context), message),
    confirmQualification: async (context, qualification) => service.confirmQualification(await subject(context), qualification)
  };
}
