import { serve } from "https://deno.land/std/http/server.ts";

const kv = await Deno.openKv();

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/shorten") {
    const { url } = await req.json();
    const shortId = crypto.randomUUID().slice(0, 6);
    await kv.set(["urls", shortId], { url });

    return new Response(JSON.stringify({ shortId }), { headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "GET" && url.pathname.startsWith("/")) {
    const shortId = url.pathname.slice(1);
    const result = await kv.get(["urls", shortId]);

    if (result.value) {
      return Response.redirect(result.value.url, 302);
    } else {
      return new Response("URL not found", { status: 404 });
    }
  }
  
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(await Deno.readTextFile("./index.html"), { headers: { "Content-Type": "text/html" } });
  } else if (req.method === "GET" && url.pathname === "/styles.css") {
    return new Response(await Deno.readTextFile("./styles.css"), { headers: { "Content-Type": "text/css" } });
  } else if (req.method === "GET" && url.pathname === "/script.js") {
    return new Response(await Deno.readTextFile("./script.js"), { headers: { "Content-Type": "application/javascript" } });
  }

  return new Response("Not Found", { status: 404 });
});
