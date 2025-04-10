const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

// Example: Maintain some basic history (optional)
let conversationHistory = [
    // You could prime it with system messages if needed
    // { role: "system", content: "You are a helpful assistant." }
];

function appendMessage(sender, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    if (sender === 'User') {
        messageElement.classList.add('user-message');
        // Add to history for sending to API
        conversationHistory.push({ role: "user", content: text });
    } else if (sender === 'Bot') {
        messageElement.classList.add('bot-message');
        // Add to history for sending to API
        conversationHistory.push({ role: "assistant", content: text });
    } else {
        messageElement.classList.add('system-message');
    }

    // Sanitize text before inserting as HTML if it could contain HTML characters
    // A simple approach (replace < and >), more robust sanitization might be needed
    const sanitizedText = text.replace(/</g, "<").replace(/>/g, ">");
    messageElement.innerHTML = sanitizedText; // Using innerHTML for simple formatting like line breaks if needed later

    chatBox.appendChild(messageElement);
    // Scroll to the bottom
    chatBox.scrollTop = chatBox.scrollHeight;

    // Optional: Limit history size to prevent huge API requests
    const maxHistoryLength = 10; // Keep last 10 messages (user + bot)
    if (conversationHistory.length > maxHistoryLength) {
        // Remove the oldest message(s) after the initial system message if any
        const startIndex = conversationHistory.findIndex(msg => msg.role !== "system"); // find first non-system message
        if (startIndex !== -1 && conversationHistory.length - startIndex > maxHistoryLength) {
             conversationHistory.splice(startIndex, conversationHistory.length - startIndex - maxHistoryLength);
        }
    }
}

async function sendMessage() {
    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    appendMessage('User', userMessage);
    messageInput.value = '';
    sendButton.disabled = true;
    messageInput.disabled = true; // Disable input too

    // Display typing indicator (optional)
    const typingIndicator = document.createElement('div');
    typingIndicator.classList.add('message', 'bot-message');
    typingIndicator.textContent = 'Bot is typing...';
    typingIndicator.id = 'typing-indicator';
    chatBox.appendChild(typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;


    try {
        // Send message history to your Cloudflare Function endpoint
        const response = await fetch('/api/chat', { // Path to your function
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send the recent history along with the new message
            body: JSON.stringify({ messages: conversationHistory }),
        });

         // Remove typing indicator
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            chatBox.removeChild(indicator);
        }


        if (!response.ok) {
            const errorData = await response.json(); // Try to get error details
            throw new Error(errorData.error || `API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // Display bot response
        appendMessage('Bot', data.reply);

    } catch (error) {
        console.error("Error fetching chatbot response:", error);
        appendMessage('System', `Error: ${error.message}`);
         // Remove typing indicator in case of error too
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            chatBox.removeChild(indicator);
        }
    } finally {
         sendButton.disabled = false;
         messageInput.disabled = false; // Re-enable input
         messageInput.focus(); // Focus back on input
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    // Send message on Enter key press, unless Shift is held (for multi-line input)
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default Enter behavior (new line)
        sendMessage();
    }
});