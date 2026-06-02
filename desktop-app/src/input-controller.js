const koffi = require('koffi');

// Load user32.dll for Windows API interaction
const user32 = koffi.load('user32.dll');

// Define necessary Windows API functions
const SetCursorPos = user32.func('int SetCursorPos(int x, int y)');
const mouse_event = user32.func('void mouse_event(int dwFlags, int dx, int dy, int dwData, void *dwExtraInfo)');
const keybd_event = user32.func('void keybd_event(uint8_t bVk, uint8_t bScan, int dwFlags, void *dwExtraInfo)');

// Windows Constants
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;

class InputController {
  constructor() {
    if (typeof window !== 'undefined' && window.screen) {
      this.screenWidth = window.screen.width;
      this.screenHeight = window.screen.height;
      console.log(`Detected screen size via window.screen: ${this.screenWidth}x${this.screenHeight}`);
    } else {
      try {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        this.screenWidth = primaryDisplay.bounds.width;
        this.screenHeight = primaryDisplay.bounds.height;
        console.log(`Detected screen size via electron.screen: ${this.screenWidth}x${this.screenHeight}`);
      } catch (e) {
        console.error('Failed to get screen size, defaulting to 1920x1080:', e);
        this.screenWidth = 1920; 
        this.screenHeight = 1080;
      }
    }
  }

  handleMouse(data) {
    const { type, relX, relY, button, delta } = data;

    // Move cursor
    if (relX !== undefined && relY !== undefined) {
      const x = Math.round(relX * this.screenWidth);
      const y = Math.round(relY * this.screenHeight);
      SetCursorPos(x, y);
    }

    if (type === 'click') {
      if (button === 'left') {
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, null);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, null);
      } else if (button === 'right') {
        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, null);
        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, null);
      }
    } else if (type === 'mousedown') {
      const flag = button === 'right' ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
      mouse_event(flag, 0, 0, 0, null);
    } else if (type === 'mouseup') {
      const flag = button === 'right' ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
      mouse_event(flag, 0, 0, 0, null);
    } else if (type === 'scroll') {
      // delta is usually 1 or -1 from mobile, Windows expects ~120 units
      mouse_event(MOUSEEVENTF_WHEEL, 0, 0, Math.round(delta * 120), null);
    }
  }

  handleKey(data) {
    const { type, key, text } = data;
    if (type === 'type') {
      if (text) {
        this.typeString(text);
      } else if (key) {
        this.simulateKey(key);
      }
    }
  }

  typeString(text) {
    const VK_SHIFT = 0x10;
    
    // Character to Virtual Key mapping (US Keyboard)
    const charToVk = {
      ' ': 0x20,
      '\n': 0x0D,
      '\r': 0x0D,
      '\t': 0x09,
      ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE, '/': 0xBF, '`': 0xC0,
      '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE
    };
    
    const shiftChars = {
      ':': 0xBA, '+': 0xBB, '<': 0xBC, '_': 0xBD, '>': 0xBE, '?': 0xBF, '~': 0xC0,
      '{': 0xDB, '|': 0xDC, '}': 0xDD, '"': 0xDE,
      '!': 0x31, '@': 0x32, '#': 0x33, '$': 0x34, '%': 0x35, '^': 0x36, '&': 0x37, '*': 0x38, '(': 0x39, ')': 0x30
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let vk = 0;
      let shift = false;
      
      if (char >= 'a' && char <= 'z') {
        vk = 0x41 + (char.charCodeAt(0) - 97);
      } else if (char >= 'A' && char <= 'Z') {
        vk = 0x41 + (char.charCodeAt(0) - 65);
        shift = true;
      } else if (char >= '0' && char <= '9') {
        vk = 0x30 + (char.charCodeAt(0) - 48);
      } else if (charToVk[char] !== undefined) {
        vk = charToVk[char];
      } else if (shiftChars[char] !== undefined) {
        vk = shiftChars[char];
        shift = true;
      }
      
      if (vk > 0) {
        if (shift) keybd_event(VK_SHIFT, 0, 0, null);
        keybd_event(vk, 0, 0, null);
        keybd_event(vk, 0, 2, null); // 2 is KEYEVENTF_KEYUP
        if (shift) keybd_event(VK_SHIFT, 0, 2, null);
      }
    }
  }

  simulateKey(key) {
    const VK_RETURN = 0x0D;
    const VK_BACK = 0x08;
    const VK_TAB = 0x09;
    const VK_ESCAPE = 0x1B;
    
    let vk = 0;
    if (key === 'Enter') vk = VK_RETURN;
    else if (key === 'Backspace') vk = VK_BACK;
    else if (key === 'Tab') vk = VK_TAB;
    else if (key === 'Escape') vk = VK_ESCAPE;
    
    if (vk > 0) {
      keybd_event(vk, 0, 0, null);
      keybd_event(vk, 0, 2, null);
    }
  }
}

module.exports = { InputController };
