export const config = {
  matcher: "/:path*",
};

// Edge runtimeではprocess.envの型定義が必要
declare const process: { env: Record<string, string | undefined> };

// 本番環境はオープン、Preview/開発環境のみBasic Auth保護
export default function middleware(request: Request): Response | undefined {
  if (process.env.VERCEL_ENV === "production") return undefined;

  const authorization = request.headers.get("authorization");
  if (authorization) {
    const [scheme, base64] = authorization.split(" ");
    if (scheme?.toLowerCase() === "basic" && base64) {
      try {
        const decoded = atob(base64);
        const colonIndex = decoded.indexOf(":");
        const password = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : "";
        if (password && password === process.env.BASIC_AUTH_PASSWORD) {
          return undefined;
        }
      } catch {
        // 壊れたAuthorizationヘッダーは未認証として扱う。
      }
    }
  }

  return new Response("Preview環境 - 認証が必要です", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Dog Event App Preview"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
