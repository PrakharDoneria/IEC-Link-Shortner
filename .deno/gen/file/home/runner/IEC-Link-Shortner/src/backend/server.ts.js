import { serve } from "https://deno.land/std/http/server.ts";
const kv = await Deno.openKv();
serve(async (req)=>{
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/shorten") {
    const { url } = await req.json();
    const shortId = crypto.randomUUID().slice(0, 6);
    await kv.set([
      "urls",
      shortId
    ], {
      url
    });
    return new Response(JSON.stringify({
      shortId
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  if (req.method === "GET" && url.pathname.startsWith("/")) {
    const shortId = url.pathname.slice(1);
    const result = await kv.get([
      "urls",
      shortId
    ]);
    if (result.value) {
      return Response.redirect(result.value.url, 302);
    } else {
      return new Response("URL not found", {
        status: 404
      });
    }
  }
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(await Deno.readTextFile("./index.html"), {
      headers: {
        "Content-Type": "text/html"
      }
    });
  } else if (req.method === "GET" && url.pathname === "/styles.css") {
    return new Response(await Deno.readTextFile("./styles.css"), {
      headers: {
        "Content-Type": "text/css"
      }
    });
  } else if (req.method === "GET" && url.pathname === "/script.js") {
    return new Response(await Deno.readTextFile("./script.js"), {
      headers: {
        "Content-Type": "application/javascript"
      }
    });
  }
  return new Response("Not Found", {
    status: 404
  });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvSUVDLUxpbmstU2hvcnRuZXIvc3JjL2JhY2tlbmQvc2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHNlcnZlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZC9odHRwL3NlcnZlci50c1wiO1xuXG5jb25zdCBrdiA9IGF3YWl0IERlbm8ub3Blbkt2KCk7XG5cbnNlcnZlKGFzeW5jIChyZXEpID0+IHtcbiAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsKTtcblxuICBpZiAocmVxLm1ldGhvZCA9PT0gXCJQT1NUXCIgJiYgdXJsLnBhdGhuYW1lID09PSBcIi9zaG9ydGVuXCIpIHtcbiAgICBjb25zdCB7IHVybCB9ID0gYXdhaXQgcmVxLmpzb24oKTtcbiAgICBjb25zdCBzaG9ydElkID0gY3J5cHRvLnJhbmRvbVVVSUQoKS5zbGljZSgwLCA2KTtcbiAgICBhd2FpdCBrdi5zZXQoW1widXJsc1wiLCBzaG9ydElkXSwgeyB1cmwgfSk7XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgc2hvcnRJZCB9KSwgeyBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0gfSk7XG4gIH1cblxuICBpZiAocmVxLm1ldGhvZCA9PT0gXCJHRVRcIiAmJiB1cmwucGF0aG5hbWUuc3RhcnRzV2l0aChcIi9cIikpIHtcbiAgICBjb25zdCBzaG9ydElkID0gdXJsLnBhdGhuYW1lLnNsaWNlKDEpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGt2LmdldChbXCJ1cmxzXCIsIHNob3J0SWRdKTtcblxuICAgIGlmIChyZXN1bHQudmFsdWUpIHtcbiAgICAgIHJldHVybiBSZXNwb25zZS5yZWRpcmVjdChyZXN1bHQudmFsdWUudXJsLCAzMDIpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiVVJMIG5vdCBmb3VuZFwiLCB7IHN0YXR1czogNDA0IH0pO1xuICAgIH1cbiAgfVxuICBcbiAgaWYgKHJlcS5tZXRob2QgPT09IFwiR0VUXCIgJiYgdXJsLnBhdGhuYW1lID09PSBcIi9cIikge1xuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUoXCIuL2luZGV4Lmh0bWxcIiksIHsgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvaHRtbFwiIH0gfSk7XG4gIH0gZWxzZSBpZiAocmVxLm1ldGhvZCA9PT0gXCJHRVRcIiAmJiB1cmwucGF0aG5hbWUgPT09IFwiL3N0eWxlcy5jc3NcIikge1xuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYXdhaXQgRGVuby5yZWFkVGV4dEZpbGUoXCIuL3N0eWxlcy5jc3NcIiksIHsgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvY3NzXCIgfSB9KTtcbiAgfSBlbHNlIGlmIChyZXEubWV0aG9kID09PSBcIkdFVFwiICYmIHVybC5wYXRobmFtZSA9PT0gXCIvc2NyaXB0LmpzXCIpIHtcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKGF3YWl0IERlbm8ucmVhZFRleHRGaWxlKFwiLi9zY3JpcHQuanNcIiksIHsgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIiB9IH0pO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBSZXNwb25zZShcIk5vdCBGb3VuZFwiLCB7IHN0YXR1czogNDA0IH0pO1xufSk7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxLQUFLLFFBQVEsdUNBQXVDO0FBRTdELE1BQU0sS0FBSyxNQUFNLEtBQUssTUFBTTtBQUU1QixNQUFNLE9BQU87RUFDWCxNQUFNLE1BQU0sSUFBSSxJQUFJLElBQUksR0FBRztFQUUzQixJQUFJLElBQUksTUFBTSxLQUFLLFVBQVUsSUFBSSxRQUFRLEtBQUssWUFBWTtJQUN4RCxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLElBQUk7SUFDOUIsTUFBTSxVQUFVLE9BQU8sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHO0lBQzdDLE1BQU0sR0FBRyxHQUFHLENBQUM7TUFBQztNQUFRO0tBQVEsRUFBRTtNQUFFO0lBQUk7SUFFdEMsT0FBTyxJQUFJLFNBQVMsS0FBSyxTQUFTLENBQUM7TUFBRTtJQUFRLElBQUk7TUFBRSxTQUFTO1FBQUUsZ0JBQWdCO01BQW1CO0lBQUU7RUFDckc7RUFFQSxJQUFJLElBQUksTUFBTSxLQUFLLFNBQVMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU07SUFDeEQsTUFBTSxVQUFVLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQztJQUNuQyxNQUFNLFNBQVMsTUFBTSxHQUFHLEdBQUcsQ0FBQztNQUFDO01BQVE7S0FBUTtJQUU3QyxJQUFJLE9BQU8sS0FBSyxFQUFFO01BQ2hCLE9BQU8sU0FBUyxRQUFRLENBQUMsT0FBTyxLQUFLLENBQUMsR0FBRyxFQUFFO0lBQzdDLE9BQU87TUFDTCxPQUFPLElBQUksU0FBUyxpQkFBaUI7UUFBRSxRQUFRO01BQUk7SUFDckQ7RUFDRjtFQUVBLElBQUksSUFBSSxNQUFNLEtBQUssU0FBUyxJQUFJLFFBQVEsS0FBSyxLQUFLO0lBQ2hELE9BQU8sSUFBSSxTQUFTLE1BQU0sS0FBSyxZQUFZLENBQUMsaUJBQWlCO01BQUUsU0FBUztRQUFFLGdCQUFnQjtNQUFZO0lBQUU7RUFDMUcsT0FBTyxJQUFJLElBQUksTUFBTSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssZUFBZTtJQUNqRSxPQUFPLElBQUksU0FBUyxNQUFNLEtBQUssWUFBWSxDQUFDLGlCQUFpQjtNQUFFLFNBQVM7UUFBRSxnQkFBZ0I7TUFBVztJQUFFO0VBQ3pHLE9BQU8sSUFBSSxJQUFJLE1BQU0sS0FBSyxTQUFTLElBQUksUUFBUSxLQUFLLGNBQWM7SUFDaEUsT0FBTyxJQUFJLFNBQVMsTUFBTSxLQUFLLFlBQVksQ0FBQyxnQkFBZ0I7TUFBRSxTQUFTO1FBQUUsZ0JBQWdCO01BQXlCO0lBQUU7RUFDdEg7RUFFQSxPQUFPLElBQUksU0FBUyxhQUFhO0lBQUUsUUFBUTtFQUFJO0FBQ2pEIn0=