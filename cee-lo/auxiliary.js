import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

import { placeBet, confirmBet, quitGame, prepareRoll, getCurrentPlayer, getGameState, rollDice } from './main.js';

let scene, camera, renderer, world, diceInstances, dicePhysics;
let pp, pp2, mixer1, mixer2, clip1, clip2;

export function setupEventListeners() {
    var betButton = document.getElementById('betButton');
    var betInput = document.getElementById('betInput');
    if (betButton) betButton.addEventListener('click', placeBet);
    if (betInput) {
        betInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                placeBet();
            }
        });
    }

    var acceptBetButton = document.getElementById('acceptBetButton');
    var quitButton = document.getElementById('quitButton');
    if (acceptBetButton) acceptBetButton.addEventListener('click', confirmBet);
    if (quitButton) quitButton.addEventListener('click', quitGame);

    var rollButton = document.getElementById('rollButton');
    if (rollButton) {
        rollButton.addEventListener('click', function() {
            var currentGameState = getGameState();
            var currentPlayer = getCurrentPlayer();
            if (currentGameState === 'pre-roll') {
                prepareRoll();
                rollDice();
            }
        });
    }
}

function createRoundedBoxGeometry(width, height, depth, radius, segments = 16) {
    const shape = new THREE.Shape();
    const eps = 0.00001;
    const radius0 = radius - eps;
    shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
    shape.absarc(eps, height - radius * 2, eps, Math.PI, Math.PI / 2, true);
    shape.absarc(width - radius * 2, height - radius * 2, eps, Math.PI / 2, 0, true);
    shape.absarc(width - radius * 2, eps, eps, 0, -Math.PI / 2, true);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth - radius0 * 2,
        bevelEnabled: true,
        bevelSegments: segments,
        steps: 1,
        bevelSize: radius,
        bevelThickness: radius0,
        curveSegments: segments
    });
    geometry.center();
    return geometry;
}

function createDiceMesh() {
    const diceSize = 5;
    const cornerRadius = diceSize * 0.1;
    const diceGeometry = createRoundedBoxGeometry(diceSize, diceSize, diceSize, cornerRadius);
    const diceColor = new THREE.Color(0x00ff80);
    const diceMaterial = new THREE.MeshStandardMaterial({
        color: diceColor,
        metalness: 0.7,
        roughness: 0.2,
        envMapIntensity: 1.0
    });
    const diceMesh = new THREE.Mesh(diceGeometry, diceMaterial);

    const dotSize = diceSize * 0.06;
    const dotGeometry = new THREE.SphereGeometry(dotSize, 32, 32);
    const dotMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.8,
        roughness: 0.2,
        envMapIntensity: 1.0
    });

    function addDotsToFace(x, y, z, dots) {
        const faceGroup = new THREE.Group();
        dots.forEach(position => {
            const dot = new THREE.Mesh(dotGeometry, dotMaterial);
            dot.position.set(position[0] * diceSize * 0.3, position[1] * diceSize * 0.3, 0);
            faceGroup.add(dot);
        });
        faceGroup.position.set(x * diceSize/2, y * diceSize/2, z * diceSize/2);
        faceGroup.lookAt(x, y, z);
        diceMesh.add(faceGroup);
    }

    addDotsToFace(1, 0, 0, [[0, 0]]);
    addDotsToFace(-1, 0, 0, [[-1, 1], [-1, 0], [-1, -1], [1, 1], [1, 0], [1, -1]]);
    addDotsToFace(0, 1, 0, [[-1, 1], [1, -1]]);
    addDotsToFace(0, -1, 0, [[-1, 1], [-1, -1], [1, 1], [1, -1], [0, 0]]);
    addDotsToFace(0, 0, 1, [[-1, 1], [0, 0], [1, -1]]);
    addDotsToFace(0, 0, -1, [[-1, 1], [-1, -1], [1, 1], [1, -1]]);

    return diceMesh;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / (window.innerHeight * 0.5);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight * 0.5);
}

export function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / (window.innerHeight * 0.5), 0.1, 1000);
    
    camera.position.set(30, 60, 30);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight * 0.5);
    renderer.setClearColor(0x000000);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    document.getElementById('canvasContainer').appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    
    controls.target.set(0, 0, 0);    
    controls.update();
    
    controls.enableZoom = true;
    controls.minDistance = 10;
    controls.maxDistance = 100;

    scene.add(new THREE.AmbientLight(0x404040));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const centralLight = new THREE.AmbientLight(0xffffff, 2.5);
    centralLight.position.set(0, 20, -15);
    scene.add(centralLight);

    const envMapTexture = new THREE.CubeTextureLoader().load([
        'https://threejs.org/examples/textures/cube/Park2/posx.jpg',
        'https://threejs.org/examples/textures/cube/Park2/negx.jpg',
        'https://threejs.org/examples/textures/cube/Park2/posy.jpg',
        'https://threejs.org/examples/textures/cube/Park2/negy.jpg',
        'https://threejs.org/examples/textures/cube/Park2/posz.jpg',
        'https://threejs.org/examples/textures/cube/Park2/negz.jpg',
    ]);
    scene.environment = envMapTexture;

    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82 * 4, 0),
        allowSleep: true
    });

    const tableSize = 40;
    const tableHeight = 1;
    const railHeight = 100;

    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x800080,
        metalness: 1,
        roughness: -10,
        transparent: true,
        opacity: 0.5,
        envMapIntensity: 1.0
    });

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x800080,
        metalness: 0.7,
        roughness: 0.2,
        transparent: true,
        opacity: 0.0,
        envMapIntensity: 1.0
    });

    const tableGeometry = new THREE.BoxGeometry(tableSize, tableHeight, tableSize);
    const tableMesh = new THREE.Mesh(tableGeometry, floorMaterial);
    tableMesh.position.set(0, -tableHeight/2, 0);
    scene.add(tableMesh);

    const railGeometry = new THREE.BoxGeometry(tableSize, railHeight, 1);
    
    const railPositions = [
        { position: [0, railHeight/2, tableSize/2 + 0.5], rotation: [0, 0, 0] },
        { position: [0, railHeight/2, -tableSize/2 - 0.5], rotation: [0, 0, 0] },
        { position: [tableSize/2 + 0.5, railHeight/2, 0], rotation: [0, Math.PI / 2, 0] },
        { position: [-tableSize/2 - 0.5, railHeight/2, 0], rotation: [0, Math.PI / 2, 0] }
    ];

    railPositions.forEach(({ position, rotation }) => {
        const railMesh = new THREE.Mesh(railGeometry, wallMaterial);
        railMesh.position.set(...position);
        railMesh.rotation.set(...rotation);
        scene.add(railMesh);
    });

    const diceMaterial = new CANNON.Material('dice');
    const floorPhysicsMaterial = new CANNON.Material('floor');
    
    const diceFloorContactMaterial = new CANNON.ContactMaterial(diceMaterial, floorPhysicsMaterial, {
        friction: 0.0001,
        roughness: -10,
        restitution: 0.3
    });
    world.addContactMaterial(diceFloorContactMaterial);

    const floorShape = new CANNON.Box(new CANNON.Vec3(tableSize/2, tableHeight/2, tableSize/2));
    const floorBody = new CANNON.Body({ mass: 0, shape: floorShape, material: floorPhysicsMaterial });
    floorBody.position.set(0, -tableHeight/2, 0);
    world.addBody(floorBody);

    const railShape = new CANNON.Box(new CANNON.Vec3(tableSize/2, railHeight/2, 0.5));
    railPositions.forEach(({ position, rotation }) => {
        const railBody = new CANNON.Body({ mass: 0, shape: railShape, material: floorPhysicsMaterial });
        railBody.position.set(...position);
        railBody.quaternion.setFromEuler(...rotation);
        world.addBody(railBody);
    });

    diceInstances = [];
    dicePhysics = [];

    const diceSize = 5;
    const diceShape = new CANNON.Box(new CANNON.Vec3(diceSize/2 * 0.95, diceSize/2 * 0.95, diceSize/2 * 0.95));

    const pyramidPositions = [
        { x: 0, y: 20, z: 0 },
        { x: -4, y: 15, z: -2 },
        { x: 4, y: 15, z: -2 }
    ];

    for (let i = 0; i < 3; i++) {
        const diceMesh = createDiceMesh();
        scene.add(diceMesh);
        diceInstances.push(diceMesh);

        const position = pyramidPositions[i];
        const diceBody = new CANNON.Body({
            mass: 5,
            shape: diceShape,
            material: diceMaterial,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            angularDamping: 0.5,
            linearDamping: 0.5,
            sleepSpeedLimit: 1,
            sleepTimeLimit: 0.1
        });
        world.addBody(diceBody);
        dicePhysics.push(diceBody);
    }

    window.addEventListener('resize', onWindowResize);
}

export function loadModels() {
    const loader = new GLTFLoader();
    
    return Promise.all([
        new Promise((resolve) => {
            loader.load('pp.glb', (gltf) => {
                pp = gltf.scene;
                mixer1 = new THREE.AnimationMixer(pp);
                clip1 = THREE.AnimationClip.findByName(gltf.animations, 'idle');
                if (clip1) {
                    const action = mixer1.clipAction(clip1);
                    action.play();
                }
                resolve();
            });
        }),
        new Promise((resolve) => {
            loader.load('pp2.glb', (gltf) => {
                pp2 = gltf.scene;
                mixer2 = new THREE.AnimationMixer(pp2);
                clip2 = THREE.AnimationClip.findByName(gltf.animations, 'idle');
                if (clip2) {
                    const action = mixer2.clipAction(clip2);
                    action.play();
                }
                resolve();
            });
        })
    ]);
}

export function getPlayerModel(playerNumber) {
    return {
        model: playerNumber === 1 ? pp : pp2,
        mixer: playerNumber === 1 ? mixer1 : mixer2,
        clip: playerNumber === 1 ? clip1 : clip2
    };
}

let winScene, winCamera, winRenderer, winnerModel, winMixer, winClock, winControls;

const STARTING_BALANCE = 100;

export function initWinScreen(winner, finalBalance) {
    const amountWon = finalBalance - STARTING_BALANCE;
    const winLoseText = amountWon > 0 ? 'won' : (amountWon < 0 ? 'lost' : 'broke even with');
    const absoluteAmount = Math.abs(amountWon);

    const winContainer = document.createElement('div');
    winContainer.id = 'winContainer';
    document.body.appendChild(winContainer);

    const card = document.createElement('div');
    card.className = 'win-card';
    winContainer.appendChild(card);

    const modelContainer = document.createElement('div');
    modelContainer.className = 'model-container';
    card.appendChild(modelContainer);

    winScene = new THREE.Scene();
    winCamera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1000);
    winRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    winRenderer.setSize(modelContainer.clientWidth, modelContainer.clientWidth * 0.75);
    modelContainer.appendChild(winRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040);
    winScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    winScene.add(directionalLight);

    const { model, mixer: modelMixer } = getPlayerModel(winner);
    winnerModel = model;
    winMixer = modelMixer;
    winScene.add(winnerModel);

    const box = new THREE.Box3().setFromObject(winnerModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = winCamera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    winnerModel.position.x = -center.x;
    winnerModel.position.y = -center.y;
    winnerModel.position.z = -center.z;

    winCamera.position.z = cameraZ * 1.2;

    const scale = .25;
    winnerModel.scale.set(scale, scale, scale);

    winClock = new THREE.Clock();

    winControls = new OrbitControls(winCamera, winRenderer.domElement);
    winControls.enableDamping = true;
    winControls.dampingFactor = 0.25;
    winControls.enableZoom = false;

    const winText = document.createElement('h2');
    winText.className = 'win-text';
    winText.innerHTML = amountWon === 0 ? `Player ${winner} broke even!` : 
                        `Player ${winner} ${winLoseText}<br>$${absoluteAmount}!`;
    card.appendChild(winText);

    const balanceText = document.createElement('p');
    balanceText.className = 'balance-text';
    balanceText.textContent = `Final Balance: $${finalBalance}`;
    card.appendChild(balanceText);

    const shareButton = document.createElement('button');
    shareButton.className = 'share-button';
    shareButton.textContent = 'Share Win';
    shareButton.onclick = createAndDownloadGif;
    card.appendChild(shareButton);

    const playAgainButton = document.createElement('button');
    playAgainButton.className = 'play-again-button';
    playAgainButton.textContent = 'Play Again';
    playAgainButton.onclick = resetGame;
    card.appendChild(playAgainButton);

    animateWinScreen();
    window.addEventListener('resize', onWinScreenResize, false);
    onWinScreenResize();
}

function animateWinScreen() {
    requestAnimationFrame(animateWinScreen);

    const delta = winClock.getDelta();
    if (winMixer) {
        winMixer.update(delta);
    }

    winControls.update();

    winRenderer.render(winScene, winCamera);
}

function onWinScreenResize() {
    const winContainer = document.getElementById('winContainer');
    const card = winContainer.firstChild;
    const modelContainer = card.firstChild;

    const containerWidth = winContainer.clientWidth;
    const containerHeight = winContainer.clientHeight;

    const cardWidth = Math.min(600, containerWidth - 40);
    card.style.width = `${cardWidth}px`;

    const cardHeight = card.offsetHeight;
    if (cardHeight > containerHeight) {
        const scale = containerHeight / cardHeight;
        card.style.transform = `scale(${scale})`;
    } else {
        card.style.transform = 'scale(1)';
    }

    const newWidth = modelContainer.clientWidth;
    const newHeight = newWidth * 0.75;
    winRenderer.setSize(newWidth, newHeight);
    winCamera.aspect = newWidth / newHeight;
    winCamera.updateProjectionMatrix();
}

function createAndDownloadGif() {
    console.log("GIF creation and download not implemented yet");
}

export function resetGame() {
    const winContainer = document.getElementById('winContainer');
    if (winContainer) {
        winContainer.remove();
    }

    document.getElementById('gameContainer').style.display = 'flex';
    document.getElementById('canvasContainer').style.display = 'block';
}

export function getDiceInstances() {
    return diceInstances;
}

export function getDicePhysics() {
    return dicePhysics;
}

export function getWorld() {
    return world;
}

export function getRenderer() {
    return renderer;
}

export function getScene() {
    return scene;
}

export function getCamera() {
    return camera;
}