import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

import { 
    setupEventListeners, 
    init as initAnimation, 
    loadModels, 
    initWinScreen, 
    resetGame,
    getDiceInstances,
    getDicePhysics,
    getWorld,
    getRenderer,
    getScene,
    getCamera
} from './auxiliary.js';

const STARTING_BALANCE = 100;
const MAX_BET = 40;
const TURN_TIME_LIMIT = 8;

let playerBalances = [STARTING_BALANCE, STARTING_BALANCE];
let currentPlayer = 1;
let banker = 1;
let currentBet = 1;
let pot = 0;
let gameState = 'betting';
let playerScores = [0, 0];
let playerRolls = [null, null];
let turnTimer;
let timeRemaining = TURN_TIME_LIMIT;
let isRolling = false;

async function initializeApp() {
    await loadModels();
    initAnimation();
    initGameLogic();
    setupEventListeners();
    animate();
    console.log('After-Hours Cee-Lo initialized and ready to play!');
}

function startNewGame() {
    resetGameState();
    document.getElementById('gameContainer').style.display = 'flex';
    document.getElementById('canvasContainer').style.display = 'block';
}

export function initGameLogic() {
    resetGameState();
    updateGameInfo();
    logEvent("After-Hours Cee-Lo! Player 1 is the banker. Initial bet is $1. Max bet is $40. Let's roll!");
    startTurnTimer();
}

export function resetGameState() {
    playerBalances = [STARTING_BALANCE, STARTING_BALANCE];
    currentPlayer = 1;
    banker = 1;
    currentBet = 1;
    pot = 0;
    gameState = 'betting';
    playerScores = [0, 0];
    playerRolls = [null, null];
    timeRemaining = TURN_TIME_LIMIT;
    updateGameInfo();
    logEvent("Game reset. New round, new money!");
    startTurnTimer();
}

function startTurnTimer() {
    clearInterval(turnTimer);
    timeRemaining = TURN_TIME_LIMIT;
    updateTimerDisplay();
    turnTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            clearInterval(turnTimer);
            handleTimeout();
        }
    }, 1000);
}

function stopTurnTimer() {
    clearInterval(turnTimer);
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('turnTimer');
    if (timerElement) {
        timerElement.textContent = `Time remaining: ${timeRemaining}s`;
    }
}

function handleTimeout() {
    logEvent(`Time's up for Player ${currentPlayer}! The game ends.`);
    if (gameState === 'betting') {
        logEvent(`Banker (Player ${banker}) didn't place a bet in time.`);
    } else if (gameState === 'confirming') {
        logEvent(`Player ${currentPlayer} didn't confirm the bet in time. Bet returned to banker.`);
        playerBalances[banker - 1] += currentBet;
    } else if (gameState === 'rolling' || gameState === 'pre-roll') {
        logEvent(`Player ${currentPlayer} didn't roll in time. Bet amounts returned to both players.`);
        playerBalances[0] += currentBet;
        playerBalances[1] += currentBet;
    }
    endGame(currentPlayer === 1 ? 2 : 1);
}

export function placeBet() {
    if (gameState !== 'betting' || currentPlayer !== banker) return;
    
    stopTurnTimer();

    const betAmount = parseInt(document.getElementById('betInput').value);
    const bankerIndex = banker - 1;
    const nonBankerIndex = banker === 1 ? 1 : 0;

    // Validate bet amount
    if (isNaN(betAmount) || betAmount < 1 || betAmount > MAX_BET) {
        logEvent(`Invalid bet! Keep it between $1 and $${MAX_BET}.`);
        startTurnTimer();
        return;
    }

    // Check if banker has enough money
    if (betAmount > playerBalances[bankerIndex]) {
        logEvent(`Banker doesn't have enough money for this bet. Maximum bet: $${playerBalances[bankerIndex]}.`);
        startTurnTimer();
        return;
    }

    // Check if non-banker player has enough money to match the bet
    if (betAmount > playerBalances[nonBankerIndex]) {
        logEvent(`The other player doesn't have enough money to match this bet. Maximum bet: $${playerBalances[nonBankerIndex]}.`);
        startTurnTimer();
        return;
    }

    currentBet = betAmount;
    pot = currentBet;
    playerBalances[bankerIndex] -= currentBet;

    logEvent(`Player ${banker} (Banker) places a bet of $${currentBet}.`);

    gameState = 'confirming';
    currentPlayer = banker === 1 ? 2 : 1;
    updateGameInfo();
    showConfirmButtons();
    startTurnTimer();
}

export function confirmBet() {
    if (gameState !== 'confirming') return;

    stopTurnTimer();

    const nonBankerIndex = currentPlayer - 1;

    if (playerBalances[nonBankerIndex] < currentBet) {
        logEvent(`Player ${currentPlayer} doesn't have enough cash to cover the bet. Game over!`);
        endGame(banker);
        return;
    }

    playerBalances[nonBankerIndex] -= currentBet;
    pot += currentBet;

    logEvent(`Player ${currentPlayer} accepts the $${currentBet} bet. Total pot: $${pot}`);

    gameState = 'pre-roll';
    currentPlayer = banker === 1 ? 2 : 1;
    updateGameInfo();
    hideConfirmButtons();
    startTurnTimer();
}

function calculateScore(rolls) {
    if (rolls.includes(4) && rolls.includes(5) && rolls.includes(6)) {
        return [999, "4-5-6 (You're golden ponyboy, automatic win)"];
    }
    
    if (rolls.includes(1) && rolls.includes(2) && rolls.includes(3)) {
        return [-1, "1-2-3 (Busted, automatic loss)"];
    }
    
    const sortedRolls = [...rolls].sort((a, b) => b - a);
    
    if (sortedRolls[0] === sortedRolls[1] && sortedRolls[1] === sortedRolls[2]) {
        return [sortedRolls[0] * 10, `Trips-${sortedRolls[0]}`];
    }
    
    if (sortedRolls[0] === sortedRolls[1] || sortedRolls[1] === sortedRolls[2]) {
        const point = sortedRolls.find(die => sortedRolls.filter(d => d === die).length === 1);
        return [point, `Point is ${point}`];
    }
    
    return [0, "No score (Roll again)"];
}

export function prepareRoll() {
    if (gameState !== 'pre-roll') return;

    stopTurnTimer();
    gameState = 'rolling';
    logEvent(`Player ${currentPlayer} is ready to roll. Click 'Roll' to see the result.`);
    updateGameInfo();
}

export function proceedWithRoll(diceValues) {
    if (gameState !== 'rolling') return;

    const [score, description] = calculateScore(diceValues);
    playerScores[currentPlayer - 1] = score;
    playerRolls[currentPlayer - 1] = diceValues;
    logEvent(`Player ${currentPlayer} rolled: ${diceValues.join(', ')} - ${description}`);

    if (score === -1) {
        logEvent(`Player ${currentPlayer} automatically loses this round.`);
        endRound(currentPlayer === 1 ? 2 : 1);
    } else if (score === 999) {
        logEvent(`Player ${currentPlayer} automatically wins this round.`);
        endRound(currentPlayer);
    } else if (score === 0) {
        logEvent(`Player ${currentPlayer} needs to roll again.`);
        gameState = 'pre-roll';
        startTurnTimer();
    } else {
        if (currentPlayer === banker) {
            checkWinner();
        } else {
            currentPlayer = banker;
            gameState = 'pre-roll';
            logEvent(`Banker (Player ${banker}) now prepares to roll.`);
            startTurnTimer();
        }
    }
    updateGameInfo();
    isRolling = false;  // Reset rolling state
}

function checkWinner() {
    if (playerScores[0] > playerScores[1]) {
        endRound(1);
    } else if (playerScores[1] > playerScores[0]) {
        endRound(2);
    } else {
        endRound(0); // 0 indicates a tie
    }
}

function endRound(winner) {
    stopTurnTimer();
    if (winner === 0) {
        logEvent("It's a tie! The pot is split.");
        playerBalances[0] += pot / 2;
        playerBalances[1] += pot / 2;
    } else {
        playerBalances[winner - 1] += pot;
        logEvent(`Player ${winner} wins the round and takes the pot: $${pot}!`);
    }
    logEvent(`Final rolls - Player 1: ${playerRolls[0] ? playerRolls[0].join(', ') : 'N/A'}, Player 2: ${playerRolls[1] ? playerRolls[1].join(', ') : 'N/A'}`);
    
    if (playerBalances[0] <= 0 || playerBalances[1] <= 0) {
        endGame(playerBalances[0] > playerBalances[1] ? 1 : 2);
    } else {
        startNewRound();
    }
}

function startNewRound() {
    banker = banker === 1 ? 2 : 1;
    currentPlayer = banker;
    currentBet = 1;
    pot = 0;
    gameState = 'betting';
    playerScores = [0, 0];
    playerRolls = [null, null];
    updateGameInfo();
    logEvent(`New round! Player ${banker} is now the banker. Initial bet is $1.`);
    startTurnTimer();
}

function endGame(winner) {
    stopTurnTimer();
    gameState = 'game over';
    updateGameInfo();
    hideConfirmButtons();

    const finalBalance = playerBalances[winner - 1];

    logEvent(`Game Over! Player ${winner} wins with $${finalBalance}!`);

    setTimeout(() => {
        initWinScreen(winner, finalBalance);
    }, 1000);
}

export function quitGame() {
    stopTurnTimer();
    logEvent(`Player ${currentPlayer} walks away. Game Over!`);
    
    if (gameState === 'confirming' && currentPlayer !== banker) {
        playerBalances[banker - 1] += currentBet;
        logEvent(`Refunding $${currentBet} to Player ${banker} (Banker).`);
    }
    
    endGame(currentPlayer === 1 ? 2 : 1);
}

function updateGameInfo() {
    const player1Info = document.getElementById('player1');
    const player2Info = document.getElementById('player2');
    const gameStatus = document.getElementById('gameStatus');

    player1Info.innerHTML = `
        <h3 class="${currentPlayer === 1 ? 'current-turn' : ''}">Player 1 ${banker === 1 ? '(Banker)' : ''}</h3>
        <p>Stack: $${playerBalances[0]}</p>
        <p>Score: ${playerScores[0]}</p>
        <p>Last Roll: ${playerRolls[0] ? playerRolls[0].join(', ') : 'N/A'}</p>
    `;

    player2Info.innerHTML = `
        <h3 class="${currentPlayer === 2 ? 'current-turn' : ''}">Player 2 ${banker === 2 ? '(Banker)' : ''}</h3>
        <p>Stack: $${playerBalances[1]}</p>
        <p>Score: ${playerScores[1]}</p>
        <p>Last Roll: ${playerRolls[1] ? playerRolls[1].join(', ') : 'N/A'}</p>
    `;

    gameStatus.innerHTML = `
        <p>Pot: $${pot} | Current Bet: $${currentBet} | State: ${gameState}</p>
        <p id="turnTimer">Time remaining: ${timeRemaining}s</p>
    `;

    const betInput = document.getElementById('betInput');
    const bettingControls = document.getElementById('bettingControls');
    const confirmBetButtons = document.getElementById('confirmBetButtons');
    const rollButton = document.getElementById('rollButton');

    if (betInput) betInput.value = currentBet;
    if (bettingControls) bettingControls.style.display = gameState === 'betting' && currentPlayer === banker ? 'block' : 'none';
    if (confirmBetButtons) confirmBetButtons.style.display = gameState === 'confirming' ? 'block' : 'none';
    if (rollButton) rollButton.style.display = gameState === 'pre-roll' ? 'inline-block' : 'none';
}

function showConfirmButtons() {
    const confirmBetButtons = document.getElementById('confirmBetButtons');
    const bettingControls = document.getElementById('bettingControls');
    if (confirmBetButtons) confirmBetButtons.style.display = 'block';
    if (bettingControls) bettingControls.style.display = 'none';
}

function hideConfirmButtons() {
    const confirmBetButtons = document.getElementById('confirmBetButtons');
    const bettingControls = document.getElementById('bettingControls');
    if (confirmBetButtons) confirmBetButtons.style.display = 'none';
    if (bettingControls) bettingControls.style.display = 'none';
}

export function logEvent(message) {
    const eventLog = document.getElementById('eventLog');
    if (eventLog) {
        const event = document.createElement('p');
        event.textContent = message;
        eventLog.prepend(event);
        if (eventLog.childElementCount > 10) {
            eventLog.removeChild(eventLog.lastChild);
        }
    }
}

export function getCurrentPlayer() {
    return currentPlayer;
}

export function getGameState() {
    return gameState;
}

export function rollDice() {
    var currentGameState = getGameState();
    var currentPlayer = getCurrentPlayer();
    if (!isRolling && currentGameState === 'rolling') {
        isRolling = true;
        logEvent('Player ' + currentPlayer + ' is rolling the dice...');
        getDicePhysics().forEach(function(dice) {
            dice.position.set(-10 + Math.random() * 20, 20 + Math.random() * 10, -10 + Math.random() * 20);
            dice.velocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
            dice.angularVelocity.set(
                Math.random() * 20 - 10,
                Math.random() * 20 - 10,
                Math.random() * 20 - 10
            );
            dice.sleepState = 0; // Wake up the dice
        });
    }
}

function getDiceValue(diceBody) {
    var up = new CANNON.Vec3(0, 1, 0);
    var faces = [
        { normal: new CANNON.Vec3(0, 1, 0), value: 2 },
        { normal: new CANNON.Vec3(0, 0, 1), value: 3 },
        { normal: new CANNON.Vec3(1, 0, 0), value: 1 },
        { normal: new CANNON.Vec3(-1, 0, 0), value: 6 },
        { normal: new CANNON.Vec3(0, 0, -1), value: 4 },
        { normal: new CANNON.Vec3(0, -1, 0), value: 5 }
    ];

    var maxDot = -Infinity;
    var topFaceValue = 0;

    faces.forEach(function(face) {
        var rotatedNormal = face.normal.clone();
        diceBody.quaternion.vmult(rotatedNormal, rotatedNormal);
        var dot = rotatedNormal.dot(up);
        if (dot > maxDot) {
            maxDot = dot;
            topFaceValue = face.value;
        }
    });

    return { value: topFaceValue, isValid: true };
}

export function animate() {
    requestAnimationFrame(animate);
    getWorld().step(1 / 60);

    getDicePhysics().forEach(function(dice, index) {
        getDiceInstances()[index].position.copy(dice.position);
        getDiceInstances()[index].quaternion.copy(dice.quaternion);
    });
    
    if (isRolling) {
        var settledThreshold = 0.1;
        var allSettled = getDicePhysics().every(function(dice) {
            return dice.velocity.length() < settledThreshold && 
                   dice.angularVelocity.length() < settledThreshold;
        });

        if (allSettled) {
            isRolling = false;
            var diceValues = getDicePhysics().map(getDiceValue);
            proceedWithRoll(diceValues.map(function(d) { return d.value; }));
        }
    }
    
    getRenderer().render(getScene(), getCamera());
}

document.addEventListener('DOMContentLoaded', initializeApp);

export { initializeApp, startNewGame };