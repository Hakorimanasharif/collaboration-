const currentUser = "{{currentUser}}";
const socket = io("http://localhost:3002");

// DOM Elements
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const userList = document.getElementById('user-list');

// Add event listener for chat form submission to send messages
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const messageText = messageInput.value.trim();
    if (messageText === '') return;

    const message = {
        sender: currentUser,
        type: 'text',
        text: messageText,
        timestamp: new Date()
    };

    socket.emit('chat message', message);
    messageInput.value = '';
});

const stickerBtn = document.getElementById('sticker-btn');
const stickerPicker = document.getElementById('sticker-picker');
const fileInput = document.getElementById('file-input');
const voiceBtn = document.getElementById('voice-btn');
const typingIndicator = document.getElementById('typing-indicator');
const reactionPicker = document.getElementById('reaction-picker');
const themeSelector = document.getElementById('theme-selector');
const vanishModeBtn = document.getElementById('vanish-mode-btn');
const callBtn = document.getElementById('call-btn');

// State variables
let isTyping = false;
let typingTimeout;
let vanishMode = false;
let currentTheme = 'light';
let recordedChunks = [];
let mediaRecorder;

// Helper functions
function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

function formatTimestamp(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator(username) {
    typingIndicator.textContent = `${username} is typing...`;
    typingIndicator.style.display = 'block';
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

// Message handling
function addMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.sender === currentUser ? 'sent' : 'received'}`;
    messageDiv.dataset.id = msg.id || Date.now();
    messageDiv.dataset.sender = msg.sender;

    let contentHtml = '';
    if (msg.type === 'text') {
        contentHtml = `
            <div class="message-header">
                <span class="sender">${msg.sender === currentUser ? 'You' : msg.sender}</span>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                ${msg.sender === currentUser ? '<button class="delete-btn" title="Delete message">🗑️</button>' : ''}
            </div>
            <div class="message-content">${msg.text}</div>
            ${msg.replyTo ? `<div class="reply-preview">Replying to: ${msg.replyTo.text || 'message'}</div>` : ''}
        `;
    } else if (msg.type === 'image') {
        contentHtml = `
            <div class="message-header">
                <span class="sender">${msg.sender === currentUser ? 'You' : msg.sender}</span>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                ${msg.sender === currentUser ? '<button class="delete-btn" title="Delete message">🗑️</button>' : ''}
            </div>
            <div class="message-content">
                <img src="${msg.url}" alt="Image" class="message-media" />
                ${msg.disappearing ? '<span class="disappearing-badge">Disappearing</span>' : ''}
            </div>
        `;
    } else if (msg.type === 'sticker') {
        contentHtml = `
            <div class="message-header">
                <span class="sender">${msg.sender === currentUser ? 'You' : msg.sender}</span>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                ${msg.sender === currentUser ? '<button class="delete-btn" title="Delete message">🗑️</button>' : ''}
            </div>
            <div class="message-content">
                <img src="${msg.url}" alt="Sticker" class="message-sticker" />
            </div>
        `;
    } else if (msg.type === 'voice') {
        contentHtml = `
            <div class="message-header">
                <span class="sender">${msg.sender === currentUser ? 'You' : msg.sender}</span>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                ${msg.sender === currentUser ? '<button class="delete-btn" title="Delete message">🗑️</button>' : ''}
            </div>
            <div class="message-content voice-message">
                <audio controls src="${msg.url}"></audio>
            </div>
        `;
    } else if (msg.type === 'file') {
        contentHtml = `
            <div class="message-header">
                <span class="sender">${msg.sender === currentUser ? 'You' : msg.sender}</span>
                <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                ${msg.sender === currentUser ? '<button class="delete-btn" title="Delete message">🗑️</button>' : ''}
            </div>
            <div class="message-content file-message">
                <a href="${msg.url}" download="${msg.filename}">${msg.filename}</a>
                <span class="file-size">${formatFileSize(msg.size)}</span>
            </div>
        `;
    }

    // Add reactions if any
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        contentHtml += `<div class="message-reactions">${Object.entries(msg.reactions).map(([emoji, users]) => 
            `<span class="reaction">${emoji} ${users.length}</span>`
        ).join('')}</div>`;
    }

    messageDiv.innerHTML = contentHtml;
    
    // Add context menu for messages
    if (msg.sender === currentUser) {
        messageDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMessageContextMenu(e, msg);
        });

        // Add click listener for delete button
        const deleteBtn = messageDiv.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                deleteMessage(msg.id || msg._id);
            });
        }
    }
    
    // Add double-click for quick reaction
    messageDiv.addEventListener('dblclick', () => {
        addReaction(msg.id || messageDiv.dataset.id, '❤️');
    });

    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

// Message context menu
function showMessageContextMenu(e, msg) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    
    menu.innerHTML = `
        <div class="menu-item" data-action="delete">Delete</div>
        <div class="menu-item" data-action="react">Add Reaction</div>
        ${msg.type === 'text' ? '<div class="menu-item" data-action="edit">Edit</div>' : ''}
    `;
    
    document.body.appendChild(menu);
    
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            switch(item.dataset.action) {
                case 'delete':
                    deleteMessage(msg.id || msg._id);
                    break;
                case 'react':
                    showReactionPicker(msg.id || msg._id);
                    break;
                case 'edit':
                    editMessage(msg.id || msg._id, msg.text);
                    break;
            }
            menu.remove();
        });
    });
    
    // Close menu when clicking elsewhere
    document.addEventListener('click', function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    }, { once: true });
}

// Reaction handling
function showReactionPicker(messageId) {
    reactionPicker.dataset.messageId = messageId;
    reactionPicker.style.display = 'block';
    reactionPicker.style.position = 'absolute';
}

function addReaction(messageId, emoji) {
    socket.emit('add reaction', { messageId, emoji, user: currentUser });
    reactionPicker.style.display = 'none';
}

// Message actions
function deleteMessage(messageId) {
    socket.emit('delete message', { messageId, user: currentUser });
}

function editMessage(messageId, currentText) {
    const newText = prompt('Edit your message:', currentText);
    if (newText !== null && newText !== currentText) {
        socket.emit('edit message', { messageId, newText, user: currentUser });
    }
}

// Typing indicators
messageInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { user: currentUser, isTyping: true });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', { user: currentUser, isTyping: false });
    }, 1000);
});

// Voice message recording
voiceBtn.addEventListener('mousedown', startRecording);
voiceBtn.addEventListener('mouseup', stopRecording);
voiceBtn.addEventListener('mouseleave', stopRecording);

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                
                const formData = new FormData();
                formData.append('audio', blob, 'voice-message.webm');
                
                fetch('/upload-voice', {
                    method: 'POST',
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        const message = {
                            sender: currentUser,
                            type: 'voice',
                            url: data.url,
                            timestamp: new Date()
                        };
                        socket.emit('chat message', message);
                    }
                });
            };
            
            mediaRecorder.start();
        })
        .catch(err => console.error('Error recording audio:', err));
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// File sharing
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 
                         'text/plain', 'application/msword', 'application/vnd.ms-excel'];
    
    if (!allowedTypes.includes(file.type)) {
        alert('File type not allowed. Please upload images, PDFs, or text documents.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload-file', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const message = {
                sender: currentUser,
                type: 'file',
                url: data.url,
                filename: file.name,
                size: file.size,
                timestamp: new Date()
            };
            socket.emit('chat message', message);
            fileInput.value = '';
        } else {
            alert('File upload failed');
        }
    })
    .catch(() => alert('File upload failed'));
});

// Vanish mode
vanishModeBtn.addEventListener('click', () => {
    vanishMode = !vanishMode;
    vanishModeBtn.classList.toggle('active', vanishMode);
    alert(`Vanish mode ${vanishMode ? 'enabled' : 'disabled'}`);
});

// Theme switching
themeSelector.addEventListener('change', (e) => {
    currentTheme = e.target.value;
    document.body.className = currentTheme;
    localStorage.setItem('chatTheme', currentTheme);
});

// Initialize theme
const savedTheme = localStorage.getItem('chatTheme');
if (savedTheme) {
    currentTheme = savedTheme;
    document.body.className = currentTheme;
    themeSelector.value = currentTheme;
}

// Video call
callBtn.addEventListener('click', () => {
    if (confirm('Start a video call?')) {
        socket.emit('call request', { from: currentUser });
    }
});

// Socket.io event listeners
socket.on('chat message', function(msg) {
    if (msg.disappearing && msg.sender !== currentUser) {
        setTimeout(() => {
            const messageEl = document.querySelector(`.message[data-id="${msg.id}"]`);
            if (messageEl) {
                messageEl.style.opacity = '0.5';
                messageEl.textContent = 'This message has disappeared';
            }
        }, 10000); // Disappear after 10 seconds
    }
    addMessage(msg);
});

socket.on('typing', function(data) {
    if (data.user !== currentUser) {
        if (data.isTyping) {
            showTypingIndicator(data.user);
        } else {
            hideTypingIndicator();
        }
    }
});

socket.on('message deleted', function(messageId) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    if (messageEl) {
        // Add fade-out animation class
        messageEl.classList.add('fade-out');

        // After animation ends, update the message content and opacity
        messageEl.addEventListener('animationend', () => {
            messageEl.textContent = 'This message was deleted';
            messageEl.style.opacity = '0.5';
            messageEl.classList.remove('fade-out');
        }, { once: true });
    }
});

socket.on('message edited', function({ messageId, newText }) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    if (messageEl) {
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) contentEl.textContent = newText;
    }
});

socket.on('reaction added', function({ messageId, emoji, user }) {
    const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
    if (messageEl) {
        let reactionsEl = messageEl.querySelector('.message-reactions');
        if (!reactionsEl) {
            reactionsEl = document.createElement('div');
            reactionsEl.className = 'message-reactions';
            messageEl.appendChild(reactionsEl);
        }
        
        const existingReaction = reactionsEl.querySelector(`.reaction[data-emoji="${emoji}"]`);
        if (existingReaction) {
            const count = parseInt(existingReaction.textContent.match(/\d+/)[0]) + 1;
            existingReaction.textContent = `${emoji} ${count}`;
        } else {
            const reactionEl = document.createElement('span');
            reactionEl.className = 'reaction';
            reactionEl.dataset.emoji = emoji;
            reactionEl.textContent = `${emoji} 1`;
            reactionsEl.appendChild(reactionEl);
        }
    }
});

socket.on('user connected', function(data) {
    const userItem = document.querySelector(`.user-item[data-username="${data.username}"]`);
    if (userItem) {
        userItem.querySelector('.user-status').textContent = 'online';
        userItem.querySelector('.user-status').className = 'user-status online';
    }
});

socket.on('user disconnected', function(data) {
    const userItem = document.querySelector(`.user-item[data-username="${data.username}"]`);
    if (userItem) {
        userItem.querySelector('.user-status').textContent = 'offline';
        userItem.querySelector('.user-status').className = 'user-status offline';
    }
});

socket.on('call request', function(data) {
    if (confirm(`${data.from} is calling. Accept?`)) {
        // Here you would implement WebRTC call acceptance
        alert('Call connected! (WebRTC implementation would go here)');
    } else {
        socket.emit('call rejected', { to: data.from });
    }
});

// Initialize the chat
fetchChatHistory().then(scrollToBottom);

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fetch chat history from server and render messages
async function fetchChatHistory() {
    try {
        const response = await fetch('/api/chat/messages');
        if (!response.ok) {
            throw new Error('Failed to fetch chat history');
        }
        const messages = await response.json();
        messages.forEach(msg => addMessage(msg));
    } catch (error) {
        console.error('Error fetching chat history:', error);
    }
}
