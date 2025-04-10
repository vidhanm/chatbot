# Cloudflare Pages + OpenRouter Chatbot

A simple chatbot interface hosted on Cloudflare Pages, using Cloudflare Functions
to securely interact with the OpenRouter.ai API.

## Project Structure

-   `/functions/api/chat.js`: The serverless function acting as a secure backend proxy.
-   `/index.html`: The main chat interface HTML.
-   `/style.css`: Basic CSS for the interface.
-   `/script.js`: Frontend JavaScript handling user input and API calls to the function.

## Deployment

1.  **Push to GitHub:** Create a new repository on GitHub and push these files to it.
2.  **Create Cloudflare Pages Site:**
    *   Log in to your Cloudflare dashboard.
    *   Go to Workers & Pages -> Create application -> Pages -> Connect to Git.
    *   Select your GitHub repository.
    *   In "Build settings", you might not need any specific framework preset or build command if it's just static HTML/CSS/JS + the function. Cloudflare should detect the `/functions` directory automatically. If you add build steps later (like npm), configure them here. The "Output directory" can usually be left blank or set to `/` if no build step creates a specific folder.
    *   Click "Save and Deploy".
3.  **Set Environment Variable:**
    *   After the first deployment attempt (or during setup), go to your Pages project settings -> Environment Variables.
    *   Under "Production" (and optionally "Preview"), click "Add variable".
    *   Variable name: `OPENROUTER_API_KEY`
    *   Value: Paste your actual OpenRouter API key here.
    *   **IMPORTANT:** Click the "Encrypt" button (lock icon) to make it a **secret**.
    *   Save the variable.
4.  **Redeploy (if needed):** If you added the variable after the first deployment, trigger a new deployment from the Cloudflare Pages interface for the secret to be available to the function.

## How it Works

-   The `index.html`, `style.css`, and `script.js` files create the frontend chat interface in the user's browser.
-   When the user sends a message, `script.js` sends a `fetch` request to `/api/chat` (handled by the Cloudflare Function).
-   The Cloudflare Function (`functions/api/chat.js`) receives the request.
-   It securely accesses the `OPENROUTER_API_KEY` environment variable (which is *not* exposed to the browser).
-   It makes a server-side API call to `https://openrouter.ai/api/v1/chat/completions` using the API key.
-   It parses the response from OpenRouter and sends *only* the chatbot's reply back to the frontend `script.js`.
-   `script.js` displays the received reply in the chat interface.

## Customization

-   Change the model used in `functions/api/chat.js` (`requestBody.model`).
-   Modify the CSS (`style.css`) for better appearance.
-   Enhance `script.js` to handle conversation history more robustly, add typing indicators, etc.
-   Add error handling and user feedback.