document.getElementById("shortenForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const url = document.getElementById("urlInput").value;

  const response = await fetch("/shorten", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const result = await response.json();
  document.getElementById("result").textContent = `Shortened URL: ${window.location.origin}/${result.shortId}`;
});
