/*
 * Run this file locally once to create two confirmed Supabase test accounts.
 * It requires a SERVER-ONLY secret/service_role key; never copy that key into
 * supabase-config.js, GitHub, Cloudflare Pages, or any browser code.
 */
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경 변수가 비어 있습니다.`);
  return value;
};

const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY || required("SUPABASE_SERVICE_ROLE_KEY");
const accounts = [
  { email: required("POLITIMON_DEV_1_EMAIL"), password: required("POLITIMON_DEV_1_PASSWORD"), displayName: process.env.POLITIMON_DEV_1_NAME || "개발 테스트 1" },
  { email: required("POLITIMON_DEV_2_EMAIL"), password: required("POLITIMON_DEV_2_PASSWORD"), displayName: process.env.POLITIMON_DEV_2_NAME || "개발 테스트 2" }
];

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.msg || body.message || `${response.status} ${response.statusText}`);
  return body;
}

for (const account of accounts) {
  const user = await request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true, user_metadata: { display_name: account.displayName, role: "developer" } })
  });
  await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_developer: true, display_name: account.displayName })
  });
  console.log(`created: ${account.email} (${user.id})`);
}

console.log("두 개발 테스트 계정이 생성·확인되었습니다.");
