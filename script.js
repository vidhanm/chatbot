const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewArea = document.getElementById('image-preview-area');

let conversationHistory = [];
let selectedImageFile = null; // Variable to hold the selected image file

// --- Event Listener for Image Selection ---
imageUpload.addEventListener('change', handleImageSelect);

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedImageFile = file;
        displayImagePreview(file);
    }
    // Reset the input value so the same file can be selected again if removed
    event.target.value = null;
}

function displayImagePreview(file) {
    imagePreviewArea.innerHTML = ''; // Clear previous preview

    const previewElement = document.createElement('div');
    previewElement.classList.add('preview-item');

    // Optional: Show a small thumbnail
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.createElement('img');
        img.src = e.target.result;
        previewElement.appendChild(img);
    }
    reader.readAsDataURL(file); // Generates base64 Data URL for preview

    const fileName = document.createElement('span');
    fileName.textContent = file.name;
    previewElement.appendChild(fileName);

    const removeButton = document.createElement('span');
    removeButton.textContent = '✖'; // 'x' symbol
    removeButton.classList.add('remove-preview');
    removeButton.title = 'Remove image';
    removeButton.onclick = () => {
        selectedImageFile = null;
        imagePreviewArea.innerHTML = ''; // Clear preview area
    };
    previewElement.appendChild(removeButton);

    imagePreviewArea.appendChild(previewElement);
}

// --- Message Handling ---

function appendMessage(sender, text, imageUrl = null) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    let messageContent = '';

    // Sanitize text before inserting as HTML
    const sanitizedText = text.replace(/</g, "<").replace(/>/g, ">");

    if (sender === 'User') {
        messageElement.classList.add('user-message');
        // Add to history
        // Note: We'll add the message *with* image acknowledgment just before sending API call
        messageContent = sanitizedText;
        if (imageUrl) { // If user sent an image (display it)
             const imgElement = document.createElement('img');
             imgElement.src = imageUrl;
             imgElement.style.maxWidth = '100%'; // Or fixed width
             imgElement.style.display = 'block';
             imgElement.style.marginTop = '5px';
             imgElement.style.borderRadius = '5px';
             messageElement.appendChild(imgElement);
        }

    } else if (sender === 'Bot') {
        messageElement.classList.add('bot-message');
        conversationHistory.push({ role: "assistant", content: text }); // Add bot response to history
        messageContent = sanitizedText;
    } else { // System messages
        messageElement.classList.add('system-message');
        messageContent = sanitizedText;
    }

    // Add text content *after* potential image for user messages
    const textNode = document.createElement('div');
    textNode.innerHTML = messageContent; // Use innerHTML if you might want basic formatting like bold later
    messageElement.appendChild(textNode);


    chatBox.appendChild(messageElement);
    // Scroll to the bottom
    chatBox.scrollTop = chatBox.scrollHeight;

    limitHistory();
}


function limitHistory() {
    // Optional: Limit history size
    const maxHistoryLength = 10;
    if (conversationHistory.length > maxHistoryLength) {
        const startIndex = conversationHistory.findIndex(msg => msg.role !== "system");
        if (startIndex !== -1 && conversationHistory.length - startIndex > maxHistoryLength) {
             conversationHistory.splice(startIndex, conversationHistory.length - startIndex - maxHistoryLength);
        }
    }
}

function showThinkingIndicator() {
    // Remove previous indicator if any (shouldn't happen often)
    removeThinkingIndicator();
    const thinkingIndicator = document.createElement('div');
    thinkingIndicator.classList.add('message', 'bot-message');
    thinkingIndicator.textContent = 'Bot is thinking...';
    thinkingIndicator.id = 'thinking-indicator';
    chatBox.appendChild(thinkingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeThinkingIndicator() {
    const indicator = document.getElementById('thinking-indicator');
    if (indicator) {
        chatBox.removeChild(indicator);
    }
}


async function sendMessage() {
    const userMessageText = messageInput.value.trim();
    const imageToSend = selectedImageFile; // Grab the currently selected file

    // Require either text or an image
    if (!userMessageText && !imageToSend) {
        return;
    }

    // --- Prepare message for display and history ---
    let displayMessage = userMessageText;
    let historyMessage = userMessageText;
    let userImagePreviewUrl = null;

    if (imageToSend) {
        // Create a URL for displaying the image locally in the user's chat bubble
        userImagePreviewUrl = URL.createObjectURL(imageToSend);

        // For the history sent to the backend (simple acknowledgement for now)
        const imagePlaceholder = `[User uploaded image: ${imageToSend.name}]`;
        historyMessage = userMessageText ? `${userMessageText}\n${imagePlaceholder}` : imagePlaceholder;
    }

    // Display user message (with image if provided)
    appendMessage('User', displayMessage, userImagePreviewUrl);

    // Add the potentially modified message (with image placeholder) to history *before* sending
    conversationHistory.push({ role: "user", content: historyMessage });
    limitHistory(); // Apply history limit *after* adding

    // Clear inputs
    messageInput.value = '';
    selectedImageFile = null;
    imagePreviewArea.innerHTML = ''; // Clear preview

    // Disable inputs and show thinking indicator
    sendButton.disabled = true;
    messageInput.disabled = true;
    imageUpload.disabled = true; // Disable file input as well
    showThinkingIndicator();


    // --- Prepare data for API ---
    const formData = new FormData();
    // Append history (as JSON string because FormData doesn't handle arrays directly)
    formData.append('history', JSON.stringify(conversationHistory));

    // Append the actual image file if it exists
    if (imageToSend) {
        formData.append('image', imageToSend, imageToSend.name);
    }
    // Note: We are sending the *history* which contains the text message
    // If your backend prefers, you could send the latest text separately:
    // formData.append('message', userMessageText);


    try {
        // Send FormData to your Cloudflare Function endpoint
        const response = await fetch('/api/chat', { // Path to your function
            method: 'POST',
            // ** IMPORTANT: DO NOT set Content-Type header when sending FormData **
            // The browser will automatically set it to multipart/form-data with the correct boundary
            body: formData,
        });

        removeThinkingIndicator(); // Remove indicator once response headers are received

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `API Error: ${response.statusText}` })); // Try to get error details
            throw new Error(errorData.error || `API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // Display bot response
        appendMessage('Bot', data.reply);

    } catch (error) {
        console.error("Error fetching chatbot response:", error);
        appendMessage('System', `Error: ${error.message}`);
        removeThinkingIndicator(); // Ensure indicator is removed on error
    } finally {
         // Re-enable inputs
         sendButton.disabled = false;
         messageInput.disabled = false;
         imageUpload.disabled = false;
         messageInput.focus(); // Focus back on input

         // Revoke the object URL to free up memory
         if (userImagePreviewUrl) {
            URL.revokeObjectURL(userImagePreviewUrl);
         }
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});