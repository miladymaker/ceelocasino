const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve index.html from the root directory
app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(__dirname + '/index.html');
});

// Set up Socket.IO
io.on('connection', (socket) => {
    console.log('A user connected with ID:', socket.id);

    socket.on('updateRadius', (radius) => {
        console.log('Received radius update:', radius);
        // Validate the radius
        const validatedRadius = Math.max(0.1, Math.min(5, parseFloat(radius)));
        // Broadcast the validated radius to all connected clients
        io.emit('radiusUpdated', validatedRadius);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});