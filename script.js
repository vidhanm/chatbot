const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewArea = document.getElementById('image-preview-area');
const chatContainer = document.getElementById('chat-container');
const stopButton = document.getElementById('stop-button'); // Get the stop button

let conversationHistory = [];
let selectedImageFile = null;
let currentAbortController = null; // Variable to hold the AbortController

// --- Event Listeners ---
imageUpload.addEventListener('change', handleFileSelectEvent);
document.addEventListener('paste', handlePasteEvent);
stopButton.addEventListener('click', handleStopGeneration); // Add listener for stop button

function handleFileSelectEvent(event) {
    const file = event.target.files[0];
    if (file) {
        processSelectedFile(file);
    }
    event.target.value = null;
}

function handlePasteEvent(event) {
    const items = (event.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
                event.preventDefault();
                console.log("Image pasted from clipboard:", file.name);
                processSelectedFile(file);
                foundImage = true;
                break;
            }
        }
    }
}

// --- Stop Generation ---
function handleStopGeneration() {
    if (currentAbortController) {
        console.log("Attempting to abort fetch request...");
        currentAbortController.abort(); // Signal fetch to abort
        // UI updates (like removing indicator) handled in sendMessage's finally block
        appendMessage('System', 'Generation stopped by user.'); // Add feedback
        // Ensure indicator is removed immediately if needed, though finally should catch it
        removeThinkingIndicator();
    }
}


// --- File Processing & Preview ---
function processSelectedFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    clearImageSelection();
    selectedImageFile = file;
    displayImagePreview(file);
}

function clearImageSelection() {
    selectedImageFile = null;
    imagePreviewArea.innerHTML = '';
    imageUpload.value = null;
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
    fileName.textContent = file.name || 'Pasted Image';
    previewElement.appendChild(fileName);
    const removeButton = document.createElement('span');
    removeButton.textContent = '✖';
    removeButton.classList.add('remove-preview');
    removeButton.title = 'Remove image';
    removeButton.onclick = clearImageSelection;
    previewElement.appendChild(removeButton);
    imagePreviewArea.appendChild(previewElement);
}

// --- Markdown & Message Display ---
function simpleMarkdownToHtml(text) {
    if (!text) return '';
    let escapedText = text.replace(/&/g, '&')
                          .replace(/</g, '<')
                          .replace(/>/g, '>');
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escapedText = escapedText.replace(/\n/g, '<br>');
    return escapedText;
}

function appendMessage(sender, text, imageUrl = null) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    const textNode = document.createElement('div');

    if (sender === 'User') {
        messageElement.classList.add('user-message');
        textNode.textContent = text;
        if (imageUrl) {
            const imgElement = document.createElement('img');
            imgElement.src = imageUrl;
            imgElement.style.maxWidth = '100%';
            imgElement.style.display = 'block';
            imgElement.style.marginTop = '5px';
            imgElement.style.borderRadius = '5px';
            messageElement.appendChild(imgElement);
        }
    } else if (sender === 'Bot') {
        messageElement.classList.add('bot-message');
        // Only add successful bot responses to history
        // conversationHistory.push({ role: "assistant", content: text });
        const formattedHtml = simpleMarkdownToHtml(text);
        textNode.innerHTML = formattedHtml;
    } else { // System messages
        messageElement.classList.add('system-message');
        textNode.textContent = text; // Don't format system messages
    }

    messageElement.appendChild(textNode);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Limit history only after adding a successful bot response or user message
    // Limit history is now called within sendMessage after successful additions
    // limitHistory();
}

function limitHistory() {
    const maxHistoryLength = 10;
    if (conversationHistory.length > maxHistoryLength) {
        const startIndex = conversationHistory.findIndex(msg => msg.role !== "system");
        if (startIndex !== -1 && conversationHistory.length - startIndex > maxHistoryLength) {
            conversationHistory.splice(startIndex, conversationHistory.length - startIndex - maxHistoryLength);
        }
    }
}

// --- Thinking Indicator & UI State ---
function showThinkingIndicator() {
    removeThinkingIndicator(); // Ensure no duplicates
    const thinkingIndicator = document.createElement('div');
    thinkingIndicator.classList.add('message', 'bot-message');
    thinkingIndicator.id = 'thinking-indicator';
    const dot1 = document.createElement('span'); dot1.textContent = '.';
    const dot2 = document.createElement('span'); dot2.textContent = '.';
    const dot3 = document.createElement('span'); dot3.textContent = '.';
    thinkingIndicator.append('Bot is thinking', dot1, dot2, dot3);
    dot1.style.animation = 'blink 1.4s infinite both';
    dot2.style.animation = 'blink 1.4s infinite both 0.2s';
    dot3.style.animation = 'blink 1.4s infinite both 0.4s';
    chatBox.appendChild(thinkingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Show stop button, hide send button
    stopButton.style.display = 'flex'; // Use 'flex' because it uses flex properties
    sendButton.style.display = 'none';
}

function removeThinkingIndicator() {
    const indicator = document.getElementById('thinking-indicator');
    if (indicator) {
        chatBox.removeChild(indicator);
    }
    // Hide stop button, show send button
    stopButton.style.display = 'none';
    sendButton.style.display = 'block'; // Or 'flex' if send button uses it
}

// --- Send Message Logic ---
async function sendMessage() {
    const userMessageText = messageInput.value.trim();
    const imageToSend = selectedImageFile;

    if (!userMessageText && !imageToSend) return;

    let displayMessage = userMessageText;
    let historyMessage = userMessageText;
    let userImagePreviewUrl = null;

    if (imageToSend) {
        userImagePreviewUrl = URL.createObjectURL(imageToSend);
        const imagePlaceholder = `[User uploaded image: ${imageToSend.name || 'pasted_image'}]`;
        historyMessage = userMessageText ? `${userMessageText}\n${imagePlaceholder}` : imagePlaceholder;
        displayMessage = userMessageText;
    }

    // Add user message to history *before* sending API request
    conversationHistory.push({ role: "user", content: historyMessage });
    limitHistory(); // Limit history after adding user message

    // Display user message visually
    appendMessage('User', displayMessage, userImagePreviewUrl);

    messageInput.value = '';
    clearImageSelection();

    sendButton.disabled = true;
    messageInput.disabled = true;
    imageUpload.disabled = true;
    showThinkingIndicator(); // This now also shows the stop button

    // --- AbortController Setup ---
    currentAbortController = new AbortController(); // Create a new controller for this request

    const formData = new FormData();
    // Send *current* history (including latest user message)
    formData.append('history', JSON.stringify(conversationHistory));
    if (imageToSend) {
        const filename = imageToSend.name || `pasted_image.${imageToSend.type.split('/')[1] || 'png'}`;
        formData.append('image', imageToSend, filename);
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: formData,
            signal: currentAbortController.signal // Pass the signal to fetch
        });

        // No need to remove indicator here, finally block handles it

        if (!response.ok) {
            // Handle non-OK responses (like 4xx, 5xx errors from the function)
             const errorData = await response.json().catch(() => ({ error: `API Error: ${response.statusText} (${response.status})` }));
             throw new Error(errorData.error || `API Error: ${response.statusText} (${response.status})`);
        }

        const data = await response.json();

        // Add successful bot response to history here
        conversationHistory.push({ role: "assistant", content: data.reply });
        limitHistory(); // Limit history after adding bot response

        // Display bot response
        appendMessage('Bot', data.reply);

    } catch (error) {
        if (error.name === 'AbortError') {
            // Fetch was aborted by the user clicking stop. Log it but don't show generic error.
            console.log('Fetch aborted by user.');
            // System message indicating stop was already added in handleStopGeneration
        } else {
            // Handle other errors (network, API errors from function)
            console.error("Error fetching chatbot response:", error);
            appendMessage('System', `Error: ${error.message}`);
        }
        // Indicator removal is handled in finally

    } finally {
         // Clean up regardless of success, error, or abortion
         removeThinkingIndicator(); // This now also hides the stop button
         sendButton.disabled = false;
         messageInput.disabled = false;
         imageUpload.disabled = false;
         messageInput.focus();
         currentAbortController = null; // Clear the controller
         if (userImagePreviewUrl) {
            URL.revokeObjectURL(userImagePreviewUrl);
         }
    }
}

// --- Initial Event Listeners ---
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});