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
    event.target.value = null;
}

function displayImagePreview(file) {
    imagePreviewArea.innerHTML = '';
    const previewElement = document.createElement('div');
    previewElement.classList.add('preview-item');
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.createElement('img');
        img.src = e.target.result;
        previewElement.appendChild(img);
    }
    reader.readAsDataURL(file);
    const fileName = document.createElement('span');
    fileName.textContent = file.name;
    previewElement.appendChild(fileName);
    const removeButton = document.createElement('span');
    removeButton.textContent = '✖';
    removeButton.classList.add('remove-preview');
    removeButton.title = 'Remove image';
    removeButton.onclick = () => {
        selectedImageFile = null;
        imagePreviewArea.innerHTML = '';
    };
    previewElement.appendChild(removeButton);
    imagePreviewArea.appendChild(previewElement);
}

// --- NEW: Simple Markdown to HTML Conversion ---
function simpleMarkdownToHtml(text) {
    if (!text) return '';

    // Escape basic HTML characters first to prevent XSS if the LLM includes them unexpectedly
    // We'll selectively allow <strong> and <br> later.
    let escapedText = text.replace(/&/g, '&')
                          .replace(/</g, '<')
                          .replace(/>/g, '>');

    // 1. Convert **bold** to <strong>bold</strong>
    // Use a callback to avoid nested markdown issues within bold tags
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, (match, content) => {
        // Recursively process content inside bold tags if needed (optional)
        // For now, just wrap with <strong>
        return `<strong>${content}</strong>`;
    });

     // Optional: Add italic conversion *italic* to <em>italic</em>
     // escapedText = escapedText.replace(/\*(.*?)\*/g, (match, content) => {
     //     return `<em>${content}</em>`;
     // });

    // 2. Convert newlines (\n) to <br> tags
    escapedText = escapedText.replace(/\n/g, '<br>');

    // NOTE: This approach is basic. It won't handle complex nested markdown
    // or code blocks well. For more advanced rendering, consider a library like 'marked' or 'showdown'.

    return escapedText;
}


// --- Message Handling ---
function appendMessage(sender, text, imageUrl = null) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    const textNode = document.createElement('div'); // Separate div for text content

    // Basic sanitization for user input display (if ever needed directly)
    const basicSanitize = (str) => str.replace(/</g, "<").replace(/>/g, ">");

    if (sender === 'User') {
        messageElement.classList.add('user-message');
        textNode.textContent = text; // Use textContent for user text display for safety

        if (imageUrl) { // If user sent an image (display it first)
             const imgElement = document.createElement('img');
             imgElement.src = imageUrl;
             imgElement.style.maxWidth = '100%';
             imgElement.style.display = 'block';
             imgElement.style.marginTop = '5px';
             imgElement.style.borderRadius = '5px';
             messageElement.appendChild(imgElement); // Add image before text node
        }

    } else if (sender === 'Bot') {
        messageElement.classList.add('bot-message');
        conversationHistory.push({ role: "assistant", content: text }); // Add raw bot response to history

        // *** Convert Markdown to HTML for display ***
        const formattedHtml = simpleMarkdownToHtml(text);
        textNode.innerHTML = formattedHtml; // Use innerHTML to render the HTML tags

    } else { // System messages
        messageElement.classList.add('system-message');
        textNode.textContent = text; // System messages likely don't need formatting
    }

    // Append the text node to the message element
    messageElement.appendChild(textNode);

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    limitHistory();
}


function limitHistory() {
    // Optional: Limit history size
    const maxHistoryLength = 10; // Keep last 10 messages (user + bot)
    if (conversationHistory.length > maxHistoryLength) {
        const startIndex = conversationHistory.findIndex(msg => msg.role !== "system");
        if (startIndex !== -1 && conversationHistory.length - startIndex > maxHistoryLength) {
             conversationHistory.splice(startIndex, conversationHistory.length - startIndex - maxHistoryLength);
        }
    }
}

function showThinkingIndicator() {
    removeThinkingIndicator();
    const thinkingIndicator = document.createElement('div');
    thinkingIndicator.classList.add('message', 'bot-message');
    thinkingIndicator.id = 'thinking-indicator';

    // Simple text or add animation later
    const dot1 = document.createElement('span'); dot1.textContent = '.';
    const dot2 = document.createElement('span'); dot2.textContent = '.';
    const dot3 = document.createElement('span'); dot3.textContent = '.';
    thinkingIndicator.append('Bot is thinking', dot1, dot2, dot3);

    // Add simple CSS animation to the dots (add corresponding CSS)
    dot1.style.animation = 'blink 1.4s infinite both';
    dot2.style.animation = 'blink 1.4s infinite both 0.2s';
    dot3.style.animation = 'blink 1.4s infinite both 0.4s';


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
    const imageToSend = selectedImageFile;

    if (!userMessageText && !imageToSend) return;

    let displayMessage = userMessageText;
    let historyMessage = userMessageText;
    let userImagePreviewUrl = null;

    if (imageToSend) {
        userImagePreviewUrl = URL.createObjectURL(imageToSend);
        const imagePlaceholder = `[User uploaded image: ${imageToSend.name}]`;
        historyMessage = userMessageText ? `${userMessageText}\n${imagePlaceholder}` : imagePlaceholder;
         // Display message might just be the text, image is shown separately
         displayMessage = userMessageText;
    }

    appendMessage('User', displayMessage, userImagePreviewUrl);

    conversationHistory.push({ role: "user", content: historyMessage }); // Add potentially modified msg to history
    limitHistory();

    messageInput.value = '';
    selectedImageFile = null;
    imagePreviewArea.innerHTML = '';

    sendButton.disabled = true;
    messageInput.disabled = true;
    imageUpload.disabled = true;
    showThinkingIndicator();


    const formData = new FormData();
    formData.append('history', JSON.stringify(conversationHistory));
    if (imageToSend) {
        formData.append('image', imageToSend, imageToSend.name);
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: formData,
        });

        removeThinkingIndicator();

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `API Error: ${response.statusText}` }));
            throw new Error(errorData.error || `API Error: ${response.statusText}`);
        }

        const data = await response.json();
        appendMessage('Bot', data.reply); // Pass raw reply to appendMessage

    } catch (error) {
        console.error("Error fetching chatbot response:", error);
        appendMessage('System', `Error: ${error.message}`);
        removeThinkingIndicator();
    } finally {
         sendButton.disabled = false;
         messageInput.disabled = false;
         imageUpload.disabled = false;
         messageInput.focus();
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