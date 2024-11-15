const socket = io(window.location.origin, {
    reconnectionAttempts: 5,
    timeout: 10000,
    transports: ['websocket', 'polling']
});

let scene, camera, renderer, sphere;

function init() {
    console.log('Initializing Three.js scene');
    
    // Create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('myThreeJsCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Create sphere
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    console.log('Three.js scene initialized');

    // Start animation
    animate();

    // Set up event listener for radius update button
    document.getElementById('updateRadius').addEventListener('click', updateRadiusFromInput);
}

function animate() {
    requestAnimationFrame(animate);
    sphere.rotation.x += 0.01;
    sphere.rotation.y += 0.01;
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateRadiusFromInput() {
    const radiusInput = document.getElementById('radiusInput');
    const newRadius = parseFloat(radiusInput.value);
    if (!isNaN(newRadius) && newRadius > 0) {
        socket.emit('updateRadius', newRadius);
    } else {
        alert('Please enter a valid positive number for the radius.');
    }
}

socket.on('connect', () => {
    console.log('Connected to server');
    document.getElementById('connection-status').textContent = 'Connected';
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    console.log('Connection URL:', socket.io.uri);
    document.getElementById('connection-status').textContent = 'Connection error';
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    document.getElementById('connection-status').textContent = 'Disconnected';
});

socket.on('radiusUpdated', (radius) => {
    console.log('Received updated radius:', radius);
    document.getElementById('currentRadius').textContent = radius.toFixed(2);
    if (sphere) {
        sphere.scale.set(radius, radius, radius);
    }
});

socket.io.on("error", (error) => {
    console.error('Socket.IO error:', error);
});

console.log('Starting initialization');
init();
console.log('Initialization complete');