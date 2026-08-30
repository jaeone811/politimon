import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "로그인 정보를 확인할 수 없습니다." }, { status: 401, headers: corsHeaders });

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400, headers: corsHeaders });
  return Response.json({ deleted: true }, { headers: corsHeaders });
});
