const express = require('express');
const app = express();
const path = require('path');
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const hbs = require('hbs');
const collection = require('./mongodb');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const templatePath = path.join(__dirname, '../templates');

// Session configuration
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://hakorimanasharif12:nQwgHHW7obwZ92N4@cluster0.we3s9v8.mongodb.net/test';

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: mongoUri,
        ttl: 14 * 24 * 60 * 60 // = 14 days
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../images')));
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'hbs');
app.set('views', templatePath); 

hbs.registerHelper('currentUserInitials', function(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
});

hbs.registerHelper('userInitials', function(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
});

hbs.registerHelper('eq', function(a, b) {
    return a === b;
});

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Set API URL to use http://localhost:3000 replaced with http://api_url
const API_URL = process.env.API_URL || 'http://localhost:3000';

app.get('/', (req, res) => {
    res.render('login');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/signup', async (req, res) => {
    try {
        const existingUser = await collection.findOne({ name: req.body.name });
        if (existingUser) {
            return res.render('signup', { error: 'Username already exists' });
        }

        const data = {
            name: req.body.name,
            password: req.body.password,
            createdAt: new Date(),
            lastSeen: new Date()
        };

        await collection.insertMany([data]);
        
        // Set session after successful signup
        req.session.user = {
            name: data.name,
            createdAt: data.createdAt
        };
        
        res.redirect('/chat');
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).send('Error creating account');
    }
});

app.post('/login', async (req, res) => {
    try {
        const user = await collection.findOne({ 
            name: req.body.name, 
            password: req.body.password 
        });

        if (user) {
            // Update last seen time
            await collection.updateOne(
                { _id: user._id },
                { $set: { lastSeen: new Date() } }
            );
            
            // Set session after successful login
            req.session.user = {
                name: user.name,
                createdAt: user.createdAt
            };
            
            res.redirect('/chat');
        } else {
            res.render('login', { error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred during login' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/chat');
        }
        res.redirect('/login');
    });
});

// Store connected users
const connectedUsers = new Map();

// Socket.io connection
io.on('connection', (socket) => {
    console.log('a user connected');

    // When a user joins the chat
    socket.on('join', (username) => {
        connectedUsers.set(socket.id, username);
        io.emit('user connected', {
            username,
            users: Array.from(connectedUsers.values())
        });
    });

    // When a message is sent
    socket.on('chat message', async (msg) => {
        try {
            // Store message in database
            await collection.updateOne(
                { name: msg.sender },
                { $push: { messages: msg } },
                { upsert: true }
            );
            
            // Broadcast message to all clients
            io.emit('chat message', msg);
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    // When a user disconnects
    socket.on('disconnect', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            connectedUsers.delete(socket.id);
            io.emit('user disconnected', {
                username,
                users: Array.from(connectedUsers.values())
            });
        }
        console.log('user disconnected');
    });
});

app.get('/chat', requireAuth, async (req, res) => {
    try {
        // Get all users except current user, sorted by last seen
        const users = await collection.find({ 
            name: { $ne: req.session.user.name } 
        }).sort({ lastSeen: -1 });
        
        // Mark users as online if they are in connectedUsers
        const onlineUsernames = new Set(Array.from(connectedUsers.values()));
        
        res.render('chat', { 
            currentUser: req.session.user.name,
            users: users.map(user => ({
                name: user.name,
                status: onlineUsernames.has(user.name) ? 'online' : 'offline',
                lastSeen: user.lastSeen.toLocaleString()
            }))
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false });
    }
    const fileUrl = '/uploads/' + req.file.filename;
    res.json({ 
        success: true, 
        url: fileUrl, 
        name: req.session.user.name 
    });
});

app.use('/uploads', express.static('uploads'));

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
