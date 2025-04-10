const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewArea = document.getElementById('image-preview-area');
const chatContainer = document.getElementById('chat-container'); // Get chat container

let conversationHistory = [];
let selectedImageFile = null;

// --- Event Listener for Image Selection (File Input) ---
imageUpload.addEventListener('change', handleFileSelectEvent);

function handleFileSelectEvent(event) {
    const file = event.target.files[0];
    if (file) {
        processSelectedFile(file);
    }
    // Reset the input value so the same file can be selected again if removed
    event.target.value = null;
}

// --- NEW: Event Listener for Clipboard Paste ---
// Listen on the container or document to catch pastes even if input isn't focused
document.addEventListener('paste', handlePasteEvent);

function handlePasteEvent(event) {
    const items = (event.clipboardData || window.clipboardData)?.items;
    if (!items) return; // Clipboard data not accessible

    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        // Check if the item is an image file
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
                event.preventDefault(); // Prevent default paste action (e.g., pasting into text input)
                console.log("Image pasted from clipboard:", file.name);
                processSelectedFile(file);
                foundImage = true;
                break; // Process only the first image found
            }
        }
    }

    // Optional: Handle plain text paste directly into input if needed and no image found
    // if (!foundImage && event.target === messageInput) {
    //     // Allow default text paste into the input
    // } else if (!foundImage) {
    //     event.preventDefault(); // Prevent pasting non-image files elsewhere
    // }
}


// --- NEW: Central function to process a selected/pasted file ---
function processSelectedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        console.error("Invalid file selected/pasted.");
        return;
    }
     // Clear any previously selected file before processing the new one
    clearImageSelection();
    selectedImageFile = file;
    displayImagePreview(file);
}

function clearImageSelection() {
    selectedImageFile = null;
    imagePreviewArea.innerHTML = '';
    // Also reset the file input visually in case it was used
    imageUpload.value = null;
}


function displayImagePreview(file) {
    imagePreviewArea.innerHTML = ''; // Clear previous preview first

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
    fileName.textContent = file.name || 'Pasted Image'; // Provide default name for clipboard images
    previewElement.appendChild(fileName);

    const removeButton = document.createElement('span');
    removeButton.textContent = '✖';
    removeButton.classList.add('remove-preview');
    removeButton.title = 'Remove image';
    removeButton.onclick = clearImageSelection; // Use the clearer function
    previewElement.appendChild(removeButton);

    imagePreviewArea.appendChild(previewElement);
}

// --- Simple Markdown to HTML Conversion ---
function simpleMarkdownToHtml(text) {
    if (!text) return '';
    let escapedText = text.replace(/&/g, '&')
                          .replace(/</g, '<')
                          .replace(/>/g, '>');
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escapedText = escapedText.replace(/\n/g, '<br>');
    return escapedText;
}


// --- Message Handling ---
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
        conversationHistory.push({ role: "assistant", content: text });
        const formattedHtml = simpleMarkdownToHtml(text);
        textNode.innerHTML = formattedHtml;

    } else {
        messageElement.classList.add('system-message');
        textNode.textContent = text;
    }

    messageElement.appendChild(textNode);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    limitHistory();
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

function showThinkingIndicator() {
    removeThinkingIndicator();
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
        // Use a consistent placeholder name, actual filename sent in FormData
        const imagePlaceholder = `[User uploaded image: ${imageToSend.name || 'pasted_image'}]`;
        historyMessage = userMessageText ? `${userMessageText}\n${imagePlaceholder}` : imagePlaceholder;
        displayMessage = userMessageText;
    }

    appendMessage('User', displayMessage, userImagePreviewUrl);

    conversationHistory.push({ role: "user", content: historyMessage });
    limitHistory();

    messageInput.value = '';
    // Use the clearer function here too
    clearImageSelection();


    sendButton.disabled = true;
    messageInput.disabled = true;
    imageUpload.disabled = true;
    showThinkingIndicator();


    const formData = new FormData();
    formData.append('history', JSON.stringify(conversationHistory));
    if (imageToSend) {
        // Provide a filename if one wasn't available (e.g., from clipboard)
        const filename = imageToSend.name || `pasted_image.${imageToSend.type.split('/')[1] || 'png'}`;
        formData.append('image', imageToSend, filename);
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
        appendMessage('Bot', data.reply);

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