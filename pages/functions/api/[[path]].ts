/* Cloudflare Pages: leitet alle /api-Aufrufe an den Worker weiter (Service Binding, gleiche Herkunft, keine CORS). */
export const onRequest = async (ctx: any): Promise<Response> => ctx.env.API.fetch(ctx.request);
