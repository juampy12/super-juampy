export const dynamic = "force-static";

const CONTENT = `Contact: mailto:jpurich59@gmail.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: es, en
Scope: https://super-juampy.vercel.app/
Policy: https://github.com/juampy12/super-juampy/security/policy
`;

export function GET() {
  return new Response(CONTENT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
