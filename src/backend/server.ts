import { serve } from "https://deno.land/std/http/server.ts";

const kv = await Deno.openKv();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "POST" && url.pathname === "/shorten") {
    const { url: longUrl } = await req.json();

    // Check if the long URL contains ".deno.dev"
    if (longUrl.includes(".deno.dev")) {
      return new Response("Error: Long URL cannot contain '.deno.dev'", { status: 400, headers: corsHeaders });
    }

    // Check if the long URL already exists
    const existingEntry = await kv.get(["urls", longUrl]);
    if (existingEntry.value) {
      const shortId = existingEntry.value.shortId;
      return new Response(JSON.stringify({ shortId }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Generate a new short ID
    const shortId = crypto.randomUUID().slice(0, 6);
    await kv.set(["urls", longUrl], { shortId, url: longUrl });

    return new Response(JSON.stringify({ shortId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (req.method === "GET" && url.pathname.startsWith("/")) {
    const shortId = url.pathname.slice(1);
    const result = await kv.get(["urls", shortId]);

    if (result.value) {
      return Response.redirect(result.value.url, 302);
    } else {
      return new Response("URL not found", { status: 404, headers: corsHeaders });
    }
  }

  if (req.method === "GET" && url.pathname === "/") {
    return new Response(await Deno.readTextFile("./index.html"), {
      headers: { "Content-Type": "text/html", ...corsHeaders },
    });
  } else if (req.method === "GET" && url.pathname === "/styles.css") {
    return new Response(await Deno.readTextFile("./styles.css"), {
      headers: { "Content-Type": "text/css", ...corsHeaders },
    });
  } else if (req.method === "GET" && url.pathname === "/script.js") {
    return new Response(await Deno.readTextFile("./script.js"), {
      headers: { "Content-Type": "application/javascript", ...corsHeaders },
    });
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
