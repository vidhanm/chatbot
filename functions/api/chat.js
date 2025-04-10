/**
 * Cloudflare Function for OpenRouter Chat - Handles Gemini Pro 2.5 (or similar multimodal)
 * Expects POST requests with Content-Type: multipart/form-data
 * FormData should contain:
 *   - history: A JSON stringified array of messages [{role: 'user' | 'assistant', content: '...'}, ...]
 *   - image: (Optional) An image file.
 * Responds with JSON: { reply: '...' } or { error: '...' }
 */

// Helper function to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Use btoa for Base64 encoding (available in CF Workers)
    try {
        return btoa(binary);
    } catch (e) {
        console.error("Error in btoa (likely invalid characters):", e);
        // Fallback or re-throw depending on desired handling
        // For simplicity here, we'll return an empty string or throw
        throw new Error("Failed Base64 encoding");
    }
  }
  
  
  export async function onRequestPost(context) {
      try {
          // --- 1. Input Validation & Parsing ---
          const contentType = context.request.headers.get("Content-Type");
          if (!contentType || !contentType.includes("multipart/form-data")) {
              return new Response(JSON.stringify({ error: 'Expected Content-Type: multipart/form-data' }), {
                  status: 415, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          let formData;
          try {
              formData = await context.request.formData();
          } catch (e) {
               console.error("Failed to parse FormData:", e);
               return new Response(JSON.stringify({ error: 'Invalid form data' }), {
                  status: 400, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          // --- Get history ---
          const historyString = formData.get('history');
          if (!historyString || typeof historyString !== 'string') {
              return new Response(JSON.stringify({ error: 'Missing or invalid "history" field' }), {
                  status: 400, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          let userMessages; // This will hold the conversation history array
          try {
              userMessages = JSON.parse(historyString);
              if (!Array.isArray(userMessages)) throw new Error("History is not an array");
          } catch (e) {
               console.error("Failed to parse history JSON:", e);
               return new Response(JSON.stringify({ error: 'Invalid JSON format in "history" field' }), {
                  status: 400, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          // --- Get image file and Process for Gemini ---
          const imageFile = formData.get('image'); // File object or null
          let imageBase64 = null;
          let imageMediaType = null;
  
          if (imageFile && typeof imageFile.name === 'string' && imageFile.size > 0) {
              console.log(`Image received: ${imageFile.name}, Size: ${imageFile.size} bytes, Type: ${imageFile.type}`);
              imageMediaType = imageFile.type; // e.g., "image/jpeg"
  
              // Read image data and convert to Base64
              try {
                  const imageBuffer = await imageFile.arrayBuffer();
                  imageBase64 = arrayBufferToBase64(imageBuffer);
                  console.log("Image successfully encoded to Base64.");
              } catch (err) {
                   console.error("Error processing image file:", err);
                   // Decide how to handle: send error back, or proceed without image?
                   // Let's send an error back for clarity.
                   return new Response(JSON.stringify({ error: 'Failed to process uploaded image' }), {
                       status: 500, headers: { 'Content-Type': 'application/json' },
                   });
              }
          } else {
               console.log("No valid image file uploaded.");
          }
  
          // --- Modify the *last* user message if an image was included ---
          if (imageBase64 && imageMediaType && userMessages.length > 0) {
              const lastMessageIndex = userMessages.length - 1;
              // Ensure the last message is from the user, though history should maintain this
              if (userMessages[lastMessageIndex].role === 'user') {
                  const lastContent = userMessages[lastMessageIndex].content;
                  let originalText = "";
  
                  // Extract original text, removing the placeholder added by frontend
                  if (typeof lastContent === 'string') {
                      const placeholder = `[User uploaded image: ${imageFile.name}]`;
                      originalText = lastContent.replace(placeholder, '').trim();
                  } else {
                      // Should not happen if frontend adds placeholder, but handle defensively
                      console.warn("Last user message content was not a string:", lastContent);
                      originalText = ""; // Or try to extract text if it was already an array? Unlikely.
                  }
  
  
                  // Construct the Gemini multimodal content array
                  const imageDataUri = `data:${imageMediaType};base64,${imageBase64}`;
                  userMessages[lastMessageIndex].content = [
                      {
                          "type": "text",
                          "text": originalText || "What is in this image?" // Add default text if none provided? Or ""
                      },
                      {
                          "type": "image_url",
                          "image_url": {
                              "url": imageDataUri
                              // Gemini API might support other fields here, check docs
                          }
                      }
                  ];
                  console.log("Formatted last message for multimodal input.");
              } else {
                   console.warn("Last message was not from user, cannot attach image data to it.");
                   // Handle this case? Maybe add a new user message with just the image? Unlikely scenario.
              }
          }
  
  
          // --- 2. API Key Retrieval ---
          const apiKey = context.env.OPENROUTER_API_KEY;
          if (!apiKey) {
              console.error("OPENROUTER_API_KEY environment variable not set.");
              return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
                  status: 500, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          // --- 3. Prepare API Request Body for Gemini ---
          const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
  
          // *** UPDATE THE MODEL NAME HERE ***
          // Verify this exact ID on OpenRouter.ai - availability/cost might vary.
          const modelName = "google/gemini-2.5-pro-exp-03-25:free";
          // const modelName = "google/gemini-flash-1.5"; // Alternative if 2.5 isn't working
  
          const requestBody = {
              model: modelName,
              messages: userMessages, // Send the history, potentially modified for the last message
              // Add other parameters if needed (temperature, max_tokens etc.)
              // max_tokens: 4096 // Gemini models often have large context windows
          };
  
          console.log("Sending request to OpenRouter with model:", modelName);
          // Optional: Log the request body structure (excluding image data for brevity/security)
          // console.log("Request Body Structure:", JSON.stringify({ model: requestBody.model, messages: requestBody.messages.map(m => ({ role: m.role, content_type: typeof m.content })) }, null, 2));
  
  
          // Optional headers for OpenRouter ranking
          const siteUrl = context.request.headers.get("Referer") || "YOUR_SITE_URL";
          const siteTitle = "YOUR_SITE_NAME";
  
  
          // --- 4. Make API Call ---
          const openRouterResponse = await fetch(openRouterUrl, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json', // OpenRouter expects JSON
                  'HTTP-Referer': siteUrl,
                  'X-Title': siteTitle,
              },
              body: JSON.stringify(requestBody), // Send JSON
          });
  
          // --- 5. Handle API Response ---
          if (!openRouterResponse.ok) {
               const errorText = await openRouterResponse.text();
               console.error(`OpenRouter API Error (${openRouterResponse.status}) for model ${modelName}: ${errorText}`);
               return new Response(JSON.stringify({ error: `AI provider error (${openRouterResponse.status})` }), {
                  status: openRouterResponse.status,
                  headers: { 'Content-Type': 'application/json' },
              });
          }
  
          const completion = await openRouterResponse.json();
          // console.log("OpenRouter Response:", JSON.stringify(completion, null, 2)); // Debugging: Log full response
  
          // Safely extract the reply content
          const botReply = completion?.choices?.[0]?.message?.content?.trim();
  
          if (botReply === null || botReply === undefined) { // Check specifically for null/undefined, empty string is valid
               console.error("Could not extract valid reply content from OpenRouter response:", JSON.stringify(completion));
               // Check for potential finish reasons like 'length' or 'content_filter'
               const finishReason = completion?.choices?.[0]?.finish_reason;
               const errorMsg = finishReason ? `Failed to get valid response from AI (finish reason: ${finishReason})` : 'Failed to get valid response from AI';
               return new Response(JSON.stringify({ error: errorMsg }), {
                  status: 502, headers: { 'Content-Type': 'application/json' },
              });
          }
  
          // --- 6. Send Success Response to Frontend ---
          console.log("Successfully received reply from AI.");
          return new Response(JSON.stringify({ reply: botReply }), {
              status: 200, headers: { 'Content-Type': 'application/json' },
          });
  
      } catch (error) {
          // --- 7. Catch-all Error Handling ---
          console.error("Error in Cloudflare Function:", error);
          let errorMsg = 'Internal server error occurred';
          if (error instanceof Error) {
               errorMsg = error.message; // Provide more specific error if available
          }
          return new Response(JSON.stringify({ error: errorMsg }), {
              status: 500, headers: { 'Content-Type': 'application/json' },
          });
      }
  }