// Chat Application JavaScript - Synchronized with Meeting Names
class ChatApp {
 constructor() {
    this.socket = io();
    this.myName = ""; // Initialize as empty
    this.selectedChat = 'general';
    this.currentPrivateRecipient = null;
    this.chatHistory = { general: [] };
    this.groupsData = {};
    this.typingUsers = {};
    this.editingMessageId = null;
    this.editingChatId = null;
    this.currentConfig = { chatEnabled: true, generalOnly: false, allowGroupCreation: true };
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.typingTimeout = null;
    this.users = {}; // Store users data
    this.meetingNameSynced = false; // Track if we've synced with meeting
    
    this.fetchUserName().then(() => {
        this.init();
    });
}

async fetchUserName() {
    try {
        // First priority: Get name from meeting instance if available
        if (window.hostMeetingInstance && window.hostMeetingInstance.userName) {
            this.myName = window.hostMeetingInstance.userName;
            this.meetingNameSynced = true;
            console.log('Chat user name synchronized with meeting host:', this.myName);
            return;
        }
        
        // Second priority: Get name from meeting participant data if available
        if (window.meetingParticipantName) {
            this.myName = window.meetingParticipantName;
            this.meetingNameSynced = true;
            console.log('Chat user name synchronized with meeting participant:', this.myName);
            return;
        }
        
        // Third priority: Check for global meeting user name
        if (window.myMeetingName) {
            this.myName = window.myMeetingName;
            this.meetingNameSynced = true;
            console.log('Chat user name synchronized with global meeting name:', this.myName);
            return;
        }
        
        // Fallback: Try API endpoint
        const response = await fetch('/api/user');
        const data = await response.json();
        if (data.user && data.user.name) {
            this.myName = data.user.name;
            console.log('Chat user name set from API:', this.myName);
        } else {
            // Final fallback: Use global variable or default
            this.myName = window.myName || "Anonymous User";
            console.log('Chat user name set to fallback:', this.myName);
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        // Enhanced fallback logic for meeting integration
        this.myName = window.hostMeetingInstance?.userName || 
                     window.meetingParticipantName || 
                     window.myMeetingName || 
                     window.myName || 
                     "Anonymous User";
        console.log('Chat user name set to fallback after error:', this.myName);
    }
}

    // New method to sync with meeting name changes
    syncWithMeetingName(newName) {
        if (newName && newName.trim() && newName !== this.myName) {
            const oldName = this.myName;
            this.myName = newName.trim();
            console.log(`Chat name synchronized: ${oldName} → ${this.myName}`);
            
            // Re-register with new name if socket is connected
            if (this.socket && this.socket.connected) {
                this.socket.emit('register', this.myName);
            }
            
            this.meetingNameSynced = true;
        }
    }

    // Enhanced init method to set up meeting name sync
    init() {
        this.setupSocketEvents();
        this.setupEventListeners();
        this.setupchatEmojiPicker();
        this.setupFormatting();
        this.setupMeetingNameSync();
        this.socket.emit('register', this.myName);
    }

    // New method to set up meeting name synchronization
    setupMeetingNameSync() {
        // Set up periodic sync with meeting name (every 2 seconds)
        setInterval(() => {
            this.checkAndSyncMeetingName();
        }, 2000);
        
        // Listen for meeting name change events if available
        if (window.addEventListener) {
            window.addEventListener('meetingNameChanged', (event) => {
                if (event.detail && event.detail.newName) {
                    this.syncWithMeetingName(event.detail.newName);
                }
            });
            
            window.addEventListener('participantNameChanged', (event) => {
                if (event.detail && event.detail.newName && event.detail.isCurrentUser) {
                    this.syncWithMeetingName(event.detail.newName);
                }
            });
        }
    }

    // Method to check and sync with current meeting name
    checkAndSyncMeetingName() {
        let currentMeetingName = null;
        
        // Check various sources for current meeting name
        if (window.hostMeetingInstance && window.hostMeetingInstance.userName) {
            currentMeetingName = window.hostMeetingInstance.userName;
        } else if (window.meetingParticipantName) {
            currentMeetingName = window.meetingParticipantName;
        } else if (window.myMeetingName) {
            currentMeetingName = window.myMeetingName;
        }
        
        // Also check if there's a meeting title element we can sync from
        const meetingTitleEl = document.querySelector('#meetingTitle, .meeting-title, .participant-name[data-is-current-user="true"]');
        if (meetingTitleEl && meetingTitleEl.textContent.trim()) {
            const titleName = meetingTitleEl.textContent.trim();
            // Only use if it looks like a participant name (not a meeting title)
            if (titleName && !titleName.includes('Meeting') && !titleName.includes('meeting') && titleName.length <= 50) {
                currentMeetingName = titleName;
            }
        }
        
        if (currentMeetingName && currentMeetingName !== this.myName) {
            this.syncWithMeetingName(currentMeetingName);
        }
    }

    setupSocketEvents() {
        // User management
        this.socket.on('updateUsers', (users) => this.updateUsersList(users));
        
        // Messages
        this.socket.on('receiveGeneralMessage', (data) => this.handleGeneralMessage(data));
        this.socket.on('receivePrivateMessage', (data) => this.handlePrivateMessage(data));
        this.socket.on('privateMessageSent', (data) => this.handlePrivateMessageSent(data));
        this.socket.on('receiveGroupMessage', (data) => this.handleGroupMessage(data));
        this.socket.on('messageDeleted', (data) => this.handleMessageDeleted(data));
        this.socket.on('messageEdited', (data) => this.handleMessageEdited(data));
        
        // Typing indicators
        this.socket.on('displayTyping', (data) => this.handleTypingStart(data));
        this.socket.on('removeTyping', (data) => this.handleTypingStop(data));
        
        // Groups
        this.socket.on('groupCreated', (group) => this.handleGroupCreated(group));
        this.socket.on('groupUpdated', (group) => this.handleGroupUpdated(group));
        this.socket.on('groupDeleted', (data) => this.handleGroupDeleted(data));
        this.socket.on('joinedGroup', (group) => this.handleJoinedGroup(group));
        this.socket.on('existingGroups', (groups) => this.handleExistingGroups(groups));
        
        // Configuration
        this.socket.on('configChanged', (config) => this.handleConfigChanged(config));
        
        // Meeting integration events
        this.socket.on('participant-renamed', (data) => this.handleMeetingParticipantRenamed(data));
        this.socket.on('meeting-name-changed', (data) => this.handleMeetingNameChanged(data));
        
        // NEW: Additional chat synchronization events
        this.socket.on('chat-participant-renamed', (data) => this.handleChatParticipantRenamed(data));
        this.socket.on('participant-name-changed', (data) => this.handleParticipantNameChanged(data));
        this.socket.on('prepare-name-change', (data) => this.handlePrepareNameChange(data));
    }

    // NEW: Handle chat-specific participant rename events
    handleChatParticipantRenamed(data) {
        console.log('Chat participant renamed:', data);
        this.updateOtherParticipantName(data);
    }

    // NEW: Handle general participant name changes
    handleParticipantNameChanged(data) {
        console.log('Participant name changed from meeting:', data);
        if (data.fromMeeting && data.socketId !== this.socket.id) {
            this.updateOtherParticipantName(data);
        }
    }

    // NEW: Prepare for incoming name change
    handlePrepareNameChange(data) {
        console.log('Preparing for name change:', data);
        // Pre-validate or prepare UI for name change if needed
    }
    

    // Enhanced handler for meeting participant name changes
    handleMeetingParticipantRenamed(data){
        console.log('Meeting participant renamed event received:', data);
        
        // Check if this rename affects the current user
        if (data.socketId === this.socket.id || 
            (data.newName && data.newName === this.myName) || 
            (data.oldName && data.oldName === this.myName)) {
            
            console.log('Current user renamed, syncing chat name:', data);
            this.syncWithMeetingName(data.newName);
        } else {
            // Handle other participants' name changes
            console.log('Other participant renamed, updating chat users list:', data);
            this.updateOtherParticipantName(data);
        }
    }

    // NEW: Method to update other participants' names in chat
    updateOtherParticipantName(data) {
        const { socketId, oldName, newName } = data;
        
        // Update the users object
        if (this.users && this.users[socketId]) {
            console.log(`Updating chat user: ${this.users[socketId]} → ${newName}`);
            this.users[socketId] = newName;
            
            // Update the participants list display
            this.updateUsersList(this.users);
            
            // Update names in existing chat history
            this.updateChatHistoryNames(socketId, oldName, newName);
            
            // Refresh current chat if needed
            if (this.selectedChat && this.renderChatHistory) {
                this.renderChatHistory(this.selectedChat);
            }
        }
    }

    // NEW: Update participant names in chat history
    updateChatHistoryNames(socketId, oldName, newName) {
        console.log(`Updating chat history names: ${oldName} → ${newName} for ${socketId}`);
        
        Object.keys(this.chatHistory).forEach(chatId => {
            const history = this.chatHistory[chatId];
            if (Array.isArray(history)) {
                history.forEach(message => {
                    // Update by socket ID (most reliable)
                    if (message.fromSocketId === socketId) {
                        message.from = newName;
                    }
                    // Also update by name match (fallback)
                    else if (message.from === oldName) {
                        message.from = newName;
                    }
                });
            }
        });
        
        console.log(`Updated ${Object.keys(this.chatHistory).length} chat histories`);
    }

    // New handler for meeting name changes
    handleMeetingNameChanged(data) {
        console.log('Meeting name changed:', data);
        // This could affect host name, so check and sync if needed
        this.checkAndSyncMeetingName();
    }

    setupEventListeners() {
        // Send button
        document.getElementById('sendButton').addEventListener('click', () => this.sendMessage());
        
        // Message input
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        messageInput.addEventListener('input', () => {
            this.sendTyping();
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => this.stopTyping(), 2000);
        });
        
        // File upload
        document.getElementById('fileButton').addEventListener('click', () => {
            document.getElementById('fileUpload').click();
        });
        
        document.getElementById('fileUpload').addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });
        
        // Voice recording
        document.getElementById('recordButton').addEventListener('click', () => {
            this.toggleRecording();
        });
        
        // Format toolbar toggle
        document.querySelector('.format-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFormatToolbar();
        });
        
        // chatEmoji picker toggle
        document.querySelector('.chatEmoji-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglechatEmojiPicker();
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chatEmoji-picker') && !e.target.closest('.chatEmoji-trigger')) {
                this.closechatEmojiPicker();
            }
            if (!e.target.closest('.format-toolbar') && !e.target.closest('.format-trigger')) {
                this.closeFormatToolbar();
            }
            if (!e.target.closest('.color-picker') && !e.target.closest('#colorBtn')) {
                this.closeColorPicker();
            }
            if (!e.target.closest('.link-input') && !e.target.closest('#linkBtn')) {
                this.closeLinkInput();
            }
        });
    }

    setupchatEmojiPicker() {
        const chatEmojiData = {
            people: [
                { char: '😀', name: 'grinning', keywords: ['happy', 'smile'] },
                { char: '😊', name: 'blush', keywords: ['happy', 'shy'] },
                { char: '😎', name: 'sunglasses', keywords: ['cool', 'sun'] },
                { char: '🥳', name: 'party', keywords: ['celebration', 'party'] },
                { char: '😂', name: 'joy', keywords: ['laugh', 'funny'] },
                { char: '🤔', name: 'thinking', keywords: ['think', 'hmm'] },
                { char: '😍', name: 'heart_eyes', keywords: ['love', 'like'] },
                { char: '🙄', name: 'eye_roll', keywords: ['whatever', 'annoyed'] },
                { char: '😭', name: 'crying', keywords: ['sad', 'tears'] },
                { char: '😴', name: 'sleeping', keywords: ['tired', 'sleep'] },
                { char: '🤗', name: 'hugging', keywords: ['hug', 'embrace'] },
                { char: '😘', name: 'kiss', keywords: ['love', 'kiss'] }
            ],
            animals: [
                { char: '🐶', name: 'dog', keywords: ['puppy', 'pet'] },
                { char: '🐱', name: 'cat', keywords: ['kitten', 'pet'] },
                { char: '🦁', name: 'lion', keywords: ['king', 'jungle'] },
                { char: '🐼', name: 'panda', keywords: ['china', 'bear'] },
                { char: '🐸', name: 'frog', keywords: ['green', 'pond'] },
                { char: '🦄', name: 'unicorn', keywords: ['magic', 'rainbow'] },
                { char: '🐧', name: 'penguin', keywords: ['cold', 'ice'] },
                { char: '🦋', name: 'butterfly', keywords: ['beautiful', 'fly'] },
                { char: '🐯', name: 'tiger', keywords: ['wild', 'stripes'] },
                { char: '🐨', name: 'koala', keywords: ['australia', 'cute'] },
                { char: '🦊', name: 'fox', keywords: ['clever', 'orange'] },
                { char: '🐺', name: 'wolf', keywords: ['wild', 'pack'] }
            ],
            food: [
                { char: '🍎', name: 'apple', keywords: ['fruit', 'healthy'] },
                { char: '🍕', name: 'pizza', keywords: ['food', 'italian'] },
                { char: '🍔', name: 'burger', keywords: ['fastfood', 'meal'] },
                { char: '🍩', name: 'donut', keywords: ['sweet', 'dessert'] },
                { char: '🍰', name: 'cake', keywords: ['birthday', 'sweet'] },
                { char: '🍪', name: 'cookie', keywords: ['snack', 'sweet'] },
                { char: '🍦', name: 'ice_cream', keywords: ['cold', 'summer'] },
                { char: '🍓', name: 'strawberry', keywords: ['fruit', 'red'] },
                { char: '🥑', name: 'avocado', keywords: ['healthy', 'green'] },
                { char: '🍌', name: 'banana', keywords: ['fruit', 'yellow'] },
                { char: '🍉', name: 'watermelon', keywords: ['fruit', 'summer'] },
                { char: '🍇', name: 'grapes', keywords: ['fruit', 'wine'] }
            ],
            travel: [
                { char: '✈️', name: 'plane', keywords: ['flight', 'travel'] },
                { char: '🚗', name: 'car', keywords: ['vehicle', 'drive'] },
                { char: '⛵', name: 'sailboat', keywords: ['boat', 'water'] },
                { char: '🚲', name: 'bicycle', keywords: ['bike', 'cycle'] },
                { char: '🚀', name: 'rocket', keywords: ['space', 'fast'] },
                { char: '🏖️', name: 'beach', keywords: ['vacation', 'sun'] },
                { char: '🗺️', name: 'map', keywords: ['navigation', 'explore'] },
                { char: '🎒', name: 'backpack', keywords: ['travel', 'adventure'] },
                { char: '🚂', name: 'train', keywords: ['railway', 'transport'] },
                { char: '🚁', name: 'helicopter', keywords: ['aircraft', 'rotor'] },
                { char: '🛸', name: 'ufo', keywords: ['alien', 'space'] },
                { char: '🏔️', name: 'mountain', keywords: ['peak', 'nature'] }
            ],
            activities: [
                { char: '⚽', name: 'soccer', keywords: ['football', 'sport'] },
                { char: '🎮', name: 'videogame', keywords: ['gaming', 'controller'] },
                { char: '🎸', name: 'guitar', keywords: ['music', 'instrument'] },
                { char: '🎭', name: 'theater', keywords: ['drama', 'mask'] },
                { char: '🎨', name: 'art', keywords: ['paint', 'creative'] },
                { char: '📚', name: 'books', keywords: ['read', 'study'] },
                { char: '🎬', name: 'movie', keywords: ['film', 'cinema'] },
                { char: '🎵', name: 'music', keywords: ['song', 'melody'] },
                { char: '🏀', name: 'basketball', keywords: ['sport', 'ball'] },
                { char: '🎯', name: 'target', keywords: ['aim', 'goal'] },
                { char: '🎪', name: 'circus', keywords: ['tent', 'show'] },
                { char: '🎲', name: 'dice', keywords: ['game', 'random'] }
            ]
        };

        this.chatEmojiData = chatEmojiData;
        this.renderchatEmojis('all');

        // Setup chatEmoji search
        document.getElementById('chatEmojiSearch').addEventListener('input', (e) => {
            this.renderchatEmojis('all', e.target.value.toLowerCase());
        });

        // Setup chatEmoji categories
        document.querySelectorAll('.chatEmoji-category').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.chatEmoji-category').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderchatEmojis(btn.dataset.category);
            });
        });
    }

    renderchatEmojis(category, searchTerm = '') {
        const chatEmojiGrid = document.getElementById('chatEmojiGrid');
        chatEmojiGrid.innerHTML = '';

        let chatEmojisToShow = [];
        
        if (category === 'all') {
            Object.values(this.chatEmojiData).forEach(categorychatEmojis => {
                chatEmojisToShow.push(...categorychatEmojis);
            });
        } else {
            chatEmojisToShow = this.chatEmojiData[category] || [];
        }

        if (searchTerm) {
            chatEmojisToShow = chatEmojisToShow.filter(chatEmoji => 
                chatEmoji.name.includes(searchTerm) || 
                chatEmoji.keywords.some(keyword => keyword.includes(searchTerm))
            );
        }

        chatEmojisToShow.forEach(chatEmoji => {
            const chatEmojiElement = document.createElement('div');
            chatEmojiElement.className = 'chatEmoji-item';
            chatEmojiElement.textContent = chatEmoji.char;
            chatEmojiElement.title = chatEmoji.name;
            chatEmojiElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertchatEmoji(chatEmoji.char);
                this.closechatEmojiPicker();
            });
            chatEmojiGrid.appendChild(chatEmojiElement);
        });

        if (chatEmojisToShow.length === 0) {
            chatEmojiGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #9CA3AF;">No chatEmojis found</div>';
        }
    }

    insertchatEmoji(chatEmoji) {
        const messageInput = document.getElementById('messageInput');
        messageInput.focus();
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const chatEmojiNode = document.createTextNode(chatEmoji);
            range.insertNode(chatEmojiNode);
            range.setStartAfter(chatEmojiNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            messageInput.innerHTML += chatEmoji;
        }
    }

    setupFormatting() {
        // Format buttons
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const format = btn.dataset.format;
                if (format) {
                    this.applyFormat(format);
                }
            });
        });

        // Color picker
        document.getElementById('colorBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleColorPicker();
        });

        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = option.dataset.color;
                this.applyColor(color);
                this.closeColorPicker();
            });
        });

        // Link insertion
        document.getElementById('linkBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLinkInput();
        });

        document.getElementById('insertLinkBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.insertLink();
        });

        document.getElementById('urlInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                this.insertLink();
            }
        });
    }

    applyFormat(format) {
        const messageInput = document.getElementById('messageInput');
        messageInput.focus();

        switch (format) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'code':
                this.wrapSelection('code');
                break;
            case 'clear':
                messageInput.innerHTML = '';
                break;
        }
    }

    wrapSelection(tag) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const selectedText = range.toString();
            
            if (selectedText) {
                const element = document.createElement(tag);
                element.textContent = selectedText;
                range.deleteContents();
                range.insertNode(element);
                
                // Move cursor after the inserted element
                range.setStartAfter(element);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    applyColor(color) {
        const messageInput = document.getElementById('messageInput');
        messageInput.focus();
        document.execCommand('foreColor', false, color);
    }

    insertLink() {
        const url = document.getElementById('urlInput').value.trim();
        if (url) {
            const messageInput = document.getElementById('messageInput');
            messageInput.focus();
            document.execCommand('createLink', false, url);
            document.getElementById('urlInput').value = '';
            this.closeLinkInput();
        }
    }

    // UI Toggle Methods
    toggleFormatToolbar() {
        const toolbar = document.getElementById('formatToolbar');
        const isActive = toolbar.classList.contains('active');
        
        // Close other dropdowns
        this.closechatEmojiPicker();
        this.closeColorPicker();
        this.closeLinkInput();
        
        if (isActive) {
            toolbar.classList.remove('active');
        } else {
            toolbar.classList.add('active');
        }
    }

    closeFormatToolbar() {
        document.getElementById('formatToolbar').classList.remove('active');
    }

    togglechatEmojiPicker() {
        const picker = document.getElementById('chatEmojiPicker');
        const isActive = picker.classList.contains('active');
        
        // Close other dropdowns
        this.closeFormatToolbar();
        this.closeColorPicker();
        this.closeLinkInput();
        
        if (isActive) {
            picker.classList.remove('active');
        } else {
            picker.classList.add('active');
        }
    }

    closechatEmojiPicker() {
        document.getElementById('chatEmojiPicker').classList.remove('active');
    }

    toggleColorPicker() {
        const picker = document.getElementById('colorPicker');
        const isActive = picker.classList.contains('active');
        
        if (isActive) {
            picker.classList.remove('active');
        } else {
            picker.classList.add('active');
        }
    }

    closeColorPicker() {
        document.getElementById('colorPicker').classList.remove('active');
    }

    toggleLinkInput() {
        const linkInput = document.getElementById('linkInput');
        const isActive = linkInput.classList.contains('active');
        
        if (isActive) {
            linkInput.classList.remove('active');
        } else {
            linkInput.classList.add('active');
            document.getElementById('urlInput').focus();
        }
    }

    closeLinkInput() {
        document.getElementById('linkInput').classList.remove('active');
    }

    // Message Methods
    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const messageText = messageInput.innerHTML.trim();
        
        if (!messageText || !this.currentConfig.chatEnabled) return;

        // Double-check name sync before sending message
        this.checkAndSyncMeetingName();

        const id = Date.now() + '-' + Math.floor(Math.random() * 1000);
        
        if (this.selectedChat === 'general') {
            this.socket.emit('sendMessage', { id, to: 'general', message: messageText });
        } else if (this.selectedChat.startsWith("group-")) {
            this.socket.emit('sendGroupMessage', { id, groupId: this.selectedChat, message: messageText });
        } else {
            // For private messages, don't add to local history immediately
            // Wait for the server confirmation
            this.socket.emit('sendMessage', { id, to: this.currentPrivateRecipient, message: messageText });
        }

        messageInput.innerHTML = '';
        this.stopTyping();
    }

    displayMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.from === this.myName ? 'sent' : 'received'}`;
        messageDiv.dataset.messageId = message.id;

        let content = '';
        
        if (message.type === 'text') {
            content = `
                <div class="message-content">${message.message}</div>
                <div class="message-info">
                    <span>${message.from}</span>
                    ${message.edited ? '<span class="edited-marker">(edited)</span>' : ''}
                    <div class="message-actions">
                        ${message.from === this.myName && this.currentConfig.chatEnabled ? `
                            <button class="message-action edit" onclick="chatApp.openEditMessageModal('${message.id}', \`${message.message.replace(/`/g, '\\`')}\`)">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${message.from === this.myName && this.currentConfig.chatEnabled ? `
                            <button class="message-action delete" onclick="chatApp.deleteMessage('${message.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            content = this.renderMediaMessage(message);
        }

        messageDiv.innerHTML = content;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    renderMediaMessage(message) {
        const { from, message: fileUrl, type, filename } = message;
        
        let mediaContent = '';
        
        switch (type) {
            case 'image':
            case 'gif':
                mediaContent = `
                    <img src="${fileUrl}" alt="Image" style="max-width: 100%; border-radius: 8px;">
                    <br><a href="${fileUrl}" download class="download-link">
                        <i class="fas fa-download"></i> Download Image
                    </a>
                `;
                break;
            case 'video':
                mediaContent = `
                    <video src="${fileUrl}" controls style="max-width: 100%; border-radius: 8px;"></video>
                    <br><a href="${fileUrl}" download class="download-link">
                        <i class="fas fa-download"></i> Download Video
                    </a>
                `;
                break;
            case 'audio':
                mediaContent = `
                    <audio src="${fileUrl}" controls style="width: 100%;"></audio>
                    <br><a href="${fileUrl}" download class="download-link">
                        <i class="fas fa-download"></i> Download Audio
                    </a>
                `;
                break;
            case 'document':
                mediaContent = `
                    <a href="${fileUrl}" download class="download-link">
                        <i class="fas fa-file"></i> ${filename || 'Download Document'}
                    </a>
                `;
                break;
        }

        return `
            <div class="message-content">
                <strong>${from}:</strong><br>
                ${mediaContent}
            </div>
            <div class="message-info">
                <span>${from}</span>
                ${message.from === this.myName && this.currentConfig.chatEnabled ? `
                    <div class="message-actions">
                        <button class="message-action delete" onclick="chatApp.deleteMessage('${message.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    deleteMessage(id) {
        this.socket.emit('deleteMessage', { id, to: this.selectedChat });
        
        if (this.chatHistory[this.selectedChat]) {
            this.chatHistory[this.selectedChat] = this.chatHistory[this.selectedChat].filter(msg => msg.id !== id);
            this.renderChatHistory(this.selectedChat);
        }
    }

    openEditMessageModal(messageId, currentText) {
        this.editingMessageId = messageId;
        this.editingChatId = this.selectedChat;
        
        // Strip HTML tags for editing
        const textContent = currentText.replace(/<[^>]*>/g, '');
        document.getElementById('editMessageInput').value = textContent;
        document.getElementById('editMessageModal').classList.add('active');
    }

    closeEditMessageModal() {
        this.editingMessageId = null;
        this.editingChatId = null;
        document.getElementById('editMessageModal').classList.remove('active');
    }

    submitEditMessage() {
        const newText = document.getElementById('editMessageInput').value.trim();
        if (!newText) {
            this.closeEditMessageModal();
            return;
        }

        if (this.chatHistory[this.editingChatId]) {
            this.chatHistory[this.editingChatId] = this.chatHistory[this.editingChatId].map(msg => {
                if (msg.id === this.editingMessageId) {
                    return { ...msg, message: newText, edited: true };
                }
                return msg;
            });
            this.renderChatHistory(this.editingChatId);
        }

        this.socket.emit('editMessage', { 
            id: this.editingMessageId, 
            to: this.editingChatId, 
            newMessage: newText 
        });
        
        this.closeEditMessageModal();
    }

    // File Upload Methods
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const id = Date.now() + '-' + Math.floor(Math.random() * 1000);
        const formData = new FormData();
        formData.append('file', file);

        const statusDiv = document.getElementById('uploadStatus');
        statusDiv.textContent = 'Uploading...';

        fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.fileUrl) {
                    statusDiv.textContent = 'File uploaded successfully.';
                    
                    let type = 'document';
                    if (file.type.startsWith('image/')) {
                        type = file.type === 'image/gif' ? 'gif' : 'image';
                    } else if (file.type.startsWith('video/')) {
                        type = 'video';
                    } else if (file.type.startsWith('audio/')) {
                        type = 'audio';
                    }

                    const payload = { id, fileUrl: data.fileUrl, fileType: type };
                    if (type === 'document') {
                        payload.filename = data.filename;
                    }

                    if (this.selectedChat === 'general') {
                        payload.to = 'general';
                        this.socket.emit('sendMedia', payload);
                    } else if (this.selectedChat.startsWith('group-')) {
                        this.socket.emit('sendGroupMessage', { 
                            id, 
                            groupId: this.selectedChat, 
                            message: data.fileUrl, 
                            type: type 
                        });
                    } else {
                        payload.to = this.currentPrivateRecipient;
                        this.socket.emit('sendMedia', payload);
                    }
                    
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 3000);
                } else {
                    statusDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
                }
            })
            .catch(err => {
                statusDiv.textContent = 'Upload failed: ' + err;
            });

        // Reset file input
        event.target.value = '';
    }

    // Voice Recording Methods
    toggleRecording() {
        if (!this.currentConfig.chatEnabled) return;
        
        if (!this.isRecording) {
            this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showNotification('Your browser does not support audio recording.', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.mediaRecorder = new MediaRecorder(stream);
                this.recordedChunks = [];
                
                this.mediaRecorder.ondataavailable = e => {
                    if (e.data.size > 0) {
                        this.recordedChunks.push(e.data);
                    }
                };
                
                this.mediaRecorder.onstop = () => this.uploadVoiceMessage();
                this.mediaRecorder.start();
                
                this.isRecording = true;
                const recordBtn = document.getElementById('recordButton');
                recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
                recordBtn.style.background = 'var(--error-color)';
            })
            .catch(err => {
                console.error('Error accessing microphone:', err);
                this.showNotification('Could not start recording.', 'error');
            });
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            const recordBtn = document.getElementById('recordButton');
            recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            recordBtn.style.background = '';
            
            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    uploadVoiceMessage() {
        const blob = new Blob(this.recordedChunks, { type: 'audio/ogg' });
        const id = Date.now() + '-' + Math.floor(Math.random() * 1000);
        const formData = new FormData();
        formData.append('file', blob, 'voice_message.ogg');

        const statusDiv = document.getElementById('uploadStatus');
        statusDiv.textContent = 'Uploading voice message...';

        fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.fileUrl) {
                    statusDiv.textContent = 'Voice message uploaded.';
                    
                    const payload = { id, fileUrl: data.fileUrl, fileType: 'audio' };
                    
                    if (this.selectedChat === 'general') {
                        payload.to = 'general';
                        this.socket.emit('sendMedia', payload);
                    } else if (this.selectedChat.startsWith('group-')) {
                        this.socket.emit('sendGroupMessage', { 
                            id, 
                            groupId: this.selectedChat, 
                            message: data.fileUrl, 
                            type: 'audio' 
                        });
                    } else {
                        payload.to = this.currentPrivateRecipient;
                        this.socket.emit('sendMedia', payload);
                    }
                    
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 3000);
                } else {
                    statusDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
                }
            })
            .catch(err => {
                statusDiv.textContent = 'Upload failed: ' + err;
            });
    }

    // Typing Methods
    sendTyping() {
        if (this.selectedChat === 'general' || this.selectedChat.startsWith('group-')) {
            this.socket.emit('typing', { to: this.selectedChat, conversation: this.selectedChat });
        } else {
            this.socket.emit('typing', { to: this.currentPrivateRecipient, conversation: this.selectedChat });
        }
    }

    stopTyping() {
        if (this.selectedChat === 'general' || this.selectedChat.startsWith('group-')) {
            this.socket.emit('stopTyping', { to: this.selectedChat, conversation: this.selectedChat });
        } else {
            this.socket.emit('stopTyping', { to: this.currentPrivateRecipient, conversation: this.selectedChat });
        }
    }

    // Socket Event Handlers
    updateUsersList(users) {
        console.log('Updating chat users list:', users);
        this.users = users; // Store users data
        const participantsList = document.getElementById('participants-chat');
        
        if (!participantsList) {
            console.warn('Chat participants list element not found');
            return;
        }
        
        participantsList.innerHTML = `
            <li class="${this.selectedChat === 'general' ? 'active' : ''}" onclick="chatApp.selectChat('general')">
                <i class="fas fa-globe"></i> General
            </li>
        `;

        for (const [socketId, name] of Object.entries(users)) {
            if (socketId !== this.socket.id) {
                const li = document.createElement('li');
                const key = this.getPrivateChatKey(this.socket.id, socketId);
                li.className = this.selectedChat === key ? 'active' : '';
                li.innerHTML = `<i class="fas fa-user"></i> ${name}`;
                li.onclick = () => {
                    if (this.currentConfig.generalOnly) return;
                    this.currentPrivateRecipient = socketId;
                    this.selectChat(key);
                };
                participantsList.appendChild(li);

                if (!this.chatHistory[key]) {
                    this.chatHistory[key] = [];
                }
            }
        }
        
        console.log(`Updated chat participants list with ${Object.keys(users).length} users`);
    }

    handleGeneralMessage(data) {
        this.chatHistory['general'].push(data);
        if (this.selectedChat === 'general') {
            this.displayMessage(data);
        }
    }

    handlePrivateMessage(data) {
        let key;
        if (data.fromSocketId === this.socket.id) {
            key = this.getPrivateChatKey(this.socket.id, data.to);
        } else {
            key = this.getPrivateChatKey(data.fromSocketId, this.socket.id);
            if (this.selectedChat !== key) {
                this.showNotification(`${data.from}: ${data.message}`);
            }
        }

        if (!this.chatHistory[key]) {
            this.chatHistory[key] = [];
        }
        
        this.chatHistory[key].push(data);
        
        if (this.selectedChat === key) {
            this.displayMessage(data);
        }
    }

    // New handler for sent private messages to avoid duplication
    handlePrivateMessageSent(data) {
        const key = this.getPrivateChatKey(this.socket.id, data.to);
        
        if (!this.chatHistory[key]) {
            this.chatHistory[key] = [];
        }
        
        this.chatHistory[key].push(data);
        
        if (this.selectedChat === key) {
            this.displayMessage(data);
        }
    }

    handleGroupMessage(data) {
        if (!this.chatHistory[data.groupId]) {
            this.chatHistory[data.groupId] = [];
        }
        
        this.chatHistory[data.groupId].push(data);
        
        if (this.selectedChat === data.groupId) {
            this.displayMessage(data);
        }
    }

    handleMessageDeleted(data) {
        if (this.chatHistory[data.chat]) {
            this.chatHistory[data.chat] = this.chatHistory[data.chat].filter(msg => msg.id !== data.id);
            if (this.selectedChat === data.chat) {
                this.renderChatHistory(data.chat);
            }
        }
    }

    handleMessageEdited(data) {
        if (this.chatHistory[data.chat]) {
            this.chatHistory[data.chat] = this.chatHistory[data.chat].map(msg => {
                if (msg.id === data.id) {
                    return { ...msg, message: data.newMessage, edited: true };
                }
                return msg;
            });
            if (this.selectedChat === data.chat) {
                this.renderChatHistory(data.chat);
            }
        }
    }

    handleTypingStart(data) {
        if (data.socketId === this.socket.id) return;
        
        if (data.conversation === this.selectedChat) {
            if (!this.typingUsers[this.selectedChat]) {
                this.typingUsers[this.selectedChat] = new Set();
            }
            this.typingUsers[this.selectedChat].add(data.from);
            this.updateTypingIndicator();
        }
    }

    handleTypingStop(data) {
        if (data.conversation === this.selectedChat && this.typingUsers[this.selectedChat]) {
            this.typingUsers[this.selectedChat].delete(data.from);
            this.updateTypingIndicator();
        }
    }

    updateTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        const usersTyping = this.typingUsers[this.selectedChat] ? 
            Array.from(this.typingUsers[this.selectedChat]) : [];

        if (usersTyping.length > 0) {
            indicator.innerHTML = `
                ${usersTyping.join(', ')} ${usersTyping.length === 1 ? 'is' : 'are'} typing
                <span class="typing-dots">
                    <span></span><span></span><span></span>
                </span>
            `;
        } else {
            indicator.innerHTML = '';
        }
    }

    // Group Methods
    handleGroupCreated(group) {
        this.groupsData[group.id] = group;
        this.addGroupToList(group);
    }

    handleGroupUpdated(group) {
        this.groupsData[group.id] = group;
        this.updateGroupInList(group);
    }

    handleGroupDeleted(data) {
        this.removeGroupFromList(data.groupId);
        delete this.groupsData[data.groupId];
    }

    handleJoinedGroup(group) {
        this.groupsData[group.id] = group;
        this.addGroupToList(group);
        this.showNotification(`Joined group: ${group.name}`, 'success');
    }

    handleExistingGroups(groups) {
        const groupsList = document.getElementById('groupsList');
        groupsList.innerHTML = '';
        groups.forEach(group => {
            this.groupsData[group.id] = group;
            this.addGroupToList(group);
        });
    }

    addGroupToList(group) {
        const groupsList = document.getElementById('groupsList');
        let li = document.getElementById(`group-${group.id}`);

        if (!li) {
            li = document.createElement('li');
            li.id = `group-${group.id}`;
            li.className = this.selectedChat === group.id ? 'active' : '';
            
            if (!group.members.includes(this.socket.id)) {
                li.innerHTML = `
                    <span><i class="fas fa-users"></i> ${group.name}</span>
                    <button class="join-btn" onclick="chatApp.requestJoinGroup('${group.id}')">Join</button>
                `;
            } else {
                li.innerHTML = `<i class="fas fa-users"></i> ${group.name}`;
                li.onclick = () => {
                    if (this.currentConfig.generalOnly) return;
                    this.selectChat(group.id);
                };
            }

            groupsList.appendChild(li);
        }
    }

    updateGroupInList(group) {
        let li = document.getElementById(`group-${group.id}`);
        if (li) {
            li.className = this.selectedChat === group.id ? 'active' : '';
            if (group.members.includes(this.socket.id)) {
                li.innerHTML = `<i class="fas fa-users"></i> ${group.name}`;
                li.onclick = () => {
                    if (this.currentConfig.generalOnly) return;
                    this.selectChat(group.id);
                };
            } else {
                li.innerHTML = `
                    <span><i class="fas fa-users"></i> ${group.name}</span>
                    <button class="join-btn" onclick="chatApp.requestJoinGroup('${group.id}')">Join</button>
                `;
                li.onclick = null;
            }
        } else {
            this.addGroupToList(group);
        }
    }

    removeGroupFromList(groupId) {
        const li = document.getElementById(`group-${groupId}`);
        if (li) li.remove();
    }

    requestJoinGroup(groupId) {
        this.socket.emit('requestJoinGroup', { groupId });
    }

    // Configuration Methods
    handleConfigChanged(config) {
        this.currentConfig = config;
        
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const fileUpload = document.getElementById('fileUpload');
        const recordButton = document.getElementById('recordButton');
        const groupCreateBtn = document.getElementById('groupCreateBtn');

        if (!config.chatEnabled) {
            messageInput.contentEditable = false;
            sendButton.disabled = true;
            fileUpload.disabled = true;
            recordButton.disabled = true;
            messageInput.setAttribute('placeholder', 'Chat is disabled by admin.');
        } else if (config.generalOnly) {
            if (this.selectedChat !== 'general') {
                this.selectedChat = 'general';
                this.renderChatHistory('general');
                this.updateChatTitle('general');
            }
            
            messageInput.contentEditable = true;
            sendButton.disabled = false;
            fileUpload.disabled = false;
            recordButton.disabled = false;
            messageInput.setAttribute('placeholder', 'Type your message...');
        } else {
            messageInput.contentEditable = true;
            sendButton.disabled = false;
            fileUpload.disabled = false;
            recordButton.disabled = false;
            messageInput.setAttribute('placeholder', 'Type your message...');
        }

        groupCreateBtn.style.display = config.allowGroupCreation ? 'flex' : 'none';
        this.renderChatHistory(this.selectedChat);
    }

    // Utility Methods
    getPrivateChatKey(a, b) {
        return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    selectChat(chatId) {
        if (this.currentConfig.generalOnly && chatId !== 'general') {
            this.selectedChat = 'general';
        } else {
            this.selectedChat = chatId;
        }

        this.renderChatHistory(this.selectedChat);
        this.updateChatTitle(this.selectedChat);
        
        if (this.typingUsers[this.selectedChat]) {
            this.typingUsers[this.selectedChat].clear();
        }
        this.updateTypingIndicator();

        // Update active state in participants list
        document.querySelectorAll('#participants li, #groupsList li').forEach(li => {
            li.classList.remove('active');
        });
        
        if (chatId === 'general') {
            document.querySelector('#participants li').classList.add('active');
        } else if (chatId.startsWith('group-')) {
            const groupLi = document.getElementById(`group-${chatId}`);
            if (groupLi) groupLi.classList.add('active');
        } else {
            // Find the private chat li
            const participantsList = document.querySelectorAll('#participants li');
            participantsList.forEach(li => {
                if (li.onclick && li.onclick.toString().includes(chatId)) {
                    li.classList.add('active');
                }
            });
        }
    }

    updateChatTitle(chatId) {
        const chatTitle = document.getElementById('chat-title');
        
        if (chatId === 'general') {
            chatTitle.innerHTML = '<i class="fas fa-globe"></i> General Chat';
        } else if (chatId.startsWith('group-')) {
            const group = this.groupsData[chatId];
            chatTitle.innerHTML = `<i class="fas fa-users"></i> ${group ? group.name : 'Group Chat'}`;
        } else {
            // Get the recipient name from the private chat key
            const recipientId = this.getRecipientFromConversationKey(chatId);
            const recipientName = this.users[recipientId] || 'Private Chat';
            chatTitle.innerHTML = `<i class="fas fa-user"></i> ${recipientName}`;
        }
    }

    getRecipientFromConversationKey(chatKey) {
        const parts = chatKey.split('-');
        return parts[0] === this.socket.id ? parts[1] : parts[0];
    }

    renderChatHistory(chatId) {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        if (this.chatHistory[chatId]) {
            this.chatHistory[chatId].forEach(msg => this.displayMessage(msg));
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Modal Methods
    openCreateGroupModal() {
        if (!this.currentConfig.allowGroupCreation) return;
        
        document.getElementById('groupNameInput').value = '';
        document.getElementById('groupOpenCheckbox').checked = false;
        document.getElementById('createGroupModal').classList.add('active');
    }

    closeCreateGroupModal() {
        document.getElementById('createGroupModal').classList.remove('active');
    }

    submitCreateGroup() {
        const groupName = document.getElementById('groupNameInput').value.trim();
        if (!groupName) return;
        
        const openGroup = document.getElementById('groupOpenCheckbox').checked;
        this.socket.emit('createGroup', { groupName, open: openGroup });
        this.closeCreateGroupModal();
    }
}

// Global functions for HTML onclick handlers
function toggleChat() {
    document.getElementById('chatBar').classList.toggle('open');
}

function selectChat(chatId) {
    chatApp.selectChat(chatId);
}

function openCreateGroupModal() {
    chatApp.openCreateGroupModal();
}

function closeCreateGroupModal() {
    chatApp.closeCreateGroupModal();
}

function submitCreateGroup() {
    chatApp.submitCreateGroup();
}

function closeEditMessageModal() {
    chatApp.closeEditMessageModal();
}

function submitEditMessage() {
    chatApp.submitEditMessage();
}

function closeJoinRequestModal() {
    // Implementation for join request modal
}

function acceptJoinRequest() {
    // Implementation for accepting join request
}

function declineJoinRequest() {
    // Implementation for declining join request
}

// Global function to sync chat name from meeting system
window.syncChatWithMeetingName = function(newName) {
    if (window.chatApp) {
        window.chatApp.syncWithMeetingName(newName);
    }
};

// Global function to get current chat name
window.getCurrentChatName = function() {
    if (window.chatApp) {
        return window.chatApp.myName;
    }
    return null;
};

// Initialize the chat app when DOM is loaded
let chatApp;
document.addEventListener('DOMContentLoaded', () => {
    chatApp = new ChatApp();
    
    // Make chatApp globally accessible for meeting integration
    window.chatApp = chatApp;
});

// Additional integration points for meeting system
if (typeof window !== 'undefined') {
    // Listen for meeting name updates
    window.addEventListener('meetingUserNameChanged', (event) => {
        if (window.chatApp && event.detail && event.detail.newName) {
            window.chatApp.syncWithMeetingName(event.detail.newName);
        }
    });
    
    // Listen for meeting participant updates
    window.addEventListener('meetingParticipantUpdated', (event) => {
        if (window.chatApp && event.detail && event.detail.isCurrentUser && event.detail.newName) {
            window.chatApp.syncWithMeetingName(event.detail.newName);
        }
    });
}