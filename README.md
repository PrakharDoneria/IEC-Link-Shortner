# Deno Link Shortener

This project is a simple URL shortener built using [Deno](https://deno.land/), [Deno KV](https://deno.land/manual@v1.34.3/runtime/kv), and serves both the frontend and backend within a single Deno server.

## Features
- Shorten long URLs
- Retrieve the original URL by accessing the shortened link
- Simple HTML frontend with form submission
- Deno KV for storing shortened URLs

## Project Structure
```
deno-link-shortener/
│
├── src/
│   └── backend/
│       └── server.ts  # Backend logic to serve frontend and handle URL shortening
├── index.html         # Frontend HTML file
├── styles.css         # Frontend CSS file
├── script.js          # Frontend JavaScript logic
└── deno.json          # Deno project configuration
```

## Prerequisites
- [Deno](https://deno.land/) installed on your machine.

## Setup and Running

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/deno-link-shortener.git
   cd deno-link-shortener
   ```

2. Run the project:
   ```bash
   deno task start
   ```

   This will start a server on `http://localhost:8000`.

## Frontend Usage

1. Open the frontend in your browser by navigating to `http://localhost:8000`.
2. Enter a URL in the input box and click the "Shorten" button.
3. The shortened URL will appear below the form, and you can copy and use it.
4. Accessing the shortened URL will redirect you to the original long URL.

## Backend Usage

- **POST `/shorten`**: This endpoint accepts a JSON payload containing a `url` and returns a shortened URL ID.

  **Request Example**:
  ```bash
  curl -X POST http://localhost:8000/shorten -H "Content-Type: application/json" -d '{"url": "https://example.com"}'
  ```

  **Response Example**:
  ```json
  {
    "shortId": "abc123"
  }
  ```

- **GET `/abc123`**: Visiting the shortened URL (e.g., `http://localhost:8000/abc123`) will redirect you to the original URL (e.g., `https://example.com`).