const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const robot = require('robotjs');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const dbFilePath = 'database.db';
const db = new sqlite3.Database(dbFilePath);

db.run(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    title TEXT,
    mouseButtonInput TEXT,
    delayCheckbox INTEGER,
    delayAmount INTEGER,
    typeInput TEXT,
    repeatSetTimesInput INTEGER,
    repeatTimes INTEGER,
    alwaysOnTopCheckbox INTEGER,
    loopInput INTEGER,
    hoursInput INTEGER,
    minutesInput INTEGER,
    secondsInput INTEGER,
    millisecondsInput INTEGER
  )
`);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;
let running = false;
let autoClickInterval;
let isMouseButtonHold;
let holdMouseButton;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 640,
    height: 350,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  //mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  checkOptions();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function checkOptions() {
  if (fs.existsSync('options.json')) {
    return;
  } else {
    createDefaultOptions();
  }
}

app.whenReady().then(() => {
  // Register a global shortcut for F9
  globalShortcut.register('F9', () => {
    // Check the running state and perform actions accordingly
    if (!running) {
      running = true;
      mainWindow.webContents.send('background-hotkeys', { start: true });
    } else {
      mainWindow.webContents.send('background-hotkeys', { start: false });
      running = false;
    }
  });

  // Check for F9 shortcut even when the app is in the background
  app.on('browser-window-blur', () => {
    globalShortcut.register('F9', () => {
      if (!running) {
        running = true;
        mainWindow.webContents.send('background-hotkeys', { start: true });
      } else {
        mainWindow.webContents.send('background-hotkeys', { start: false });
        running = false;
      }
    });
  });

  // Unregister the global shortcut when the app is about to quit
  app.on('will-quit', () => {
    // Unregister the shortcut
    globalShortcut.unregister('F9');
    // Unregister the 'browser-window-blur' event
    app.removeAllListeners('browser-window-blur');
  });
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.handle('frame-handler', (req, data) => {
  if (!data || !data.request) return;
  switch (data.request) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'exit':
      mainWindow.close();
      break;
  }
});

ipcMain.handle('update-profile', async (req, data) => {
  if (!data) return;
  const formatOptions = convertOptionsFormat(data.options);
  await updateProfileOptions(data.id, data.title, data.options);
  saveOptionsToFile(formatOptions);
});

async function updateProfileOptions(id, title, options) {
  const setStatements = options.map((option) => `${option.id} = ?`).join(', ');
  const values = options.map((option) => option.value);
  const sqlStatement = `UPDATE profiles SET ${setStatements}, title = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    values.push(title);
    values.push(id);

    db.run(sqlStatement, values, (err) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function convertOptionsFormat(existingOptions) {
  const newFormat = {};
  existingOptions.forEach(({ id, value }) => {
    newFormat[id] = value;
  });
  return newFormat;
}

ipcMain.handle('database-handler', async (req, data) => {
  if (!data || !data.request) return;
  switch (data.request) {
    case 'Add':
      addProfile(data.title, data.optionValues);
      break;
    case 'Get':
      const profiles = await getProfiles();
      return profiles;
    case 'Delete':
      if (!data.id) return;
      try {
        await deleteProfile(data.id);
        return true;
      } catch (err) {
        return false;
      }
  }
});

async function deleteProfile(id) {
  const sqlStatement = 'DELETE FROM profiles WHERE id = ?';

  return new Promise((resolve, reject) => {
    db.run(sqlStatement, [id], function (err) {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        resolve(this.changes > 0); // Resolve with true if rows were affected, false otherwise
      }
    });
  });
}

async function getProfiles() {
  const sqlStatement = 'SELECT * FROM profiles';

  return await new Promise((resolve, reject) => {
    db.all(sqlStatement, [], (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

function addProfile(title, data) {
  const valuesString = data.map(element => `'${element.input}'`).join(', ');
  const sqlStatement = `INSERT INTO profiles (title, ${valuesString}) VALUES (?, ${Array(data.length).fill('?').join(', ')})`;
  const values = [title, ...data.map(element => element.value)];

  db.run(sqlStatement, values, function (err) {
    if (err) {
      console.error(err.message);
    } else {
      console.log('Row added to the profiles table');
    }
  });
}



function createDefaultOptions() {
  const settings = {
    mouseButtonInput: 'left',
    delayCheckbox: false,
    delayAmount: '1000',
    typeInput: 'single',
    repeatSetTimesInput: false,
    repeatTimes: '1',
    alwaysOnTopCheckbox: false,
    loopInput: true,

    hoursInput: '0',
    minutesInput: '0',
    secondsInput: '0',
    millisecondsInput: '0',
  };

  const jsonString = JSON.stringify(settings, null, 2);
  fs.writeFileSync('options.json', jsonString);
}

ipcMain.handle('start-autoclick', (req, data) => {
  if (!data || !data.input || !data.type || !data.repeat) return;
  mouseButtonClick(data.input, data.type, data.repeat);
  startAutoClick(() => mouseButtonClick(data.input, data.type, data.repeat), data.interval);
});

ipcMain.handle('stop-autoclick', () => {
  if (isMouseButtonHold === true) {
    robot.mouseToggle('up', holdMouseButton);
    isMouseButtonHold = false;
  }
  clearInterval(autoClickInterval);
});

function startAutoClick(buttonClick, interval, repeat) {
  running = true;
  if (!isMouseButtonHold) {
    autoClickInterval = setInterval(buttonClick, interval, repeat);
  }
}

let currentNumber = 0;

function mouseButtonClick(input, type, repeat) {
  switch (repeat) {
    case 'loop':
      isProcessing = true;
      mouseButtonTypeInputs(input, type);
      break;
    default:
      const repeatCount = parseInt(repeat);
      if (currentNumber < repeatCount) {
        currentNumber++;
        mouseButtonTypeInputs(input, type);
      } else if (currentNumber === repeatCount) {
        if (isMouseButtonHold === true) {
          robot.mouseToggle('up', holdMouseButton);
          isMouseButtonHold = false;
        }
        clearInterval(autoClickInterval);
        currentNumber = 0;
        running = false;
        mainWindow.webContents.send('autoclick-stopped', { success: true });
      }
      break;
  }
}

function mouseButtonTypeInputs(input, type) {
  switch (type) {
    case 'single':
      robot.mouseClick(input);
      break;
    case 'double':
      robot.mouseClick(input);
      robot.mouseClick(input);
      break;
    case 'hold':
      isMouseButtonHold = true;
      holdMouseButton = input;
      robot.mouseToggle('down', input);
      break;
  }
}

ipcMain.handle('always-on-top-handler', (req, data) => {
  if (!data) return;
  mainWindow.setAlwaysOnTop(data.request);
});




ipcMain.handle('options-handler', (req, data) => {
  if (!data || !data.request) return;
  switch (data.request) {
    case 'get':
      const results = getOptions();
      return results;
    case 'save':
      saveOptions(data.inputId, data.inputValue);
      break;
  }
});

function getOptions() {
  const fileName = 'options.json';
  try {
    const fileContents = fs.readFileSync(fileName, 'utf-8');
    const options = JSON.parse(fileContents);
    return options;
  } catch (error) {
    console.error('Error reading settings file:', error.message);
    return null;
  }
}

function saveOptionsToFile(options) {
  const fileName = 'options.json';
  try {
    const jsonString = JSON.stringify(options, null, 2);
    fs.writeFileSync(fileName, jsonString);
  } catch (error) {
    console.error('Error saving options to file:', error.message);
  }
}

function saveOptions(input, value) {
  const options = getOptions();

  if (!options) {
    return;
  }

  if (input === 'loopInput') {
    options.repeatSetTimesInput = !value;
    options.loopInput = value;
  } else if (input === 'repeatSetTimesInput') {
    options.loopInput = !value;
    options.repeatSetTimesInput = value;
  } else {
    options[input] = value;
  }
  saveOptionsToFile(options);
}
