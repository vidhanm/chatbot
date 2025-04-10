/**
 * Cloudflare Function to handle chat requests securely.
 * Expects POST requests with Content-Type: multipart/form-data
 * FormData should contain:
 *   - history: A JSON stringified array of messages [{role: 'user' | 'assistant', content: '...'}, ...]
 *   - image: (Optional) An image file.
 * Responds with JSON: { reply: '...' } or { error: '...' }
 */
export async function onRequestPost(context) {
    try {
        // --- 1. Input Validation & Parsing ---
        // Check if the content type is multipart/form-data (browser sets this with FormData)
        const contentType = context.request.headers.get("Content-Type");
        if (!contentType || !contentType.includes("multipart/form-data")) {
             // You might want to allow application/json as a fallback if needed
            return new Response(JSON.stringify({ error: 'Expected Content-Type: multipart/form-data' }), {
                status: 415, // Unsupported Media Type
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let formData;
        try {
            // Parse the multipart form data
            formData = await context.request.formData();
        } catch (e) {
             console.error("Failed to parse FormData:", e);
             return new Response(JSON.stringify({ error: 'Invalid form data' }), {
                status: 400, // Bad Request
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Get history (JSON string) ---
        const historyString = formData.get('history');
        if (!historyString || typeof historyString !== 'string') {
            return new Response(JSON.stringify({ error: 'Missing or invalid "history" field in form data' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let userMessages;
        try {
            userMessages = JSON.parse(historyString);
            if (!Array.isArray(userMessages)) throw new Error("History is not an array");
             // Add more validation if needed (check role/content)
        } catch (e) {
             console.error("Failed to parse history JSON:", e);
             return new Response(JSON.stringify({ error: 'Invalid JSON format in "history" field' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Get image file (if uploaded) ---
        const imageFile = formData.get('image'); // This will be a File object or null
        let imageInfoForLog = "No image uploaded.";
        if (imageFile && typeof imageFile.name === 'string') {
            imageInfoForLog = `Image received: ${imageFile.name}, Size: ${imageFile.size} bytes, Type: ${imageFile.type}`;
            console.log(imageInfoForLog); // Log image details on the server

            // ** IMPORTANT: Image Handling Decision Point **
            // Since deepseek-r1 is text-only, we aren't sending the image data to it.
            // The image *acknowledgement* should already be in the last message of `userMessages`
            // added by the frontend script.
            //
            // **IF USING A VISION MODEL LATER:**
            // 1. You would read the image data here:
            //    const imageBuffer = await imageFile.arrayBuffer();
            //    const imageBase64 = /* Convert buffer to base64 string */;
            //    const imageDataUri = `data:${imageFile.type};base64,${imageBase64}`;
            // 2. You would modify the `userMessages` array structure to include the image
            //    according to the specific model's API requirements (e.g., adding an image_url).
            //    Example structure (might vary):
            //    const lastMessage = userMessages[userMessages.length - 1];
            //    lastMessage.content = [
            //        { type: "text", text: lastMessage.content.split('\n[User uploaded image:')[0] }, // Extract original text
            //        { type: "image_url", image_url: { url: imageDataUri } }
            //    ];
        } else {
             console.log(imageInfoForLog);
        }


        // --- 2. API Key Retrieval ---
        const apiKey = context.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error("OPENROUTER_API_KEY environment variable not set.");
            return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- 3. Prepare API Request for TEXT model ---
        const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
        const requestBody = {
            model: "deepseek/deepseek-r1:free", // Still using text model
            messages: userMessages, // Send the history (which includes image acknowledgement text)
        };

        // Optional headers for OpenRouter ranking
        const siteUrl = context.request.headers.get("Referer") || "YOUR_SITE_URL";
        const siteTitle = "YOUR_SITE_NAME";


        // --- 4. Make API Call ---
        const openRouterResponse = await fetch(openRouterUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json', // OpenRouter expects JSON body
                'HTTP-Referer': siteUrl,
                'X-Title': siteTitle,
            },
            body: JSON.stringify(requestBody), // Send JSON to OpenRouter
        });

        // --- 5. Handle API Response ---
        if (!openRouterResponse.ok) {
             const errorText = await openRouterResponse.text();
             console.error(`OpenRouter API Error (${openRouterResponse.status}): ${errorText}`);
             return new Response(JSON.stringify({ error: `AI provider error (${openRouterResponse.status})` }), {
                status: openRouterResponse.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const completion = await openRouterResponse.json();
        const botReply = completion?.choices?.[0]?.message?.content?.trim();

        if (!botReply) {
             console.error("Could not extract valid reply from OpenRouter response:", JSON.stringify(completion));
             return new Response(JSON.stringify({ error: 'Failed to get valid response from AI' }), {
                status: 502,
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