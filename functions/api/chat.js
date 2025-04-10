/**
 * Cloudflare Function to handle chat requests securely.
 * Expects POST requests with JSON body: { messages: [{role: 'user' | 'assistant', content: '...'}, ...] }
 * Responds with JSON: { reply: '...' } or { error: '...' }
 */
export async function onRequestPost(context) {
    try {
        // --- 1. Input Validation ---
        if (context.request.headers.get("Content-Type") !== "application/json") {
            return new Response(JSON.stringify({ error: 'Expected Content-Type: application/json' }), {
                status: 415, // Unsupported Media Type
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let requestData;
        try {
            requestData = await context.request.json();
        } catch (e) {
             return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400, // Bad Request
                headers: { 'Content-Type': 'application/json' },
            });
        }


        const userMessages = requestData.messages;

        if (!Array.isArray(userMessages) || userMessages.length === 0) {
            return new Response(JSON.stringify({ error: 'Missing or empty "messages" array in request body' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // Basic validation on message structure (could be more thorough)
        if (!userMessages.every(m => typeof m.role === 'string' && typeof m.content === 'string')) {
             return new Response(JSON.stringify({ error: 'Invalid message structure in "messages" array' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }


        // --- 2. API Key Retrieval ---
        const apiKey = context.env.OPENROUTER_API_KEY; // Set in Cloudflare Pages > Settings > Environment Variables
        if (!apiKey) {
            console.error("OPENROUTER_API_KEY environment variable not set.");
            return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
                status: 500, // Internal Server Error
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- 3. Prepare API Request ---
        const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

        // Add system prompt if desired, or ensure the history starts appropriately
        // Example: Prepend a system message if history doesn't contain one
        // let messagesToSend = userMessages;
        // if (!messagesToSend.some(m => m.role === 'system')) {
        //     messagesToSend = [{ role: "system", content: "You are a helpful assistant." }, ...messagesToSend];
        // }


        const requestBody = {
            model: "deepseek/deepseek-r1:free", // Or choose another model via OpenRouter
            messages: userMessages, // Pass the conversation history
            // stream: false, // Set to true for streaming if you implement frontend support
            // temperature: 0.7, // Optional parameters
            // max_tokens: 1000,
        };

        // Optional headers for OpenRouter ranking
        const siteUrl = context.request.headers.get("Referer") || "YOUR_SITE_URL"; // Get referer if possible
        const siteTitle = "YOUR_SITE_NAME"; // Replace with your site's name


        // --- 4. Make API Call ---
        const openRouterResponse = await fetch(openRouterUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': siteUrl,
                'X-Title': siteTitle,
            },
            body: JSON.stringify(requestBody),
        });

        // --- 5. Handle API Response ---
        if (!openRouterResponse.ok) {
             const errorText = await openRouterResponse.text();
             console.error(`OpenRouter API Error (${openRouterResponse.status}): ${errorText}`);
             return new Response(JSON.stringify({ error: `AI provider error (${openRouterResponse.status})` }), {
                status: openRouterResponse.status, // Pass status through if desired, or use a generic 502/503
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const completion = await openRouterResponse.json();

        // Safely extract the reply content
        const botReply = completion?.choices?.[0]?.message?.content?.trim();

        if (!botReply) {
             console.error("Could not extract valid reply from OpenRouter response:", JSON.stringify(completion));
             return new Response(JSON.stringify({ error: 'Failed to get valid response from AI' }), {
                status: 502, // Bad Gateway
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- 6. Send Success Response to Frontend ---
        return new Response(JSON.stringify({ reply: botReply }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // --- 7. Catch-all Error Handling ---
        console.error("Error in Cloudflare Function:", error);
        return new Response(JSON.stringify({ error: 'Internal server error occurred' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}